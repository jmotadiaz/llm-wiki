## 1. Schema y tipos de página

- [x] 1.1 Añadir `domain-index` y `learning-path` como valores válidos de `type` en `wiki_pages` (documentar en schema.ts y schema.md)
- [x] 1.2 Convertir la sección Tag Taxonomy de `schema.md` de lista cerrada a lista inspiracional (cambiar redacción normativa a guía)
- [x] 1.3 Añadir columna `generated_at` a `wiki_pages` (migración en `schema.ts`) para páginas generadas por el index agent

## 2. Index Agent — core

- [x] 2.1 Crear `server/src/llm/index.ts` con la función `runIndexAgent(domain?: string)`
- [x] 2.2 Implementar lógica de descubrimiento de dominios por tag co-occurrence: agrupar páginas por tags, identificar tags fundadores vs transversales, aplicar umbral mínimo de 5 páginas
- [x] 2.3 Implementar ordenación de learning path: calcular inbound link count por página desde `wiki_links`, combinar con depth tags para asignar stages
- [x] 2.4 Crear `server/src/llm/prompts/index-domain.md` — prompt del agente para generar `domain-index`
- [x] 2.5 Crear `server/src/llm/prompts/index-learning-path.md` — prompt del agente para generar `learning-path`
- [x] 2.6 Exponer tools al index agent: `upsert_wiki_page` (existente), `get_wiki_index` (existente o nuevo), `get_backlinks` (existente o nuevo)
- [x] 2.7 Escribir `generated_at` al hacer upsert de páginas de tipo index

## 3. Index Agent — endpoint y cron

- [x] 3.1 Crear `server/src/routes/index-agent.ts` con `POST /api/index/generate` (parámetro opcional `domain`)
- [x] 3.2 Registrar la ruta en `server/src/index.ts`
- [x] 3.3 Añadir schedule nocturno del index agent en `server/src/index.ts` via `node-cron` (hora diferente al lint Tier 3 para evitar solapamiento)

## 4. Review Agent — bifurcación por type

- [x] 4.1 Extender `POST /api/review` (o su handler) para aceptar parámetro `type`
- [x] 4.2 Crear `server/src/llm/prompts/review-domain-index.md` — system prompt para revisión de `domain-index`
- [x] 4.3 Crear `server/src/llm/prompts/review-learning-path.md` — system prompt para revisión de `learning-path`
- [x] 4.4 Implementar selección de configuración en el handler: prompt + tools según `type` (`concept/technique/reference` → existente; `domain-index` → prompt + get_wiki_index; `learning-path` → prompt + get_wiki_index + get_backlinks)
- [x] 4.5 Validar que `type` sea un valor reconocido; retornar 400 si no lo es

## 5. API — filtros de listado

- [x] 5.1 Filtrar `type IN ('domain-index', 'learning-path')` en el endpoint que sirve el listado de páginas para el tab "Páginas" (`GET /api/pages` o equivalente)
- [x] 5.2 Añadir endpoint `GET /api/domain-indexes` que retorna páginas con `type = 'domain-index'`
- [x] 5.3 Añadir endpoint `GET /api/learning-paths` que retorna páginas con `type = 'learning-path'`
- [x] 5.4 Filtrar `type IN ('domain-index', 'learning-path')` en la selección de contexto RAG del chat query agent

## 6. Cliente — tabs en home

- [x] 6.1 Añadir componente de tabs a la home (`client/src/pages/Home.tsx` o equivalente) con tres tabs: "Páginas", "Dominios", "Learning Paths"
- [x] 6.2 Implementar tab "Dominios": lista de domain-index pages con título, excerpt de descripción y `generated_at`
- [x] 6.3 Implementar tab "Learning Paths": lista de learning-path pages con título, dominio y `generated_at`
- [x] 6.4 Añadir botón "Regenerar todo" en tabs Dominios y Learning Paths (llama a `POST /api/index/generate` sin params)

## 7. Cliente — página de detalle de index pages

- [x] 7.1 Mostrar `generated_at` en el header de páginas con `type IN ('domain-index', 'learning-path')` al renderizarlas en `/wiki/:slug`
- [x] 7.2 Añadir botón "Regenerar" en el detalle de domain-index y learning-path pages (llama a `POST /api/index/generate` con `{ domain }` extraído del slug)
- [x] 7.3 Asegurar que el componente de feedback (page_comments) funciona en páginas de tipo index (debería ser automático si la infraestructura es la misma)

## 8. Pivot: sistema de prefijos en tags (`d:` / `t:` / `a:`)

Motivación: el modelo de tags sin prefijo produce discovery de dominios pobre (ver [data/index.md](../../../data/index.md) tras la primera ingesta). Se pasa a tres clases explícitas con contrato validado en `upsert_wiki_page`.

### 8.1 Schema y prompts

- [x] 8.1.1 Reescribir la sección Tag Taxonomy de `server/src/llm/prompts/schema.md` con las tres clases, regex y contrato de cardinalidad
- [x] 8.1.2 Actualizar `server/src/llm/prompts/ingest-planner.md`: inyectar la lista de `d:` actuales con count y enseñar el contrato de asignación
- [x] 8.1.3 Actualizar `server/src/llm/prompts/ingest-writer.md` para propagar el contrato al writer
- [x] 8.1.4 Actualizar `server/src/llm/prompts/reviewer.md`, `review-domain-index.md` y `review-learning-path.md` para respetar el contrato al editar tags
- [x] 8.1.5 Actualizar `server/src/llm/prompts/index-domain.md` e `index-learning-path.md` para no mutar tags de páginas clusterizadas y para tagear las páginas generadas con `d:<domain>`, `t:index`, `a:...`

### 8.2 Validación en el tool

- [x] 8.2.1 Implementar validador puro `validateTagContract(tags: string[])` con cobertura de los cinco escenarios del spec
- [x] 8.2.2 Conectar el validador a `upsert_wiki_page` (ingest, index y review tool sets)
- [x] 8.2.3 Formatear los errores de validación para que el loop del agente pueda reintentar (mensaje claro, no excepción opaca)

### 8.3 Discovery simplificado

- [x] 8.3.1 Reescribir `server/src/llm/domain-discovery.ts`: `disciplines = uniq(tags.filter(t => t.startsWith('d:')))`, eliminar `TRANSVERSAL_TAGS` y `TRANSVERSAL_FRACTION`
- [x] 8.3.2 `assignLearningStages` agrupa primero por `t:` dentro del dominio y luego ordena cada grupo por `inboundLinks`, con `a:fundamentals` / `a:advanced` como tiebreakers
- [x] 8.3.3 La sección "Relacionado" del domain-index se construye por intersección de `t:` tags entre dominios

### 8.4 UI

- [x] 8.4.1 Helper `displayTag(raw)` que devuelve `{ label, role: 'discipline' | 'topic' | 'axis' }`
- [x] 8.4.2 Estilado de chips diferenciado por rol en `WikiPage.tsx` y `WikiPageDetail.tsx`
- [x] 8.4.3 Filtro primario por `d:` (dropdown) y filtro secundario por `t:` (chips multi-select) en el tab Páginas de la home

### 8.5 Reset de datos

- [x] 8.5.1 Verificar backup en `data-bk/` (ya existe)
- [x] 8.5.2 Vaciar `data/llm-wiki.db` y `data/raw/`
- [x] 8.5.3 Re-ingest completo de las fuentes con el nuevo modelo
- [ ] 8.5.4 Smoke test: todos los `upsert_wiki_page` del primer ingest pasan validación
- [ ] 8.5.5 Primer run manual del index agent una vez haya ≥5 páginas en al menos una `d:`
