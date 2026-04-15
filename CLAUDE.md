# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LLM Wiki is a knowledge base application that automatically ingests web content or uploaded markdown files and converts them into structured wiki pages using LLM agents. It consists of an Express backend (`server/`) and a React SPA (`client/`), with SQLite for persistence and a `data/` directory for file artifacts.

## Development Commands

### Server
```bash
cd server
npm run dev      # Start with tsx watch (hot-reload)
npm run build    # Compile TypeScript + copy .env and prompts to dist/
npm start        # Run compiled dist/index.js (production)
```

### Client
```bash
cd client
npm run dev      # Vite dev server (proxies /api to localhost:3005)
npm run build    # tsc + vite build to dist/
npm run preview  # Preview production build
```

### Production (PM2)
```bash
pm2 start ecosystem.config.cjs  # Runs server on port 3005
```

The server serves the client's built `dist/` as static files. In development, the client dev server proxies `/api` to port 3005.

## Architecture

### Data Flow: Ingestion Pipeline

1. **Ingest route** (`server/src/routes/ingest.ts`) accepts URL, file upload, or raw save.
2. **Jina Reader** (`server/src/services/jina.ts`) extracts markdown from URLs via the Jina API.
3. Content is stored in `raw_sources` DB table and written to `data/raw/`.
4. **Two-agent LLM pipeline** runs asynchronously (`server/src/llm/ingest.ts`):
   - **Planner agent**: reads the heading index + existing wiki, decides which pages to create/update.
   - **Writer agent**: executes the plan using `upsert_wiki_page` / `report_warning` tools.
5. Post-ingest cleanup regenerates `data/index.md` and runs Tier 1 lint.

### LLM Client (`server/src/llm/client.ts`)

`LLMClient` wraps the Vercel AI SDK with primary/fallback model support using `ToolLoopAgent` for agentic calls. Models are configured in `server/src/llm/config.ts` via `OPENROUTER_API_KEY`. The ingest writer and chat query use specific per-call model overrides (OpenRouter Gemini Flash Lite).

### Database Schema (`server/src/db/schema.ts`)

SQLite via `better-sqlite3`, stored at `data/llm-wiki.db`. Key tables:
- `raw_sources` — ingested source content with SHA-256 deduplication
- `wiki_pages` — slug (kebab-case, English), title (Spanish), content (markdown), type, status, tags
- `page_sources` — many-to-many join between pages and their raw sources
- `wiki_links` — extracted `[[slug]]` cross-references for backlink/graph queries
- `lint_warnings` — issues from deterministic and LLM lint runs

### Wiki Page Content Conventions

Pages are written in **Spanish**. Slugs are English kebab-case (max 60 chars). Cross-references use `[[slug]]` syntax. Citations link to raw sources as `[1](/raw/{id})` or with heading anchors `[1](/raw/{id}#fragment)`.

### Lint System

- **Tier 1** (`server/src/services/lint-deterministic.ts`): Runs synchronously after each ingest. Checks for broken links, orphan pages, invalid metadata.
- **Tier 3** (`server/src/llm/lint.ts`): LLM-based semantic audit, scheduled nightly at 2 AM via `node-cron`.

### Chat / Query (`server/src/llm/query.ts`)

Streamed RAG-style chat using tools (`server/src/llm/tools.ts`) to look up wiki pages. The system prompt and schema are loaded from `server/src/llm/prompts/`.

### Client Routes (`client/src/App.tsx`)

| Path | Page |
|------|------|
| `/` | Wiki page list |
| `/wiki/:slug` | Wiki page detail |
| `/ingest` | Ingest form (URL, upload, or paste) |
| `/chat` | Chat interface |
| `/raw/:id` | Raw source viewer |
| `/graph` | Force-directed wiki link graph |
| `/dashboard` | Lint warnings and system stats |

## Environment Variables

Server reads from `.env` (not committed). Required:
- `OPENROUTER_API_KEY` — used for all LLM calls (primary and fallback models)
- `JINA_API_KEY` — optional; Jina URL extraction works without it but with rate limits
- `DEBUG_ENABLED=1` — enables verbose LLM step logging

## Key Conventions

- All server source files use ES modules (`"type": "module"`) with explicit `.js` extensions in imports (TypeScript transpiles to JS).
- Prompt templates live in `server/src/llm/prompts/*.md` and are loaded at runtime; the build step copies them to `dist/llm/prompts/`.
- `data/` directory (DB, raw files, wiki markdown, logs) is gitignored and created at startup.
