## ADDED Requirements

### Requirement: Index agent discovers domains from `d:` prefix
The system SHALL discover domains by selecting the set of distinct tags with the `d:` (discipline) prefix across all published `wiki_pages`. Each distinct `d:<slug>` value that appears on at least 5 published pages SHALL found exactly one domain. Pages belonging to a domain SHALL be exactly those that carry its `d:` tag. Tags with `t:` or `a:` prefixes SHALL NOT found a domain. The domain slug SHALL be the `<slug>` portion of the `d:` tag.

#### Scenario: Domain discovery from d: tags
- **WHEN** the wiki contains pages tagged `d:ai-agents` (12 pages), `d:software-testing` (4 pages) and `d:nlp` (8 pages)
- **THEN** the index agent discovers domains `ai-agents` and `nlp`
- **AND** `software-testing` is skipped because it is below the 5-page threshold
- **AND** `t:harness-engineering` does not found a domain regardless of page count

#### Scenario: Discipline below minimum threshold
- **WHEN** a `d:` tag has fewer than 5 pages
- **THEN** no domain-index or learning-path is created for that discipline
- **AND** those pages appear in the "Relacionado" section of other domain-index pages when they share `t:` tags with pages in those domains

### Requirement: Index agent generates one domain-index and one learning-path per domain
For each discovered domain meeting the minimum threshold, the index agent SHALL generate exactly one `domain-index` page and one `learning-path` page via `upsert_wiki_page`. If pages with those slugs already exist, they SHALL be overwritten.

#### Scenario: First run generates new pages
- **WHEN** the index agent runs and a domain has no existing index pages
- **THEN** two new wiki_pages are created: `domain-index-<domain>` and `learning-path-<domain>`, both with status `published`

#### Scenario: Subsequent run updates existing pages
- **WHEN** the index agent runs and `domain-index-<domain>` already exists
- **THEN** the existing page content is replaced with the newly generated content

### Requirement: Index agent orders learning path stages using wiki_links graph
The index agent SHALL use the `wiki_links` table to determine page ordering within a learning path. Pages with higher inbound link counts SHALL be placed in earlier stages (they are referenced by more pages, indicating foundational status). Depth tags (`fundamentals`, `advanced`) SHALL be used as a secondary signal to assign pages to stages.

#### Scenario: Foundational page ordering
- **WHEN** page A has 8 inbound links and page B has 1 inbound link within the same domain
- **THEN** page A appears in an earlier stage than page B in the learning path

#### Scenario: Depth tag as tiebreaker
- **WHEN** two pages have similar inbound link counts
- **THEN** the page tagged `fundamentals` appears in an earlier stage than the page without that tag

### Requirement: Index agent writes rationale for each page in learning paths
Each page listed in a learning-path SHALL include a one-sentence rationale in prose explaining why it belongs at that position in the learning sequence.

#### Scenario: Rationale written for each entry
- **WHEN** the index agent generates a learning-path page
- **THEN** each `[[slug]]` entry in the stage lists is followed by an em-dash and a rationale sentence

### Requirement: Index agent does not mutate tags on clustered pages
The index agent SHALL NOT modify the `tags` field of existing `wiki_pages` when discovering domains or generating indexes. Tag assignment (`d:`, `t:`, `a:`) is the sole responsibility of the ingest pipeline and the review agent, both of which write via the validated `upsert_wiki_page` tool. The index agent reads tags to cluster pages into domains and to find related pages across disciplines via shared `t:` tags.

#### Scenario: Index agent reads but does not write tags on clustered pages
- **WHEN** the index agent identifies a cluster of pages for a domain
- **THEN** the generated `domain-index` and `learning-path` pages carry their own tags (`d:<domain>`, `t:index`, `a:...`), but the clustered pages' tags remain unchanged

### Requirement: Index agent runs on cron schedule and on-demand
The index agent SHALL be scheduled to run nightly via `node-cron`. It SHALL also be triggerable on-demand via `POST /api/index/generate`, which accepts an optional `domain` parameter to regenerate only a specific domain-index and its learning-path.

#### Scenario: Full regeneration via cron
- **WHEN** the nightly cron fires
- **THEN** all domains are discovered and all index pages are regenerated

#### Scenario: On-demand full regeneration
- **WHEN** `POST /api/index/generate` is called without a `domain` parameter
- **THEN** all domains are discovered and all index pages are regenerated

#### Scenario: On-demand single domain regeneration
- **WHEN** `POST /api/index/generate` is called with `{ domain: "ai-agents" }`
- **THEN** only the `domain-index-ai-agents` and `learning-path-ai-agents` pages are regenerated
