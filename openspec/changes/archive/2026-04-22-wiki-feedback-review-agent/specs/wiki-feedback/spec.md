## ADDED Requirements

### Requirement: User can submit feedback on a wiki article
The system SHALL provide a comment section below each wiki article where the user can submit plain-text feedback. Submitting a comment SHALL immediately create a `pending` comment record and enqueue an async review job.

#### Scenario: Successful comment submission
- **WHEN** user submits non-empty feedback text on a wiki article page
- **THEN** a comment record is created with status `pending` and the page shows the comment in the pending state

#### Scenario: Empty feedback is rejected
- **WHEN** user submits an empty or whitespace-only feedback string
- **THEN** the system SHALL reject the request with a 400 error and no comment is created

### Requirement: Comment status is visible in the UI
The system SHALL display each comment's current status (`pending`, `processing`, `answered`, `failed`) so the user knows whether the reviewer has acted on it.

#### Scenario: Pending comment display
- **WHEN** a comment has status `pending` or `processing`
- **THEN** the UI SHALL show the feedback text with a visual indicator that the review is in progress

#### Scenario: Answered comment display
- **WHEN** a comment has status `answered`
- **THEN** the UI SHALL show the feedback text and the agent's reasoning reply below it, and display the list of pages edited (if any)

#### Scenario: Failed comment display
- **WHEN** a comment has status `failed`
- **THEN** the UI SHALL show the feedback text and an error message indicating the review could not be completed

### Requirement: User can archive answered comments
The system SHALL allow the user to archive any answered comment to keep the section clean. Archived comments SHALL NOT appear in the default comment list.

#### Scenario: Archive an answered comment
- **WHEN** user clicks the archive action on an answered comment
- **THEN** the comment status is updated to `archived` and it disappears from the visible comment section

#### Scenario: Cannot archive pending or processing comments
- **WHEN** user attempts to archive a comment that is not in `answered` or `failed` status
- **THEN** the system SHALL reject the request with a 400 error

### Requirement: Comment state is durable across server restarts
The system SHALL persist all comment state in the database. Comments in `processing` state when the server starts SHALL be reset to `pending` so the review queue can process them.

#### Scenario: Server restart with in-flight comment
- **WHEN** the server restarts and a comment is found in `processing` state in the database
- **THEN** the comment status is reset to `pending` and the comment is re-enqueued for review
