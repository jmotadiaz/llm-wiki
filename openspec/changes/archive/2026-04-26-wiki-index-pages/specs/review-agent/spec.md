## MODIFIED Requirements

### Requirement: Reviewer agent receives full context for the target page
The system SHALL provide the reviewer agent with the current article content, the L1 wiki index (all pages with slug, title, tags, summary), and the user's feedback text as its working context. For pages with `type IN ('domain-index', 'learning-path')`, the system SHALL additionally provide the full wiki index so the agent can reason about which pages to add, remove, or reorder.

#### Scenario: Agent context construction for concept/technique/reference
- **WHEN** a review job starts for a comment on a page with `type IN ('concept', 'technique', 'reference')`
- **THEN** the agent's user message SHALL include the feedback text, the full markdown content of `<slug>`, and the L1 index listing

#### Scenario: Agent context construction for index pages
- **WHEN** a review job starts for a comment on a page with `type IN ('domain-index', 'learning-path')`
- **THEN** the agent's user message SHALL include the feedback text, the full markdown content of `<slug>`, and the full L1 wiki index

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
