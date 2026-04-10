## ADDED Requirements

### Requirement: Tier 1 deterministic lint
The system SHALL run deterministic lint checks after every ingest on affected pages. Checks include: broken link detection (`[[X]]` where X does not exist), orphan page detection (no incoming links), stale page detection (not updated in >N days), and metadata validation. Results SHALL be stored in `lint_warnings` SQLite table.

#### Scenario: Broken link detected
- **WHEN** wiki page "ml-infrastructure" contains `[[nonexistent-page]]` and no page with that slug exists
- **THEN** a lint warning of type "broken_link" is created for "ml-infrastructure"

#### Scenario: Orphan page detected
- **WHEN** wiki page "isolated-topic" has zero incoming links from other pages
- **THEN** a lint warning of type "orphan" is created for "isolated-topic"

#### Scenario: Stale page detected
- **WHEN** wiki page "old-topic" has not been updated in more than the configured threshold days
- **THEN** a lint warning of type "stale" is created for "old-topic"

### Requirement: Tier 2 semantic local lint
The ingest LLM call SHALL include instructions to flag contradictions between the new raw source and existing wiki pages in context. Warnings SHALL be returned in the structured output and stored in `lint_warnings` with type "contradiction". This adds zero extra LLM calls (piggybacked on ingest).

#### Scenario: Contradiction flagged during ingest
- **WHEN** a new raw source contradicts information in an existing wiki page
- **THEN** the ingest LLM output includes a warning entry, which is stored in `lint_warnings`

### Requirement: Tier 3 semantic global lint
The system SHALL support a cron-triggered (nightly) global semantic audit. The process: (1) send `index.md` + `lint-queue.json` to the LLM to identify high-risk contradiction/duplication pairs, (2) retrieve those pages and send for detailed verification, (3) store findings in `lint_warnings` and append to `log.md`. This takes 2-3 LLM calls.

#### Scenario: Nightly audit finds duplication
- **WHEN** Tier 3 runs and the LLM identifies pages "redis-caching" and "caching-strategies" as likely duplicates
- **THEN** a lint warning of type "duplicate" is created with details about the overlap

#### Scenario: Manual Tier 3 trigger
- **WHEN** user clicks "Run Audit" on the dashboard
- **THEN** the Tier 3 semantic lint runs immediately (same as cron-triggered)

### Requirement: Lint warnings storage and resolution
All lint findings SHALL be stored in `lint_warnings` with columns: id, page_id (nullable), type (orphan, broken_link, stale, missing_page, contradiction, duplicate), message, created_at, resolved_at (nullable). Warnings SHALL be resolvable (marking resolved_at).

#### Scenario: Warning resolved after page update
- **WHEN** a broken link warning exists for `[[missing-page]]` and then a page "missing-page" is created
- **THEN** the Tier 1 lint re-run marks the broken_link warning as resolved (sets resolved_at)
