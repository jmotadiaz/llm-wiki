## Why

The wiki is fully automated but has no feedback loop — once an article is generated, errors, gaps, or outdated content can only be fixed by re-ingesting new sources. Adding a human-in-the-loop comment tier lets the user flag specific issues on any article and have a reviewer agent correct the wiki directly, grounded in the existing raw sources.

## What Changes

- Each wiki article gets a comment section where the user can submit plain-text feedback
- Submitting a comment triggers an async reviewer agent that reads the page, the L1 index, and the linked raw sources, then optionally edits the article (and related pages) and posts a reasoning reply
- Comments have a lifecycle: `pending → processing → answered → archived` (plus `failed`)
- Answered comments display the agent's reasoning inline; they can be archived to keep the section clean
- No streaming or polling — the UI reflects the latest state on page reload

## Capabilities

### New Capabilities

- `wiki-feedback`: User-facing comment submission and display on wiki article pages
- `review-agent`: Async LLM reviewer agent that processes feedback, edits pages, and replies with reasoning

### Modified Capabilities

- `wiki-compilation`: Wiki pages can now be updated by the reviewer agent in addition to the ingest pipeline; the compilation contract (upsert semantics, slug rules, wiki-link extraction) is reused but not changed

## Impact

- **New DB table**: `page_comments` (page_id, content, reply, status, pages_edited, error, timestamps)
- **New server files**: `llm/review.ts`, `llm/review-tools.ts`, `llm/prompts/reviewer.md`, `routes/api/comments.ts`
- **Modified server files**: `db/schema.ts`, `db/queries.ts`, `index.ts` (route mount)
- **New client component**: `CommentSection.tsx`
- **Modified client file**: `WikiPage.tsx` (render comment section)
- No changes to the ingest pipeline, lint system, or chat query
