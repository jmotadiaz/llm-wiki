## MODIFIED Requirements

### Requirement: Reviewer agent can manage wiki pages
The system SHALL expose `add_wiki_page`, `edit_wiki_page`, and `delete_wiki_page` to the reviewer agent to allow full lifecycle management of pages, with validation rules for slug format, citation syntax, and wiki-link cross-reference rules. The reviewer SHALL NOT create new `page_sources` entries — its edits are attributed to the comment record, not to a raw source.

#### Scenario: Valid full page edit
- **WHEN** agent calls `edit_wiki_page` with a valid slug and a `content` string
- **THEN** the page is completely rewritten in the database and on the filesystem, and the slug is recorded in the job's `pages_edited` list

#### Scenario: Valid partial page edit
- **WHEN** agent calls `edit_wiki_page` with a valid slug and an `edits` array containing `old_content` and `new_content`
- **THEN** the exact `old_content` matches are replaced with `new_content` in the page, the page is saved, and the slug is recorded in the job's `pages_edited` list

#### Scenario: Invalid tool usage
- **WHEN** agent calls `edit_wiki_page` providing BOTH `content` and `edits`
- **THEN** the tool returns a validation error instructing the agent to use only one approach

#### Scenario: Invalid slug rejected
- **WHEN** agent calls `edit_wiki_page` with a slug longer than 60 chars or not matching kebab-case
- **THEN** the tool returns a validation error and the page is not modified
