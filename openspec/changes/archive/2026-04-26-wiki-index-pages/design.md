## Context

La wiki tiene 100+ páginas agrupables en ~4 dominios naturales (AI agents, testing, NLP, ML) identificables por co-ocurrencia de tags. Actualmente el schema define `type: index` en `wiki_pages` pero no existe ningún mecanismo que genere páginas de ese tipo. El ingest pipeline (planner + writer) solo crea páginas `concept`, `technique` y `reference`.

La infraestructura existente relevante:
- `wiki_pages` (SQLite): slug, title, content markdown, type, tags, status
- `wiki_links`: grafo de backlinks extraído de `[[slug]]` — captura relaciones entre páginas
- `page_comments`: sistema de feedback con lifecycle (pending → processing → answered)
- `node-cron`: ya usado para el lint Tier 3 nocturno
- `LLMClient` / `ToolLoopAgent` (Vercel AI SDK): patrón establecido para agentes con tools

## Goals / Non-Goals

**Goals:**
- Generación automática de páginas `domain-index` y `learning-path` por dominio descubierto
- Descubrimiento de dominios sin configuración manual (basado en tag co-occurrence)
- Tags como lista abierta (ingest agent e index agent pueden crear nuevos tags)
- Review con system prompt diferenciado por tipo de página
- UI con tabs Dominios y Learning Paths en la home, triggers de regeneración on-demand
- Regeneración nocturna vía cron

**Non-Goals:**
- Tracking de progreso del lector (leer/no leer por página)
- Edición manual de learning paths desde la UI (el feedback se canaliza por page_comments)
- Soporte multi-idioma en slugs de dominios
- Indexación de páginas con status `draft`

## Decisions

### D1: Storage en wiki_pages, no en tablas separadas

Los artefactos `domain-index` y `learning-path` se almacenan en `wiki_pages` con nuevos valores de `type`. Alternativa rechazada: tablas `domain_overviews` y `learning_paths` separadas.

**Rationale:** heredan gratis la infraestructura de `page_comments` (feedback), `wiki_links` (backlinks y grafo), `lint_warnings`, y el routing existente `/wiki/:slug`. El contenido es markdown idéntico al resto — no hay datos estructurados que justifiquen un schema propio. Añadir tablas solo duplicaría infraestructura.

### D2: Contenido 100% markdown con estructura en headings

La estructura interna (stages de un learning path, secciones de un domain-index) vive en el heading hierarchy del markdown, no en columnas adicionales o JSON embebido.

**Rationale:** el LLM escribe mejor prosa en markdown que en JSON. El review agent puede editar con `upsert_wiki_page` sin parsear estructuras. Los `[[slug]]` se extraen automáticamente a `wiki_links`. Alternativa rechazada: columna `metadata JSON` adicional — añade complejidad de sincronización entre contenido y metadata.

### D3: Index agent separado del ingest planner

El ingest planner no genera ni actualiza páginas `domain-index` o `learning-path`. Un agente independiente tiene esa responsabilidad.

**Rationale:** el planner ve una fuente a la vez y no tiene visión del cluster completo. Los índices requieren análisis global de la wiki (todos los tags, todo el grafo de links). Mezclar responsabilidades complicaría el planner y generaría índices prematuros (creados cuando solo existen 3 de 20 páginas de un dominio).

### D4: Descubrimiento de dominios por prefijo `d:`

El index agent identifica dominios filtrando tags por el prefijo `d:` (ver D7). Cada `d:` único que aparezca en al menos 5 páginas publicadas funda un dominio. Las páginas del dominio son exactamente las que llevan ese `d:`. La sección "Relacionado" del domain-index se rellena con páginas de otros dominios que comparten algún `t:` con las del dominio actual.

**Rationale:** con el prefijo, el descubrimiento es determinista y barato (`SELECT DISTINCT` sobre los tags que empiezan por `d:`). El threshold de 5 páginas sigue vigente como gate de densidad — una `d:` con 2 páginas no justifica aún un domain-index. Alternativas rechazadas: (a) co-ocurrencia estructural — frágil contra drift del LLM y no-determinista entre runs; (b) count-based promotion sobre tags sin prefijo — duplica la decisión que el prefijo ya expresa y no resuelve la ambigüedad semántica entre disciplina y tema popular.

### D5: Review endpoint con bifurcación por type

`POST /api/review` recibe el parámetro `type` de la página y selecciona la configuración del agente (system prompt + tools disponibles). Mismo endpoint, mismo lifecycle de comentarios.

**Rationale:** unifica la infraestructura (un solo endpoint, un solo flujo de comentarios) mientras permite comportamiento diferenciado. Para `domain-index` y `learning-path` el agente necesita `get_wiki_index` y opcionalmente `get_backlinks` para razonar sobre qué páginas incluir o reorganizar. Alternativa rechazada: agente review separado por tipo — duplica el lifecycle de comentarios y complejiza el routing.

### D6: Pertenencia múltiple de páginas vía topics compartidos

Una página vive en exactamente un `domain-index` (el de su `d:` único), pero puede aparecer en la sección "Relacionado" de otros domain-index cuando comparte topics (`t:`) con páginas de esos dominios. Lo mismo aplica a `learning-path`: nativamente en uno, referenciada en otros cuando hay conexión temática.

**Rationale:** páginas como `agent-self-verification` son fundamentalmente *de* AI Agents (`d:ai-agents`) aunque inviten la lectura desde testing. Forzar al LLM a declarar UN campo primario produce contenido mejor tagueado que permitir multi-discipline por defecto (el LLM tiende a ser excesivamente inclusivo cuando se le da opcionalidad). La multi-pertenencia emerge naturalmente del cruce de `t:` entre dominios, sin necesidad de multi-`d:`.

### D7: Prefijos de rol obligatorios en tags (`d:` / `t:` / `a:`)

Cada tag en `wiki_pages.tags` lleva un prefijo que declara su rol semántico:

- `d:<slug>` — **discipline**. Campo al que pertenece la página. Exactamente UNO por página.
- `t:<slug>` — **topic**. Concepto, patrón o técnica específica que la página invoca. Al menos uno por página; típicamente 1-3.
- `a:<slug>` — **axis**. Meta-clasificación modal (depth/practical/content). Cero o más, dibujados de una whitelist cerrada (`a:fundamentals`, `a:advanced`, `a:research`, `a:implementation`, `a:troubleshooting`, `a:performance`, `a:tutorial`, `a:theory`, `a:case-study`, `a:tool`, `a:standard`).

**Rationale:** sin declaración explícita, el LLM recibe instrucciones contradictorias en un único eje de tags ("sé discriminativo *y* reutilizable") y ninguna clasificación a posteriori es determinista — ni el count, ni la co-occurrence, ni los heurísticos estructurales distinguen de forma fiable disciplina de tema popular. El prefijo es el encoding más frugal: vive dentro del dato (no requiere columna, tabla ni tag_metadata externo), es visible en todo sitio donde se lee el index (lo que refuerza el patrón para el LLM en cada prompt), y reduce el descubrimiento de dominios a un `startsWith('d:')`. Alternativas rechazadas: columna `discipline TEXT` separada (duplica la información que ya cabe en tags), tabla `tag_metadata` (overhead de sincronización), heurística de co-occurrence (D4 alternativa).

**Enforcement:** `upsert_wiki_page` valida en cada llamada que la lista de tags cumpla el contrato:
- Cada tag matchea `^(d|t|a):[a-z0-9]+(-[a-z0-9]+)*$`
- Exactamente un tag con `d:`
- Al menos un tag con `t:`
- Todo tag con `a:` está en la whitelist cerrada

Las violaciones se devuelven al loop del agente como errores recuperables para retry.

## Risks / Trade-offs

**[Tags abiertos → fragmentación semántica]** → El index agent canonicaliza tags similares antes de agrupar (e.g., `harness` y `harness-engineering` deben colapsar). El prompt del index agent incluye instrucciones explícitas de normalización.

**[Índices desactualizados entre runs de cron]** → Los índices son best-effort snapshots. El trigger on-demand desde la UI permite forzar regeneración cuando el usuario detecta desactualización. Se muestra `generated_at` en la UI.

**[LLM ordering del learning path puede ser subóptimo]** → El agente recibe señales de `wiki_links` (inbound count) y depth tags para fundamentar el orden, pero el usuario puede corregirlo vía feedback. El sistema es iterativo, no tiene que ser perfecto en la primera generación.

**[Domain-index y learning-path aparecen en búsqueda/chat RAG]** → El query agent usa `wiki_pages` para RAG. Las páginas de tipo index contienen listas de links, no conocimiento denso — pueden degradar la calidad del RAG. Mitigación: filtrar `type IN ('domain-index', 'learning-path')` en el query agent al seleccionar páginas para contexto.

## Migration Plan

El change arranca desde cero — no hay migración de datos ni soporte de tags antiguos sin prefijo.

1. Reescritura de prompts (`schema.md`, `ingest-planner.md`, `ingest-writer.md`, review prompts, index prompts) con el contrato de tags prefijados
2. Implementación de validación en `upsert_wiki_page`
3. Simplificación de `domain-discovery.ts` a filtrado por prefijo
4. UI: helper de render que strip-ea prefijos y estiliza chips por clase; filtros de home por `d:` y `t:`
5. **Wipe de datos**: backup de `data/` (ya existe `data-bk/`) y vaciado de `data/llm-wiki.db` + `data/raw/`
6. Re-ingest completo de las fuentes con el nuevo modelo
7. Primer run manual del index agent una vez haya ≥5 páginas en al menos una `d:`
8. Activación del cron nocturno
9. Deploy del cliente con tabs Dominios y Learning Paths

Rollback: restaurar `data-bk/` como `data/` y revertir el commit del change.

## Open Questions

- ¿Cuál es el modelo LLM para el index agent? El presupuesto de tokens es mayor que el del ingest writer (necesita leer el índice completo). ¿Gemini Flash o Flash Lite?
- ¿El cron del index agent corre antes o después del lint Tier 3 (2 AM)? Podrían solaparse si ambos leen la DB intensamente.
- ¿Los `domain-index` y `learning-path` deben aparecer en el grafo de `/graph`? Son nodos con muchos outbound links — pueden distorsionar la visualización.
