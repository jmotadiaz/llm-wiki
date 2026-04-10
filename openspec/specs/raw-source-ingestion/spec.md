## ADDED Requirements

### Requirement: File upload ingestion

The system SHALL accept markdown file uploads via a form with manual title and author fields. The uploaded file SHALL be saved to `data/raw/` and registered in the `raw_sources` SQLite table with id, filename, title, author, checksum (SHA-256), and created_at.

#### Scenario: Successful file upload

- **WHEN** user uploads a `.md` file with title "My Notes" and author "John"
- **THEN** system saves the file to `data/raw/`, creates a `raw_sources` record with the provided metadata and SHA-256 checksum, and triggers the LLM ingest pipeline

#### Scenario: Duplicate file detection

- **WHEN** user uploads a file whose SHA-256 checksum matches an existing `raw_sources` record
- **THEN** system rejects the upload and informs the user the content already exists

### Requirement: URL-based ingestion via Jina Reader

The system SHALL accept a URL and optional CSS target selector. It SHALL call the Jina Reader API (GET `https://r.jina.ai/{url}`) with configured noise removal (`X-Remove-Selector` header) and `Accept: application/json`. The Jina service SHALL parse and return a structured object with all available metadata: `title` (from `data.title`), `description` (from `data.description`), `content` (from `data.content`), `publishedTime` (from `data.publishedTime`), and `author` (from `data.metadata.author`).

The `POST /api/ingest/url` endpoint SHALL return all five fields in its response JSON:

```json
{
  "success": true,
  "data": {
    "title": "string | null",
    "description": "string | null",
    "content": "string",
    "publishedTime": "string | null",
    "metadata": {
      "author": "string | null"
    }
  }
}
```

#### Scenario: Successful URL fetch

- **WHEN** user submits a URL "https://example.com/article"
- **THEN** system calls Jina Reader API and returns JSON with title, description, author, publishedTime, and markdown content
- **AND** the frontend pre-fills all form fields (title, description, author, published date, content) with the returned values

#### Scenario: URL fetch with CSS selector

- **WHEN** user submits a URL with CSS target selector "article.post-content"
- **THEN** system passes `targetSelector: "article.post-content"` to Jina Reader API, extracting only the targeted content

#### Scenario: URL fetch failure

- **WHEN** Jina Reader API returns an error or the URL is unreachable
- **THEN** system displays an error message and allows the user to retry or switch to file upload

### Requirement: Two-step URL ingestion flow

The URL ingestion SHALL follow a two-step process: (1) user submits URL, backend fetches and returns preview with metadata; (2) user reviews/edits the markdown and all metadata fields (title, description, author, published date) in a form, then clicks "Save" to persist and trigger ingest.

The ingest form (step 2) SHALL display the following editable fields, pre-filled from the Jina response:

- **Title** (text input, required)
- **Description** (text input, optional)
- **Author** (text input, optional)
- **Published Date** (date input, optional — parsed from `publishedTime`)
- **Content** (textarea/editor, required — markdown content)

#### Scenario: Review and edit before save

- **WHEN** Jina Reader returns content and metadata, and user edits any field
- **THEN** system saves the edited version (not the original Jina output) to `data/raw/` and SQLite

### Requirement: Save endpoint with full metadata

The `POST /api/ingest/save` endpoint SHALL accept all metadata fields: `title` (required), `description` (optional), `author` (optional), `publishedAt` (optional), `sourceUrl` (optional), and `content` (required). All fields SHALL be persisted to the `raw_sources` table.

### Requirement: Raw source metadata storage

Each raw source record SHALL store: id (PK), title (NOT NULL), description (nullable), source_url (nullable, canonical), author (nullable), published_at (nullable), content (NOT NULL), checksum (SHA-256, UNIQUE), created_at, updated_at.

The `raw_sources` table SHALL include `description` and `published_at` columns (both nullable).

#### Scenario: URL-sourced metadata

- **WHEN** a raw source is ingested via URL
- **THEN** the record includes the canonical URL as source_url, description from Jina's `data.description`, published_at from Jina's `data.publishedTime`, and author from Jina's `data.metadata.author`

#### Scenario: File-sourced metadata

- **WHEN** a raw source is ingested via file upload
- **THEN** source_url, description, and published_at are NULL; title and author come from form fields
