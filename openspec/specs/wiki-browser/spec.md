## ADDED Requirements

### Requirement: Wiki index view
The system SHALL display a browsable index of all wiki pages, parsed from `index.md`. Pages SHALL be grouped by tags with search and filter functionality.

#### Scenario: Browse index
- **WHEN** user navigates to the wiki index
- **THEN** system displays all wiki pages grouped by tags, each showing title, summary, tags, and last updated date

#### Scenario: Search and filter
- **WHEN** user types "database" in the search box or selects the "databases" tag filter
- **THEN** the index filters to show only matching pages

### Requirement: Markdown rendering with Streamdown
All markdown content across the application SHALL be rendered using Streamdown. Streamdown SHALL be configured with:
- `remark-wiki-link` plugin: transforms `[[slug]]` into clickable `<Link>` components navigating to `/wiki/{slug}`
- `remark-gfm` plugin: supports tables, strikethrough, task lists, and autolinks

Streamdown SHALL be used in two modes:
- **Static mode**: for wiki pages (`WikiPageDetail`), raw sources (`RawSourceView`), and ingest preview. Content is fully loaded before rendering.
- **Streaming mode**: for chat responses (`ChatPage`). Content is rendered incrementally as SSE chunks arrive.

The current `renderContent()` function (naive regex splitting on `[[wiki-links]]` that outputs plain text) SHALL be replaced entirely by Streamdown rendering. Currently no markdown is rendered — headers, bold, code blocks, lists, tables all display as raw text.

### Requirement: Wiki page view
Individual wiki pages SHALL be rendered via Streamdown in static mode with clickable `[[wiki-links]]` (via `remark-wiki-link`), inline footnote references linking to raw source views, a backlinks panel showing pages that link to this page, and a lint status badge.

#### Scenario: Render wiki page with links
- **WHEN** user navigates to wiki page "vector-databases"
- **THEN** system renders the markdown with `[[related-page]]` as clickable links navigating to those wiki pages, and `[^raw-abc123]` as links to the raw source view

#### Scenario: Backlinks panel
- **WHEN** wiki page "vector-databases" is viewed and pages "ml-infrastructure" and "search-systems" link to it
- **THEN** the backlinks panel shows "ml-infrastructure" and "search-systems" as clickable links

#### Scenario: Lint status badge
- **WHEN** a wiki page has active lint warnings
- **THEN** a warning badge is displayed with details of the warnings

### Requirement: Raw source view
The system SHALL render raw source documents via Streamdown in static mode. Raw sources SHALL be accessible through footnote links in wiki pages.

#### Scenario: View raw source from footnote
- **WHEN** user clicks a `[^raw-abc123]` footnote link in a wiki page
- **THEN** system navigates to the raw source view displaying the original document

### Requirement: Graph view
The system SHALL display an interactive force-directed graph of all wiki pages and their `[[wiki-links]]` using `react-force-graph-2d`. Clicking a node SHALL navigate to that page.

#### Scenario: Interactive graph navigation
- **WHEN** user opens the graph view and clicks on the "vector-databases" node
- **THEN** system navigates to the wiki page for "vector-databases"

#### Scenario: Graph reflects wiki state
- **WHEN** the wiki has pages A, B, C with A linking to B and C
- **THEN** the graph shows 3 nodes with directed edges from A to B and A to C

### Requirement: Client-side routing
The SPA SHALL use `react-router-dom` for navigation between all views (ingest, chat, wiki index, wiki pages, raw sources, graph, dashboard) without full page reloads.

#### Scenario: SPA navigation
- **WHEN** user clicks a wiki link or navigation element
- **THEN** the view updates without a full page reload via client-side routing
