## Context

Greenfield project: a personal knowledge base that uses an LLM to compile raw source documents into a persistent, cross-referenced markdown wiki. The system runs on a Raspberry Pi 4 with 2GB RAM, so all LLM computation is remote (OpenRouter API). The RPi serves a web UI (Express + React SPA) and orchestrates API calls.

No existing codebase. The project uses Node.js with TypeScript throughout, SQLite for metadata, and the filesystem for markdown content.

## Goals / Non-Goals

**Goals:**

- Compile-time knowledge synthesis (ingest-time, not query-time)
- Full provenance: every wiki claim traces back to raw sources via footnotes
- Lightweight enough for RPi 4 (2GB RAM): ~50-100MB RSS
- Self-contained single-user system with no authentication
- Three-tier lint system for wiki health maintenance
- Mobile-optimized UI

**Non-Goals:**

- Multi-user support or authentication
- Real-time collaboration
- Image/media handling (text-only wiki)
- Conversation persistence in chat
- Running LLMs locally on the RPi

## Decisions

### 1. Express + Vite SPA over Next.js

**Choice**: Separate Express backend + Vite React SPA, no SSR.
**Rationale**: Next.js RSS is ~300MB+ which exceeds RPi 2GB budget. Express + static SPA runs at ~50-100MB. Vite builds run on dev machine; only `dist/` deploys to RPi.
**Alternatives**: Next.js (too heavy), Fastify (less ecosystem support for AI SDK).

### 2. SQLite for metadata, filesystem for content

**Choice**: better-sqlite3 for structured metadata (pages, sources, links, lint). Markdown files on disk for actual content.
**Rationale**: SQLite is the lightest relational DB, ideal for RPi. Content on filesystem is inspectable, portable, and git-friendly. Separating metadata from content keeps SQLite fast for queries while content remains human-readable.
**Alternatives**: PostgreSQL (overkill for single-user), content in SQLite blobs (loses inspectability).

### 3. L1/L2 cache architecture for LLM context

**Choice**: L1 = schema.md + index.md always in system prompt (<8K tokens). L2 = full wiki pages loaded on-demand via tools or direct inclusion.
**Rationale**: Keeps base token cost low while giving the LLM a complete catalog to reason about relevance. The index summaries are enough for the LLM to decide which pages to fetch.
**Alternatives**: Full wiki in context (token budget explosion), pure vector search (loses structured cross-references).

### 4. OpenRouter with config-driven fallback

**Choice**: MiniMax M2.5 (minimax/minimax-m2.5:free) (free tier, 196K context) as primary, MiniMax M2.5 pay tier (minimax/minimax-m2.5) as fallback. Wrapper around AI SDK catches provider errors and retries with fallback.
**Rationale**: Free tier for personal use. Large context window handles big wiki pages. Fallback ensures availability when primary model is down.
**Alternatives**: Direct API calls (no fallback), single model (fragile).

### 5. Vercel AI SDK agent loop for queries

**Choice**: `streamText` with `maxSteps` and registered tools. LLM autonomously calls tools within a single streamed request.
**Rationale**: AI SDK handles the agent loop, tool calling, and SSE streaming natively. Tools expose wiki pages, backlinks, sources, and recent ingests.
**Alternatives**: Manual tool-calling loop (more code, same result), LangChain (heavier dependency).

### 6. Streamdown for all markdown rendering

**Choice**: Single renderer (Streamdown) for both streaming chat and static wiki/raw page display.
**Rationale**: Avoids maintaining two rendering pipelines. Supports remark plugins (wiki-links, GFM). Works in both streaming and static modes.
**Alternatives**: react-markdown (no streaming mode), marked (no remark plugin ecosystem).

### 7. Structured JSON output from ingest LLM

**Choice**: Ingest LLM returns structured JSON with pages array, index entries, and warnings. Backend parses and writes files/DB.
**Rationale**: Deterministic processing of LLM output. Clear contract between LLM and backend. Enables transactional writes (all-or-nothing page updates).
**Alternatives**: Streaming markdown output (harder to parse reliably), tool-calling ingest (unnecessary complexity).

## Risks / Trade-offs

- **[Free tier rate limits]** Free LLM models may have rate limits or downtime. → Mitigation: Config-driven fallback, OpenRouter's `allow_fallbacks`, and lint Tier 3 runs nightly (low frequency).
- **[Large wiki context]** As wiki grows, index.md may exceed L1 token budget. → Mitigation: Monitor index size; future option to summarize or paginate the index.
- **[LLM output quality]** Free models may produce lower-quality synthesis or miss contradictions. → Mitigation: Three-tier lint catches issues; raw sources always available for verification.
- **[RPi memory pressure]** SQLite + Express + large ingest payloads could stress 2GB. → Mitigation: better-sqlite3 is lightweight, ingest processes one source at a time, no concurrent users.
- **[Jina Reader API dependency]** URL ingestion depends on external service. → Mitigation: File upload as alternative input method; Jina is free tier with generous limits.
