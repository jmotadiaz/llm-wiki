## 1. Database

- [x] 1.1 Add `page_comments` table to `server/src/db/schema.ts` with columns: `id`, `page_id`, `content`, `reply`, `status` (default `pending`), `pages_edited` (TEXT, JSON array), `error`, `created_at`, `answered_at`; add FK to `wiki_pages` with CASCADE delete
- [x] 1.2 Add migration guard in `initializeDatabase()` to create the table if it does not exist (same pattern as existing migrations)
- [x] 1.3 Add startup reset in `initializeDatabase()`: UPDATE `page_comments` SET status = `pending` WHERE status = `processing`
- [x] 1.4 Add comment query methods to `server/src/db/queries.ts`: `insertComment`, `getCommentsByPageId`, `updateCommentStatus`, `setCommentAnswered`, `setCommentFailed`, `archiveComment`

## 2. Review Agent Tools

- [x] 2.1 Create `server/src/llm/review-tools.ts` with `createReviewTools(db, commentId, pageSlug)` factory
- [x] 2.2 Implement `get_wiki_page` tool (copy from `ingest-tools.ts`, read-only, same interface)
- [x] 2.3 Implement `list_page_sources(slug)` tool: queries `page_sources` JOIN `raw_sources` for the page, returns `[{id, title, description, source_url}]` — no content
- [x] 2.4 Implement `get_raw_source(id)` tool: validates the source is linked to the target page via `page_sources`, then returns full `content`; returns error if not linked
- [x] 2.5 Implement `upsert_wiki_page` tool: reuse validation logic from `ingest-tools.ts` with `rawSourceId = 0` (no `page_sources` entry created); accumulate written slugs in a closure-scoped `pagesEdited` array
- [x] 2.6 Implement `reply_to_comment(reasoning)` tool: calls `queries.setCommentAnswered(commentId, reasoning, pagesEdited)`, returns `{ success: true }`

## 3. Review Agent

- [x] 3.1 Create `server/src/llm/prompts/reviewer.md` — system prompt for the reviewer agent: role (wiki reviewer), instructions to be minimal/targeted, requirement to always call `reply_to_comment`, citation and wiki-link conventions (same as ingest writer)
- [x] 3.2 Create `server/src/llm/review.ts` with `reviewComment(db, commentId)` function
- [x] 3.3 In `reviewComment`: load page content, L1 index, and feedback text; interpolate into reviewer system prompt + user message (feedback + page content + L1 index)
- [x] 3.4 Call `llmClient.generate` with reviewer tools, appropriate model (same model as ingest writer: `openrouter("xiaomi/mimo-v2-flash")`), and `maxSteps: 15`
- [x] 3.5 On success: if agent did not call `reply_to_comment` (no tool call found), call `queries.setCommentAnswered` with a fallback reasoning message
- [x] 3.6 On error: call `queries.setCommentFailed(commentId, error.message)`

## 4. Review Queue

- [x] 4.1 Create `server/src/services/review-queue.ts` mirroring `ingest-queue.ts` shape: `ReviewQueue` class with `enqueue(commentId)`, `getStatus()`, serial `drain()` loop
- [x] 4.2 In `processJob`: set comment status to `processing`, call `reviewComment(db, commentId)`, handle errors by calling `setCommentFailed`
- [x] 4.3 On server startup in `server/src/index.ts`: instantiate `ReviewQueue` (after DB init); re-enqueue all comments with status `pending` from the DB (covers persisted pending state from prior runs)

## 5. API Routes

- [x] 5.1 Create `server/src/routes/api/comments.ts` with `createCommentRoutes(db, reviewQueue)` factory
- [x] 5.2 `GET /api/wiki/:slug/comments` — fetch all non-archived comments for the page (ordered by `created_at` DESC); return `{id, content, reply, status, pages_edited, error, created_at, answered_at}`
- [x] 5.3 `POST /api/wiki/:slug/comments` — validate body has non-empty `content`; resolve `page_id` from slug (404 if not found); call `queries.insertComment`; enqueue review job; return 201 with comment record
- [x] 5.4 `PATCH /api/wiki/:slug/comments/:id` — accept `{action: "archive"}`; validate comment exists and is in `answered` or `failed` status; call `queries.archiveComment`; return updated record
- [x] 5.5 Mount comments router in `server/src/index.ts`: `app.use("/api/wiki", createCommentRoutes(db, reviewQueue))`

## 6. Client — CommentSection Component

- [x] 6.1 Create `client/src/components/CommentSection.tsx` with props `{ slug: string }`
- [x] 6.2 On mount: `GET /api/wiki/:slug/comments` and render comment list
- [x] 6.3 Render each comment with: feedback text, status badge (pending/processing/answered/failed), reply text (if answered), `pages_edited` list as wiki links (if non-empty), timestamp
- [x] 6.4 Render submit form: textarea + submit button; on submit POST to `/api/wiki/:slug/comments` and prepend the new comment to the list
- [x] 6.5 Render archive button on answered/failed comments; on click PATCH with `{action: "archive"}` and remove comment from list
- [x] 6.6 Add `CommentSection` to `client/src/pages/WikiPage.tsx` below the article content (after the existing backlinks/sources section)
