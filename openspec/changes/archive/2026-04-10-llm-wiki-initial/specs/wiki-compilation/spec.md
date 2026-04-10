## ADDED Requirements

### Requirement: LLM ingest pipeline
The system SHALL send the raw source content along with L1 context (schema.md + index.md) to the LLM. The LLM SHALL return structured JSON containing: `pages` (array of `{ slug, title, tags, content, action: "create"|"update" }`), `index_entries` (new/modified index lines), and `warnings` (contradiction/lint messages).

#### Scenario: New topic ingestion
- **WHEN** a raw source about "vector databases" is ingested and no existing wiki page covers this topic
- **THEN** the LLM creates a new page with slug "vector-databases", full markdown content with `[[wiki-links]]` to related pages, and `[^raw-{id}]` footnote references to the raw source

#### Scenario: Existing page update
- **WHEN** a raw source contains new information about a topic already covered by wiki page "vector-databases"
- **THEN** the LLM returns an update action for "vector-databases" with revised content incorporating the new information alongside existing knowledge

### Requirement: Wiki-link cross-references
Every wiki page produced by the LLM SHALL contain `[[wiki-links]]` to related pages. These links SHALL be tracked in the `wiki_links` SQLite table with `from_page_id` and `to_slug`.

#### Scenario: Link graph update on ingest
- **WHEN** the LLM creates/updates a page with `[[related-page]]` links
- **THEN** the backend rebuilds the `wiki_links` entries for that page, storing each outgoing link

#### Scenario: Links to non-existent pages
- **WHEN** the LLM creates a link `[[future-topic]]` to a page that does not yet exist
- **THEN** the link is stored in `wiki_links` with `to_slug: "future-topic"` and flagged as a "missing page" in lint

### Requirement: Raw source footnote references
Every wiki page SHALL include inline footnote references (`[^raw-{id}]`) linking claims back to the raw source documents they were derived from. The `page_sources` join table SHALL track which wiki pages were derived from which raw sources.

#### Scenario: Provenance tracking
- **WHEN** wiki page "vector-databases" is created from raw source with id "abc123"
- **THEN** the page content contains `[^raw-abc123]` footnotes, and `page_sources` has an entry linking the wiki page to raw source "abc123"

### Requirement: Index maintenance
The LLM SHALL produce updated `index.md` entries for all created/updated pages. Each entry SHALL contain slug, title, summary (1-2 sentences), tags (comma-separated), and updated date. The backend SHALL merge these entries into `index.md`.

#### Scenario: New page index entry
- **WHEN** a new wiki page "vector-databases" is created
- **THEN** `index.md` gains an entry: `- **[[vector-databases]]** | updated: {date}` with summary and tags

#### Scenario: Updated page index entry
- **WHEN** an existing wiki page is updated
- **THEN** its `index.md` entry is replaced with the new summary, tags, and updated date

### Requirement: Contradiction detection at ingest (Tier 2)
The ingest LLM call SHALL include instructions to flag contradictions between the new raw source and existing wiki pages referenced in the index. Contradictions SHALL be returned in the `warnings` array of the structured output.

#### Scenario: Contradiction detected
- **WHEN** a new raw source states "Redis is single-threaded" but existing wiki page states "Redis uses multi-threading for I/O"
- **THEN** the LLM returns a warning with type "contradiction", identifying both the new source claim and the conflicting wiki page

### Requirement: Wiki language — Spanish with technical terms in English
All wiki content SHALL be written in **Spanish**. Technical terms that are standard in software development, AI engineering, and related fields SHALL remain in English (e.g., "prompt engineering", "few-shot learning", "RAG", "fine-tuning", "embedding", "token", "LLM", "API", "middleware", "pipeline", "callback", "hook", "deploy", etc.). This applies to:
- Page titles: Spanish when describing general concepts (e.g., "Aprendizaje por Refuerzo"), English for established technical terms (e.g., "Prompt Engineering", "Few-Shot Learning")
- Page content: prose in Spanish, technical terms in English inline
- Summaries and index entries: Spanish
- Slugs: always kebab-case English (unchanged)
- Tags: always English (unchanged)

The ingest system prompt (`ingest-system.txt`) and the schema (`data/schema.md`) SHALL include explicit instructions about this language policy. The query system prompt SHALL also respond in Spanish.

#### Scenario: Spanish content with English technical terms
- **WHEN** a raw source about "Retrieval-Augmented Generation" is ingested
- **THEN** the wiki page title could be "Retrieval-Augmented Generation (RAG)", the content explains the concept in Spanish prose (e.g., "RAG es una técnica que combina la recuperación de documentos con la generación de texto mediante un LLM..."), and the slug is `retrieval-augmented-generation`

#### Scenario: General concept in Spanish
- **WHEN** a raw source about machine learning fundamentals is ingested
- **THEN** sections like "Definición", "Principios Clave", "Ejemplos", "Errores Comunes" are in Spanish, while terms like "gradient descent", "backpropagation", "loss function" remain in English

### Requirement: Backend post-processing
After receiving the LLM structured output, the backend SHALL: write wiki page files to `data/wiki/`, update SQLite (`wiki_pages`, `page_sources`, `wiki_links`), merge `index.md` entries, store any warnings in `lint_warnings`, and run Tier 1 deterministic lint on affected pages.

#### Scenario: Transactional write
- **WHEN** the LLM returns 3 page creates and 1 page update
- **THEN** all files and database records are written; if any write fails, the operation reports the error

### Requirement: Ingest pipeline observability
The ingest pipeline SHALL log structured messages at each stage using a `[INGEST]` prefix. Logs SHALL include:
- **Pipeline start**: `[INGEST] Starting pipeline for raw-{id}` with content length
- **L1 context loaded**: `[INGEST] L1 context loaded: {n} existing pages, schema {n} chars`
- **LLM call start**: `[INGEST] Calling LLM for raw-{id} (model: {model})`
- **LLM response received**: `[INGEST] LLM response for raw-{id}: {n} chars` and log the first 500 chars of the raw response for debugging
- **JSON parse result**: `[INGEST] Parsed response for raw-{id}: {n} pages, {n} index_entries, {n} warnings`
- **JSON parse failure**: `[INGEST ERROR] JSON parse failed for raw-{id}. Raw response (first 1000 chars): {text}` — the raw LLM response MUST be preserved in the error log so parse issues are debuggable
- **Post-process start/end**: `[INGEST] Post-processing raw-{id}: writing {n} pages` and `[INGEST] Post-process complete for raw-{id}`
- **Pipeline error**: `[INGEST ERROR] Pipeline failed for raw-{id}: {error.message}` with full stack trace

The ingest system prompt SHALL inject the actual `rawSourceId` into the prompt text, replacing `RAW_ID` placeholders so the LLM can produce correct `[^raw-{id}]` footnotes.

### Requirement: Structured output via AI SDK
The ingest pipeline SHALL use the Vercel AI SDK `generateObject` function with a Zod schema to guarantee valid, typed JSON output from the LLM. This eliminates the need for manual JSON extraction, sanitization, and parsing. The `llmClient` SHALL expose a `generateStructured<T>(options)` method that accepts a Zod schema and returns a validated `z.infer<T>` object, with the same primary/fallback model retry logic as `generate()`.

The `IngestResult` schema SHALL be defined with Zod (`IngestResultSchema`) and used as the single source of truth for both TypeScript types (`z.infer<typeof IngestResultSchema>`) and LLM output validation.

#### Scenario: LLM returns structured output
- **WHEN** the ingest pipeline calls `generateStructured` with `IngestResultSchema`
- **THEN** the AI SDK handles JSON generation, parsing, and validation against the schema, returning a typed `IngestResult` object directly

#### Scenario: LLM output fails schema validation
- **WHEN** the LLM returns output that doesn't conform to the Zod schema
- **THEN** the AI SDK throws a validation error with details about which fields failed, and the fallback model is attempted

#### Scenario: LLM call fails
- **WHEN** both primary and fallback LLM models fail
- **THEN** the error message and model names are logged, and a lint warning is stored

#### Scenario: Successful ingest with debug trail
- **WHEN** a raw source is ingested successfully producing 2 pages
- **THEN** the log shows the full lifecycle: start → L1 loaded → LLM called → response received → parsed → post-processing → complete
