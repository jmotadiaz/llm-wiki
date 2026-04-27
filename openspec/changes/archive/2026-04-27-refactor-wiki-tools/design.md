## Context

The `upsert_wiki_page` tool in our backend AI integration (`server/src/llm/index-tools.ts` and `server/src/llm/review-tools.ts`) is currently used by agents (like the ingest writer and the review agent) to both create and edit wiki pages. This design requires the agent to generate and pass the full markdown content of the page for any modification. This leads to higher token usage, increased latency, and a larger surface area for LLM hallucinations where unrelated parts of the page might be accidentally altered.

## Goals / Non-Goals

**Goals:**
- Separate the creation, editing, and deletion of wiki pages into three distinct tools: `add_wiki_page`, `edit_wiki_page`, and `delete_wiki_page`.
- Enable `edit_wiki_page` to support partial string replacements (patching) to reduce token output during minor edits.
- Make the schema flat and mutually exclusive at runtime to avoid LLM confusion between full rewrites and partial edits.

**Non-Goals:**
- Changing how the front-end or database stores the content.
- Moving away from markdown.

## Decisions

- **Shared tools module:** We will extract the wiki modification tools (`add_wiki_page`, `edit_wiki_page`, `delete_wiki_page`) into a new shared file `server/src/llm/wiki-tools.ts` to avoid code duplication between `index-tools.ts` and `review-tools.ts`.
- **Splitting tools:** We decided against a single `upsert` tool. A dedicated `add_wiki_page` strictly creates new pages (fails if the slug exists), `edit_wiki_page` strictly updates (fails if it doesn't), and `delete_wiki_page` allows removing pages (useful for consolidating duplicates). This clarifies intent and simplifies error handling.
- **Flat schema with Runtime validation for `edit_wiki_page`:** We chose a flat schema where `content` (for full replacement) and `edits` (array of `old_content`/`new_content` objects) sit at the root of the arguments. If an agent provides both, the tool will return a descriptive error at runtime, teaching the agent the correct usage. This was chosen over deep nesting or Zod Discriminated Unions because flat schemas are easier for LLMs to generate correctly without formatting errors.

## Risks / Trade-offs

- **[Risk] Exact whitespace matching:** The `edits` array relies on an exact string match of `old_content`. LLMs might alter whitespaces or indentation slightly when generating `old_content`, causing the replacement to fail.
  - **Mitigation:** The agent already has access to `get_wiki_page`, which provides the exact text. We will ensure the error messages from failed replacements are clear so the LLM can try again or fall back to a full rewrite using the `content` field.
