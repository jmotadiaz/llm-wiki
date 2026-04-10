## ADDED Requirements

### Requirement: Wiki health overview
The dashboard SHALL display aggregated wiki health metrics: count of orphan pages, stale pages, broken links, missing pages, and pending lint warnings.

#### Scenario: Dashboard displays metrics
- **WHEN** user navigates to the dashboard
- **THEN** system shows counts for each lint warning type and lists the affected pages

### Requirement: Lint warning details
The dashboard SHALL list individual lint warnings with their type, affected page, message, and creation date. Warnings SHALL be filterable by type.

#### Scenario: Filter warnings by type
- **WHEN** user selects "broken_link" filter
- **THEN** only broken link warnings are displayed

### Requirement: Manual Tier 3 trigger
The dashboard SHALL provide a button to trigger a manual Tier 3 semantic audit. The UI SHALL show progress/status while the audit runs.

#### Scenario: Trigger manual audit
- **WHEN** user clicks "Run Semantic Audit"
- **THEN** the Tier 3 lint process starts, and the dashboard shows it is running

#### Scenario: Audit completes
- **WHEN** the Tier 3 audit finishes
- **THEN** the dashboard refreshes to show new findings and the last run timestamp

### Requirement: Lint run history
The dashboard SHALL display the timestamp and summary of the last lint run (both Tier 1 and Tier 3).

#### Scenario: Show last run info
- **WHEN** user views the dashboard after a lint run
- **THEN** system shows the timestamp of the last Tier 1 and Tier 3 runs
