## Why

Build a personal knowledge base that compiles raw source documents into a cross-referenced markdown wiki using an LLM at ingest time (not query time). This follows Karpathy's "LLM Wiki" pattern: instead of RAG re-deriving answers from raw docs each request, the LLM incrementally maintains a persistent, linked wiki. Self-hosted on a Raspberry Pi 4 (2GB RAM), single user, web-based.

## What Changes

- New Express.js backend serving a REST API and SSE streaming for chat
- New Vite + React SPA with four views: Ingest, Chat, Wiki Browser, Dashboard
- SQLite database for metadata (raw_sources, wiki_pages, page_sources, wiki_links, lint_warnings)
- Markdown files on filesystem for raw sources and wiki pages
- LLM ingest pipeline: raw source -> LLM compiles/updates wiki pages with cross-references and footnotes
- LLM query agent: chat interface with tool-calling to retrieve wiki pages, backlinks, sources
- Three-tier lint system: deterministic (Tier 1), semantic-local (Tier 2), semantic-global (Tier 3)
- URL-to-markdown ingestion via Jina Reader API
- Interactive force-directed graph visualization of wiki link structure
- Config-driven LLM model fallback (minimax/minimax-m2.5:free primary, minimax/minimax-m2.5 fallback) via OpenRouter

## Capabilities

### New Capabilities

- `raw-source-ingestion`: File upload and URL-based ingestion of raw markdown sources, with Jina Reader API integration for URL-to-markdown conversion
- `wiki-compilation`: LLM-powered compilation of raw sources into cross-referenced wiki pages with `[[wiki-links]]` and `[^raw-{id}]` footnotes
- `wiki-browser`: Web UI for browsing wiki pages (index, individual pages, raw sources) with rendered markdown, backlinks panel, and link graph
- `chat-query`: Stateless chat interface with LLM agent loop using tools to query compiled wiki knowledge via SSE streaming
- `lint-system`: Three-tier wiki health system: deterministic checks (Tier 1), ingest-piggybacked semantic checks (Tier 2), cron-based global semantic audit (Tier 3)
- `dashboard`: Wiki health dashboard showing orphan pages, stale pages, broken links, missing pages, and lint warnings

### Modified Capabilities

## Impact

- **New dependencies**: Express.js, React, Vite, Tailwind CSS, better-sqlite3, Vercel AI SDK, @openrouter/ai-sdk-provider, Streamdown, react-force-graph-2d, react-router-dom, remark-wiki-link, remark-gfm
- **External APIs**: OpenRouter (LLM), Jina Reader (URL-to-markdown)
- **Filesystem**: Creates `data/` directory tree for raw sources, wiki pages, SQLite DB, and operational files
- **Hardware**: Designed for Raspberry Pi 4 (2GB RAM) — all LLM computation is remote, RPi only serves web UI and orchestrates API calls
