### Requirement: Distinct Wiki Tooling for Agents
The system SHALL provide distinct tools for wiki page creation, modification, and deletion to LLM agents: `add_wiki_page`, `edit_wiki_page`, and `delete_wiki_page`. The legacy `upsert_wiki_page` tool SHALL be removed.

#### Scenario: Adding a page
- **WHEN** an agent calls `add_wiki_page` with full content and metadata
- **THEN** the page is created if the slug is unique, or rejected if it already exists

#### Scenario: Editing a page
- **WHEN** an agent calls `edit_wiki_page`
- **THEN** the page is modified if the slug exists, or rejected if it does not exist

#### Scenario: Deleting a page
- **WHEN** an agent calls `delete_wiki_page` with a valid slug
- **THEN** the page is removed from the database and the filesystem

### Requirement: Flat Tool Schema for Edit Mutual Exclusivity
The `edit_wiki_page` tool schema SHALL define `content` (string) and `edits` (array of replacements) as optional root-level properties.

#### Scenario: Mutual Exclusivity Validation
- **WHEN** an agent calls `edit_wiki_page` with both `content` and `edits` provided
- **THEN** the tool SHALL return a runtime error stating that the agent must choose either full replacement or partial patching, not both

#### Scenario: Partial Editing
- **WHEN** an agent calls `edit_wiki_page` providing an `edits` array with `old_content` and `new_content`
- **THEN** the system performs an exact string replacement of `old_content` with `new_content`. If `old_content` is not found, the tool returns an error.
- **AND** on success, the tool returns a confirmation object containing the applied diff or the modified snippets, rather than the entire page, to save tokens while still allowing the agent to verify its changes.
