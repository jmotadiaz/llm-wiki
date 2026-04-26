## Why

La wiki acumula páginas de concepto de forma orgánica pero carece de artefactos de navegación que ayuden al lector a orientarse dentro de un dominio o a trazar un camino de aprendizaje progresivo. Con más de 100 páginas distribuidas en clusters temáticos (AI agents, testing, NLP, ML), la wiki pierde utilidad pedagógica sin índices que organicen ese conocimiento.

## What Changes

- Dos nuevos tipos de página wiki: `domain-index` (mapa de un dominio temático) y `learning-path` (secuencia ordenada de aprendizaje)
- Nuevo agente LLM (`index agent`) que descubre dominios por co-ocurrencia de tags y genera ambos tipos de artefacto
- Los tags adoptan un sistema de prefijos con tres clases explícitas: `d:` (discipline, exactamente una por página), `t:` (topic, ≥1 por página) y `a:` (axis, lista cerrada de depth/practical/content). El schema documenta el contrato y todo el pipeline (ingest, index, review) lo respeta. `upsert_wiki_page` valida en cada llamada
- La wiki arranca desde cero con el nuevo modelo de tags: no hay migración de datos existentes
- Endpoint de review extendido con parámetro `type` para configurar el agente de revisión según el tipo de página
- UI: tres tabs en la home (`/`) — Páginas, Dominios, Learning Paths — con triggers de regeneración global y por artefacto
- Cron nocturno para regeneración automática de índices

## Capabilities

### New Capabilities

- `index-agent`: Agente LLM periódico que analiza la wiki completa, descubre dominios por co-ocurrencia de tags y genera/actualiza páginas `domain-index` y `learning-path`
- `wiki-index-pages`: Nuevos tipos de página (`domain-index`, `learning-path`) con estructura de contenido markdown definida, almacenados en `wiki_pages` como el resto
- `index-ui`: Tabs en la home para navegar dominios y learning paths, con triggers de regeneración on-demand

### Modified Capabilities

- `review-agent`: El endpoint de review recibe `type` como parámetro y configura system prompt y tools según el tipo de página (`concept`/`technique`/`reference` vs `domain-index` vs `learning-path`)

## Impact

- `server/src/llm/` — nuevo agente `index.ts` con sus prompts en `prompts/`
- `server/src/routes/` — nuevo endpoint `POST /api/index/generate` (trigger on-demand); extensión de `POST /api/review` con parámetro `type`
- `server/src/llm/prompts/schema.md` — reescritura completa de la sección Tag Taxonomy con las tres clases prefijadas, contrato de cardinalidad y whitelist de axis
- `server/src/llm/prompts/ingest-planner.md`, `ingest-writer.md`, `review-domain-index.md`, `review-learning-path.md`, `reviewer.md` — propagar el contrato de tags
- Validación de tags en `upsert_wiki_page` (regex, cardinalidad, axis whitelist)
- `client/src/App.tsx` y componentes home — tabs Dominios y Learning Paths
- `server/src/db/schema.ts` — nuevos valores de `type` en `wiki_pages` (`domain-index`, `learning-path`)
- Cron schedule en el servidor (nightly)
