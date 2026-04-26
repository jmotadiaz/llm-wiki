## ADDED Requirements

### Requirement: domain-index page structure
A `domain-index` page SHALL be a `wiki_page` with `type: 'domain-index'` and markdown content following this structure:
- H1 title (name of the domain in Spanish)
- One executive description paragraph explaining what the domain covers
- H2 "Conceptos Clave" with bullet list of `[[slug]]` links and one-line descriptions
- H2 "Técnicas" with bullet list of `[[slug]]` links and one-line descriptions (omitted if no technique pages exist in the domain)
- H2 "Herramientas" with bullet list of `[[slug]]` links and one-line descriptions (omitted if no reference/tool pages exist)
- H2 "Relacionado" with bullet list of `[[slug]]` links to pages from other domains with high connectivity to this domain (omitted if none)

Slugs for domain-index pages SHALL follow the pattern `domain-index-<domain-kebab>` (e.g., `domain-index-ai-agents`).

#### Scenario: domain-index rendered with all sections
- **WHEN** a domain has concepts, techniques, and tool pages
- **THEN** the generated markdown contains all four H2 sections with the appropriate pages listed under each

#### Scenario: domain-index with no tools omits section
- **WHEN** a domain has no pages with `type: 'reference'`
- **THEN** the "Herramientas" H2 section is omitted from the markdown

### Requirement: learning-path page structure
A `learning-path` page SHALL be a `wiki_page` with `type: 'learning-path'` and markdown content following this structure:
- H1 title (e.g., "Cómo aprender [Domain] desde cero")
- One description paragraph stating who the path is for and what the reader will learn
- Optional H2 "Prerequisitos" with `[[slug]]` links to pages outside the domain that should be read first
- Two or more H2 stage sections (e.g., "Fundamentos", "Conceptos Avanzados", "Técnicas") each containing:
  - A paragraph describing the stage and what the reader gains
  - A bullet list where each entry is `[[slug]] — rationale sentence`

Slugs for learning-path pages SHALL follow the pattern `learning-path-<domain-kebab>` (e.g., `learning-path-testing`).

#### Scenario: learning-path has at least two stages
- **WHEN** the index agent generates a learning-path for a domain with 5+ pages
- **THEN** the markdown contains at least two H2 stage sections

#### Scenario: every page entry has a rationale
- **WHEN** a learning-path page is generated
- **THEN** every `[[slug]]` entry in the stage lists includes an em-dash followed by a rationale sentence

### Requirement: Index pages excluded from the Páginas tab
Pages with `type IN ('domain-index', 'learning-path')` SHALL NOT appear in the main wiki page listing (the "Páginas" tab on the home). They SHALL be accessible via their slug at `/wiki/<slug>` and SHALL appear in their respective dedicated tabs.

#### Scenario: Index pages absent from Páginas tab
- **WHEN** the home page loads the "Páginas" tab
- **THEN** the API query filters out pages with `type IN ('domain-index', 'learning-path')`

#### Scenario: Index pages accessible by slug
- **WHEN** a user navigates to `/wiki/domain-index-testing`
- **THEN** the page is rendered normally with its markdown content

### Requirement: Index pages excluded from RAG context in chat
The chat query agent SHALL NOT include pages with `type IN ('domain-index', 'learning-path')` when selecting wiki pages as RAG context, as their content is navigational rather than informational.

#### Scenario: RAG context excludes index pages
- **WHEN** the chat query agent selects wiki pages to include in its context
- **THEN** pages with type `domain-index` or `learning-path` are excluded from the selection

### Requirement: A page may appear in multiple index pages
A single `wiki_page` MAY be referenced (via `[[slug]]`) in multiple `domain-index` pages and multiple `learning-path` pages. A page belongs natively to exactly one domain-index and one learning-path (those matching its `d:` tag); its presence in other index pages' "Relacionado" sections arises when its `t:` tags overlap with pages from other domains.

#### Scenario: Cross-domain page appears via shared topics
- **WHEN** page `agent-self-verification` has `d:ai-agents` and shares the topic `t:verification` with pages under `d:software-testing`
- **THEN** it appears under "Conceptos Clave" in `domain-index-ai-agents` and under "Relacionado" in `domain-index-software-testing`

### Requirement: Wiki page tags use role-prefixed format
All tags on `wiki_pages` SHALL carry exactly one of three role prefixes. The format and cardinality rules SHALL be enforced by `upsert_wiki_page` on every call:

- `d:<slug>` — discipline. Each page MUST carry exactly one `d:` tag.
- `t:<slug>` — topic. Each page MUST carry at least one `t:` tag.
- `a:<slug>` — axis. Zero or more per page. The `<slug>` MUST be drawn from the closed whitelist: `fundamentals`, `advanced`, `research`, `implementation`, `troubleshooting`, `performance`, `tutorial`, `theory`, `case-study`, `tool`, `standard`.

The `<slug>` portion of `d:` and `t:` tags MUST match `^[a-z0-9]+(-[a-z0-9]+)*$`. The entire tag (including prefix) MUST match `^(d|t|a):[a-z0-9]+(-[a-z0-9]+)*$`. Tags that fail any rule SHALL cause `upsert_wiki_page` to return an error and no persistence to occur.

#### Scenario: Valid tag set accepted
- **WHEN** `upsert_wiki_page` is called with tags `["d:ai-agents", "t:harness-engineering", "t:agent-workflows", "a:fundamentals", "a:theory"]`
- **THEN** the page is persisted with those tags

#### Scenario: Missing d: tag rejected
- **WHEN** `upsert_wiki_page` is called with a tags list that contains no `d:` prefix tag
- **THEN** the tool returns an error naming the missing discipline and the page is not persisted

#### Scenario: Multiple d: tags rejected
- **WHEN** `upsert_wiki_page` is called with more than one `d:` tag (e.g., `["d:ai-agents", "d:software-testing", "t:verification"]`)
- **THEN** the tool returns an error and the page is not persisted

#### Scenario: Missing t: tag rejected
- **WHEN** `upsert_wiki_page` is called with no `t:` tag in the list
- **THEN** the tool returns an error and the page is not persisted

#### Scenario: Unknown a: axis rejected
- **WHEN** `upsert_wiki_page` is called with an `a:` tag not in the whitelist (e.g., `a:beginner`)
- **THEN** the tool returns an error naming the unknown axis and the page is not persisted

#### Scenario: Tag without prefix rejected
- **WHEN** `upsert_wiki_page` is called with a bare tag (e.g., `"harness-engineering"`)
- **THEN** the tool returns an error and the page is not persisted
