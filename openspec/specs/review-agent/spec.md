## ADDED Requirements

### Requirement: Reviewer agent receives full context for the target page
The system SHALL provide the reviewer agent with the current article content, the L1 wiki index (all pages with slug, title, tags, summary), and the user's feedback text as its working context. For pages with `type IN ('domain-index', 'learning-path')`, the system SHALL additionally provide the full wiki index so the agent can reason about which pages to add, remove, or reorder.

#### Scenario: Agent context construction for concept/technique/reference
- **WHEN** a review job starts for a comment on a page with `type IN ('concept', 'technique', 'reference')`
- **THEN** the agent's user message SHALL include the feedback text, the full markdown content of `<slug>`, and the L1 index listing

#### Scenario: Agent context construction for index pages
- **WHEN** a review job starts for a comment on a page with `type IN ('domain-index', 'learning-path')`
- **THEN** the agent's user message SHALL include the feedback text, the full markdown content of `<slug>`, and the full L1 wiki index

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

### Requirement: Review endpoint accepts type parameter and configures agent accordingly
The review endpoint SHALL accept a `type` parameter corresponding to the `wiki_page.type` of the page being reviewed. The system SHALL select the appropriate agent configuration (system prompt and available tools) based on this value.

For `type IN ('concept', 'technique', 'reference')`: existing system prompt (faithful editing based on raw sources) and existing tools (`upsert_wiki_page`, `list_page_sources`, `get_raw_source`, `reply_to_comment`).

For `type = 'domain-index'`: system prompt oriented to reorganizing domain sections, adding or removing page references; tools: `upsert_wiki_page`, `get_wiki_index`, `reply_to_comment`.

For `type = 'learning-path'`: system prompt oriented to reordering stages and incorporating missing pages using backlink signals; tools: `upsert_wiki_page`, `get_wiki_index`, `get_backlinks`, `reply_to_comment`.

#### Scenario: Review of concept page uses source-faithful prompt
- **WHEN** review job is triggered with `type: 'concept'`
- **THEN** the agent uses the existing system prompt and has access to `list_page_sources` and `get_raw_source`

#### Scenario: Review of domain-index uses reorganization prompt
- **WHEN** review job is triggered with `type: 'domain-index'`
- **THEN** the agent uses the domain-index system prompt and has access to `get_wiki_index` but NOT `list_page_sources` or `get_raw_source`

#### Scenario: Review of learning-path uses reordering prompt with backlinks
- **WHEN** review job is triggered with `type: 'learning-path'`
- **THEN** the agent uses the learning-path system prompt and has access to `get_wiki_index` and `get_backlinks`

#### Scenario: Invalid type rejected
- **WHEN** review job is triggered with an unrecognized `type` value
- **THEN** the endpoint returns a 400 error

### Requirement: Review job failure is recorded on the comment
If the reviewer agent throws an unhandled error, the system SHALL set the comment status to `failed` and persist the error message so the user can see why the review did not complete.

#### Scenario: Agent error
- **WHEN** the reviewer agent throws an error during execution
- **THEN** the comment status is set to `failed`, the `error` field is populated with the error message, and `answered_at` is set
