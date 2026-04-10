## 1. Project Setup

- [x] 1.1 Initialize Node.js project with TypeScript config (tsconfig.json, package.json with workspaces or single package)
- [x] 1.2 Set up Vite as build tool for React + Tailwind CSS in `client/` with TypeScript (Vite is build-only, not a dev server)
- [x] 1.3 Set up Express.js server in `server/` with TypeScript (tsx for dev). Express serves the Vite `dist/` output as static files and exposes API routes
- [x] 1.4 Create `data/` directory structure (raw/, wiki/, schema.md, index.md, log.md, lint-queue.json)
- [x] 1.6 Add .gitignore for data/raw/, data/wiki/, data/llm-wiki.db

## 2. Database

- [x] 2.1 Install better-sqlite3 and set up database initialization in `server/db/schema.ts`
- [x] 2.2 Create tables: raw_sources, wiki_pages, page_sources, wiki_links, lint_warnings
- [x] 2.3 Implement prepared query helpers in `server/db/queries.ts`

## 3. Raw Source Ingestion Backend

- [x] 3.1 Implement Jina Reader API client in `server/services/jina.ts` (POST with noise removal config, target selector support)
- [x] 3.2 Create POST `/api/ingest/url` route: accept URL + optional CSS selector, call Jina, return preview JSON (**NOTE: returns only content — see task 15.3 for metadata enhancement**)
- [x] 3.3 Create POST `/api/ingest/save` route: accept title, author, content; save markdown to `data/raw/`, insert into raw_sources with SHA-256 checksum (**NOTE: missing description, publishedAt, sourceUrl — see task 15.5**)
- [x] 3.4 Add duplicate detection via checksum comparison before saving
- [x] 3.5 Create POST `/api/ingest/upload` route: accept .md file upload with title and author fields

## 4. LLM Integration

- [x] 4.1 Set up OpenRouter provider in `server/llm/config.ts` with primary (minimax/minimax-m2.5:free) and fallback (minimax/minimax-m2.5) models
- [x] 4.2 Implement streamText/generateText wrapper with automatic fallback retry in `server/llm/client.ts`. use `ai-sdk` skill
- [x] 4.3 Create initial `data/schema.md` with wiki structure rules, page types, tag conventions, formatting rules. Use `senior-prompt-engineer` skill

## 5. Wiki Compilation Pipeline

- [x] 5.1 Write ingest system prompt (in separate file) instructing LLM to return structured JSON with pages, index_entries, warnings
- [x] 5.2 Implement ingest pipeline in `server/llm/ingest.ts`: send L1 context + raw source to LLM, parse structured JSON response
- [x] 5.3 Implement backend post-processing: write wiki pages to disk, update wiki_pages/page_sources/wiki_links in SQLite, merge index.md entries
- [x] 5.4 Wire ingest pipeline into save/upload routes (trigger after raw source is saved)

## 6. Tier 1 Deterministic Lint

- [x] 6.1 Implement lint checks in `server/services/lint-deterministic.ts`: broken links, orphan pages, stale pages, missing pages, metadata validation
- [x] 6.2 Store lint results in lint_warnings table and lint-queue.json
- [x] 6.3 Run Tier 1 lint after each ingest on affected pages

## 7. Chat Query Backend

- [x] 7.1 Define agent tools in `server/llm/tools.ts`: get_wiki_pages, get_backlinks, get_page_sources, get_recent_ingests
- [x] 7.2 Write query system prompt (in separate file) with L1 context injection instructions
- [x] 7.3 Implement query agent loop in `server/llm/query.ts` using streamText with maxSteps and tool definitions
- [x] 7.4 Create POST `/api/chat` route with SSE streaming response

## 8. Wiki API Routes

- [x] 8.1 Create GET `/api/wiki` route: return parsed index.md data (all pages with metadata)
- [x] 8.2 Create GET `/api/wiki/:slug` route: return wiki page content + metadata + backlinks + lint status
- [x] 8.3 Create GET `/api/raw/:id` route: return raw source content + metadata
- [x] 8.4 Create GET `/api/graph` route: return nodes (wiki pages) and edges (wiki_links) for graph visualization
- [x] 8.5 Create GET `/api/lint/status` route: return lint warnings summary and last run timestamps
- [x] 8.6 Create POST `/api/lint` route: trigger manual Tier 3 audit

## 9. Tier 3 Semantic Lint

- [x] 9.1 Write Tier 3 system prompt (in separate file) for global contradiction/duplication audit
- [x] 9.2 Implement Tier 3 lint in `server/llm/lint.ts`: send index + lint-queue to LLM, retrieve flagged pages, verify, store findings
- [x] 9.3 Append Tier 3 results to log.md

## 10. Frontend - SPA Shell and Routing

- [x] 10.1 Set up react-router-dom with routes: /, /ingest, /chat, /wiki, /wiki/:slug, /raw/:id, /graph, /dashboard
- [x] 10.2 Create shared layout component with navigation between all views
- [x] 10.3 Install and configure Streamdown with remark-wiki-link and remark-gfm plugins

## 11. Frontend - Ingest View

- [x] 11.1 Build URL input form with optional CSS selector field and "Generate" button
- [x] 11.2 Build markdown preview/editor with lightweight editor (react-textarea-code-editor or @uiw/react-md-editor)
- [x] 11.3 Build file upload form with title and author fields
- [x] 11.4 Wire up two-step URL flow: fetch preview -> edit -> save
- [x] 11.5 Show ingest status/progress and LLM compilation results

## 12. Frontend - Chat View

- [x] 12.1 Implement chat interface using Vercel AI SDK useChat hook connected to POST /api/chat
- [x] 12.2 Render streamed responses with Streamdown (streaming mode) and remark-wiki-link for clickable references

## 13. Frontend - Wiki Browser

- [x] 13.1 Build wiki index page: fetch /api/wiki, display pages grouped by tags with search/filter
- [x] 13.2 Build wiki page view: fetch /api/wiki/:slug, render with Streamdown (static mode), backlinks panel, lint badge
- [x] 13.3 Build raw source view: fetch /api/raw/:id, render with Streamdown (static mode)
- [x] 13.4 Build graph view with react-force-graph-2d: fetch /api/graph, render interactive force-directed graph with click-to-navigate

## 15. URL Ingestion Metadata Enhancement

- [x] 15.1 Add `description` (TEXT, nullable) and `published_at` (TEXT, nullable) columns to `raw_sources` table in `server/src/db/schema.ts` via ALTER TABLE migration
- [x] 15.2 Update `JinaResponse` interface in `server/src/services/jina.ts` to include `data.description`, `data.publishedTime`, and `data.metadata.author`. Change `extractUrl()` return type from `string` to a structured object `{ title, description, content, publishedTime, author }`
- [x] 15.3 Update `POST /api/ingest/url` route in `server/src/routes/ingest.ts` to return the structured Jina response: `{ success, data: { title, description, content, publishedTime, author } }` instead of just content
- [x] 15.4 Update `insertRawSource` in `server/src/db/queries.ts` to accept and store `description`, `published_at`, and `source_url` fields
- [x] 15.5 Update `POST /api/ingest/save` route to accept `description`, `publishedAt`, and `sourceUrl` from request body, and pass them to `insertRawSource`
- [x] 15.6 Update `IngestPage.tsx` form: add `description` (text input) and `publishedAt` (date input) state/fields. Pre-fill all fields (title, description, author, publishedAt, content) from the `/api/ingest/url` response
- [x] 15.7 Update `handleSave` in `IngestPage.tsx` to send `description`, `publishedAt`, and `sourceUrl` (the original URL) in the save request body

## 16. Ingest Pipeline Observability & Fixes

- [x] 16.1 Add `[INGEST]` logs in `ingestRawSource()` (`server/src/llm/ingest.ts`): log pipeline start with raw-{id} and content length, log L1 context loaded (page count, schema size)
- [x] 16.2 Add `[INGEST]` logs in `callIngestLLM()`: log LLM call start (model name), log raw response received (length + first 500 chars), log parsed result (page count, index_entries count, warnings count)
- [x] 16.3 On JSON parse failure in `callIngestLLM()`, log the first 1000 chars of the raw LLM response before throwing, so format issues are debuggable
- [x] 16.4 Inject actual `rawSourceId` into the ingest system prompt, replacing `RAW_ID` placeholder so the LLM produces correct `[^raw-{id}]` footnotes. Pass `rawSourceId` from `ingestRawSource` → `callIngestLLM`
- [x] 16.5 Add `[INGEST]` logs in `postProcessIngest()` (`server/src/llm/post-process.ts`): log post-process start (page count), log each page write (slug, create vs update), log completion
- [x] 16.6 In `triggerIngest()` (`server/src/routes/ingest.ts`), log pipeline start and ensure errors include full stack trace (`error.stack` not just `error.message`)

## 18. Structured Output via AI SDK

- [x] 18.1 Add `generateStructured<T>(options)` method to `LLMClient` in `server/src/llm/client.ts`: uses `generateObject` from AI SDK v3 with Zod schema, same primary/fallback retry logic as `generate()`. Returns `z.infer<T>` directly
- [x] 18.2 Define `IngestResultSchema` with Zod in `server/src/llm/ingest.ts` as single source of truth for types (`IngestPage`, `IngestIndexEntry`, `IngestWarning`, `IngestResult` via `z.infer`)
- [x] 18.3 Replace manual JSON extraction/sanitization/parsing in `callIngestLLM()` with `llmClient.generateStructured({ schema: IngestResultSchema, ... })`. Remove ~60 lines of code block detection, brace extraction, control char sanitization, and manual `JSON.parse`

## 17. Wiki Language — Spanish with English Technical Terms

- [x] 17.1 Update `data/schema.md`: add a "Language Policy" section specifying that all wiki content must be in Spanish, with standard technical terms kept in English. Update section heading examples (Definición, Principios Clave, Ejemplos, Conceptos Relacionados, Errores Comunes, Fuentes y Notas). Update the complete page example to Spanish
- [x] 17.2 Update `server/src/llm/prompts/ingest-system.txt`: add explicit language instructions — "Write all content in Spanish. Keep standard technical terms in English (prompt engineering, fine-tuning, RAG, token, LLM, API, etc.). Section headings in Spanish. Slugs and tags remain in English." Update the example output to show Spanish content
- [x] 17.3 Update query system prompt (`server/src/llm/prompts/query-system.txt` or equivalent): instruct the chat agent to respond in Spanish following the same language policy

## 19. Dependency Migration: AI SDK v6, Express v5, TypeScript v6

- [x] 19.1 Update `ai` from v3.4 to v6.0: `generateObject` → `generateText` + `Output.object()`, `CoreMessage` → `ModelMessage`, `maxTokens` → `maxOutputTokens`, `streamText` no longer returns Promise, `tool({ parameters })` → `tool({ inputSchema })`, `maxSteps` → `stopWhen: stepCountIs(n)`, `pipeDataStreamToResponse` → `pipeTextStreamToResponse`
- [x] 19.2 Update `@openrouter/ai-sdk-provider` from v0.0.6 to v2.5.1 (required for ai v6 compatibility)
- [x] 19.3 Install `@ai-sdk/react` as explicit client dependency (useChat moved from `ai/react` to `@ai-sdk/react`)
- [x] 19.4 Migrate `useChat` in `ChatPage.tsx`: `input/handleInputChange/handleSubmit` → `useState` + `sendMessage()`, `api` → `transport: new DefaultChatTransport({ api })`, `isLoading` → `status`, `m.content` → `m.parts`
- [x] 19.5 Update `express` from v4 to v5: wildcard route `'*'` → `'{*splat}'`, error handler needs 4 params `(err, req, res, next)`, `req.params` type is `string | string[]` (cast needed)
- [x] 19.6 Update `@types/express` from v4 to v5
- [x] 19.7 Update `typescript` from v5 to v6. Add `vite-env.d.ts` for CSS module declarations. Disable `declaration`/`declarationMap` in server tsconfig (not needed for app)

## 14. Frontend - Dashboard

- [x] 14.1 Build dashboard page: fetch /api/lint/status, display health metrics (orphan, stale, broken, missing counts)
- [x] 14.2 Display individual lint warnings list with type filter
- [x] 14.3 Add "Run Semantic Audit" button triggering POST /api/lint with progress indicator
- [x] 14.4 Show last lint run timestamps
