## Context

The wiki already has an async two-agent ingest pipeline (`IngestQueue` → `ingestRawSource`) and a post-process cleanup step. The pattern is: enqueue a job, drain serially, update DB on completion. The new review pipeline mirrors this exactly, replacing `sourceId` with `commentId`.

Wiki pages are written in Spanish, use `[[slug]]` cross-references, and cite raw sources with `/raw/{id}` links. The reviewer agent must honour all the same conventions enforced by the ingest writer.

There is no auth — this is a single-user system.

## Goals / Non-Goals

**Goals:**
- Let the user leave feedback on any wiki article and have an LLM reviewer act on it
- Reviewer can read all raw sources linked to the page (lazy: list metadata → fetch content on demand)
- Reviewer can edit the target page and any related pages using the same `upsert_wiki_page` semantics
- Reviewer posts a natural-language reasoning reply that is persisted on the comment
- UI shows the reply under the comment on next page load; allows archiving answered comments
- System is resilient: if the reviewer fails, the comment is marked `failed` with an error message

**Non-Goals:**
- Real-time streaming or push notifications (no SSE, no WebSocket, no polling)
- Multi-user or auth
- Diff/history view of what changed
- Review agent selecting sources beyond those already linked to the page

## Decisions

### 1. Separate `ReviewQueue` — don't reuse `IngestQueue`

The two pipelines have different job shapes (`commentId` vs `sourceId`), different completion side-effects (update comment record vs post-process wiki files), and different error handling semantics. Sharing a base class would add complexity without benefit. A new `ReviewQueue` class that mirrors `IngestQueue` keeps things explicit and independently evolvable.

### 2. `reply_to_comment` as the closure tool

The reviewer agent accumulates side-effects (`upsert_wiki_page` calls) during its loop, then finalises by calling `reply_to_comment(reasoning)`. The system computes `pages_edited` from the job's accumulated upsert calls at closure time — the agent does not need to track this itself. This matches how the ingest writer uses `report_warning` as a terminal signal, and keeps the agent prompt simple.

### 3. Lazy raw-source loading (list metadata → fetch on demand)

The page may have many linked raw sources; including all their content in the agent's initial context would be expensive and often irrelevant. Instead:
- `list_page_sources(slug)` returns `[{id, title, description, source_url}]` — metadata only
- `get_raw_source(id)` returns the full `content` field for a specific source

This is the same lazy pattern already used by `get_wiki_page`. The agent reads only what it needs.

### 4. Reviewer reuses `upsert_wiki_page` without modification

The ingest writer's `upsert_wiki_page` tool validates slugs, rejects malformed citations, and rejects raw links that should be wiki links. These invariants must hold for reviewer edits too. Rather than duplicating or relaxing the validation, the reviewer's tool set uses the same implementation from `ingest-tools.ts`, parameterised with a sentinel `rawSourceId` of `0` (no new raw source is being linked — the reviewer never creates `page_sources` entries).

### 5. DB-persisted comment status over in-memory job state

Unlike `IngestQueue` which holds job state in memory (acceptable because it's ephemeral queue state), comment status is persisted in `page_comments`. This means the UI always reflects the true state even after a server restart, and the `pending` state is durable (comments submitted before a crash are not silently lost — they remain pending and can be retried or manually resolved).

On startup, any comments left in `processing` state (server crashed mid-run) are reset to `pending` so the queue can pick them up.

### 6. No new `page_sources` entries for reviewer edits

The reviewer does not ingest new raw content — it revises existing pages based on sources that are already linked. Adding a `page_sources` entry would misrepresent the provenance of the page (implying a new source was ingested). The `pages_edited` field on the comment record is the audit trail for reviewer-driven changes.

## Risks / Trade-offs

- **Reviewer may over-edit**: With full `upsert_wiki_page` access, the agent could rewrite pages far beyond the scope of the feedback. Mitigated by the reviewer prompt emphasising minimal, targeted changes.
- **No diff visibility**: The user sees the reply reasoning but not a before/after diff. Acceptable for now; git history on `data/wiki/*.md` files provides a fallback audit trail.
- **Serial queue**: The `ReviewQueue` processes one comment at a time. If multiple comments are submitted quickly, they queue. Acceptable for a single-user system.
- **`processing` state on crash**: Comments stuck in `processing` after a crash are reset to `pending` on startup. If a review job keeps crashing on a specific comment, it will loop. Mitigated by capping retry attempts in a future iteration (not in scope now).

## Migration Plan

1. Deploy schema migration (adds `page_comments` table) — additive, no existing data affected
2. Deploy server with new routes and queue — no existing endpoints change
3. Deploy client with `CommentSection` — new UI section, no existing components modified
4. No rollback complexity: dropping the `page_comments` table and removing the new files reverts fully

## Open Questions

- Should the reviewer prompt explicitly forbid editing pages not linked to the target page, or trust the agent to stay focused? (Lean: trust the agent, see if it misbehaves in practice)
