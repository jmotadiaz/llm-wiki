## ADDED Requirements

### Requirement: Reviewer agent receives full context for the target page
The system SHALL provide the reviewer agent with the current article content, the L1 wiki index (all pages with slug, title, tags, summary), and the user's feedback text as its working context.

#### Scenario: Agent context construction
- **WHEN** a review job starts for a comment on page `<slug>`
- **THEN** the agent's user message SHALL include the feedback text, the full markdown content of `<slug>`, and the L1 index listing

### Requirement: Reviewer agent can lazily load linked raw sources
The system SHALL expose two tools so the agent can inspect raw sources linked to the target page without loading all source content upfront:
- `list_page_sources(slug)` — returns metadata only (`id`, `title`, `description`, `source_url`)
- `get_raw_source(id)` — returns the full `content` of a specific raw source

The agent SHALL only be able to retrieve raw sources that are linked to the target page via `page_sources`.

#### Scenario: List sources metadata
- **WHEN** agent calls `list_page_sources` with the target page slug
- **THEN** the tool returns an array of `{id, title, description, source_url}` for all linked raw sources

#### Scenario: Fetch source content
- **WHEN** agent calls `get_raw_source` with a valid source id linked to the target page
- **THEN** the tool returns the full content of that raw source

#### Scenario: Source not linked to page
- **WHEN** agent calls `get_raw_source` with an id that is not linked to the target page
- **THEN** the tool returns an error indicating the source is not available for this review

### Requirement: Reviewer agent can edit wiki pages
The system SHALL expose `upsert_wiki_page` to the reviewer agent with the same validation rules as the ingest writer (slug format, citation syntax, wiki-link cross-reference rules). The reviewer SHALL NOT create new `page_sources` entries — its edits are attributed to the comment record, not to a raw source.

#### Scenario: Valid page edit
- **WHEN** agent calls `upsert_wiki_page` with a valid slug and content
- **THEN** the page is updated in the database and on the filesystem, and the slug is recorded in the job's `pages_edited` list

#### Scenario: Invalid slug rejected
- **WHEN** agent calls `upsert_wiki_page` with a slug longer than 60 chars or not matching kebab-case
- **THEN** the tool returns a validation error and the page is not modified

### Requirement: Reviewer agent finalises by calling reply_to_comment
The system SHALL expose a `reply_to_comment(reasoning)` tool. Calling this tool SHALL:
1. Persist the `reasoning` text as the comment's `reply`
2. Set the comment status to `answered`
3. Record the list of slugs edited during the job as `pages_edited` (JSON array)
4. Set `answered_at` timestamp

The agent SHALL call this tool even when it makes no edits (to communicate its reasoning for not changing anything).

#### Scenario: Reply with edits
- **WHEN** agent calls `reply_to_comment` after one or more `upsert_wiki_page` calls
- **THEN** comment is answered with the reasoning and `pages_edited` contains the edited slugs

#### Scenario: Reply without edits
- **WHEN** agent calls `reply_to_comment` without having called `upsert_wiki_page`
- **THEN** comment is answered with the reasoning and `pages_edited` is an empty array

### Requirement: Review job failure is recorded on the comment
If the reviewer agent throws an unhandled error, the system SHALL set the comment status to `failed` and persist the error message so the user can see why the review did not complete.

#### Scenario: Agent error
- **WHEN** the reviewer agent throws an error during execution
- **THEN** the comment status is set to `failed`, the `error` field is populated with the error message, and `answered_at` is set
