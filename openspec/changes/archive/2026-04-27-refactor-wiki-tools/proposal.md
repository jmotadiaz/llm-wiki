## Why

Currently, the `upsert_wiki_page` tool serves dual purposes: creating new wiki pages and editing existing ones. For edits, it forces the AI agent to regenerate and send the entire markdown content of the page, even for minor changes. This increases token usage, latency, and the risk of hallucination or accidental alterations in unmodified sections. Replacing it with distinct creation and editing tools (supporting partial replacements) reduces the model's cognitive load and greatly improves editing efficiency.

## What Changes

- **BREAKING**: Remove the `upsert_wiki_page` tool entirely from `server/src/llm/index-tools.ts`, `server/src/llm/review-tools.ts`, and any other tool registries.
- Add `add_wiki_page` tool, strictly for creating new pages. It fails if the slug already exists.
- Add `edit_wiki_page` tool, strictly for updating existing pages. It fails if the slug does not exist.
- Add `delete_wiki_page` tool to allow removing pages (e.g. when consolidating duplicates).
- Update `edit_wiki_page` to support both full content rewrites (via a `content` field) and partial targeted edits (via an `edits` array containing `old_content` and `new_content`), using a flat schema with runtime mutual exclusivity checks.

## Capabilities

### New Capabilities
- `wiki-tools-refactor`: Defines the strict separation between creation and editing capabilities for wiki pages by LLM agents, introducing partial editing capabilities.

### Modified Capabilities
- `review-agent`: Update the reviewer agent to use `edit_wiki_page` instead of `upsert_wiki_page` for modifying pages.
- `raw-source-ingestion`: Update the ingest writer to use `add_wiki_page` for new pages and `edit_wiki_page` for updates instead of `upsert_wiki_page`.

## Impact

- **Tooling/APIs:** `server/src/llm/index-tools.ts` and `server/src/llm/review-tools.ts` will need to replace `upsert_wiki_page` with the new tools.
- **Agents:** Agents interacting with the wiki (e.g., ingest writer, reviewer) will need to be made aware of the new tools and use `edit_wiki_page` for updates and `add_wiki_page` for creations.
- **Backend Storage:** The database queries (`Queries.ts`) and filesystem writes will be invoked differently based on whether it's an `add` or `edit`.
