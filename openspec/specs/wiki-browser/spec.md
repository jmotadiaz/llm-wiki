## ADDED Requirements

### Requirement: Wiki index view (Home Page)
The home page (`/`) SHALL display three tabs: "Páginas", "Dominios", and "Learning Paths". The "Páginas" tab SHALL be the default active tab and display the existing wiki page list. The "Dominios" tab SHALL list all `domain-index` pages. The "Learning Paths" tab SHALL list all `learning-path` pages.

The "Páginas" tab SHALL expose a primary filter for discipline (`d:` tags present in the wiki) and a secondary filter for topics (`t:` tags). Selecting a discipline SHALL narrow the listing to pages with that `d:`; additionally selecting topics SHALL further narrow to pages that carry all selected `t:` tags.

The "Dominios" and "Learning Paths" tabs SHALL each display a "Regenerar todo" button that triggers `POST /api/index/generate` without parameters, regenerating all index pages.

#### Scenario: Default tab on load
- **WHEN** a user navigates to `/`
- **THEN** the "Páginas" tab is active and the existing wiki page list is displayed

#### Scenario: Dominios tab shows domain indexes
- **WHEN** a user clicks the "Dominios" tab
- **THEN** a list of all `domain-index` pages is displayed, each showing its title, description excerpt, and page count

#### Scenario: Search and filter in Páginas tab
- **WHEN** user types "database" in the search box or selects a discipline filter (e.g., `ai-agents`) and topic filters
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

For index pages (`type IN ('domain-index', 'learning-path')`), the view SHALL additionally display:
- A `generated_at` timestamp indicating when the content was last generated.
- A "Regenerar" button that calls `POST /api/index/generate` with the appropriate `domain` parameter.

#### Scenario: Render wiki page with links
- **WHEN** user navigates to wiki page "vector-databases"
- **THEN** system renders the markdown with `[[related-page]]` as clickable links navigating to those wiki pages, and `[^raw-abc123]` as links to the raw source view

#### Scenario: Index page with timestamp and regeneration
- **WHEN** user views `domain-index-testing`
- **THEN** the page displays a "Generado el [date]" label and a "Regenerar" button

#### Scenario: Backlinks panel
- **WHEN** wiki page "vector-databases" is viewed and pages "ml-infrastructure" and "search-systems" link to it
- **THEN** the backlinks panel shows "ml-infrastructure" and "search-systems" as clickable links

#### Scenario: Lint status badge
- **WHEN** a wiki page has active lint warnings
- **THEN** a warning badge is displayed with details of the warnings

### Requirement: Tag chips strip role prefixes and differentiate classes visually
Whenever the client renders a tag (page detail, page list, filter chips, graph labels, domain tab), it SHALL strip the `d:`, `t:`, or `a:` prefix before displaying the text, and SHALL apply a visual style that identifies the tag's class. The three classes SHALL be distinguishable at a glance (e.g., color, chip outline, size, or icon).

#### Scenario: Prefix stripped on render
- **WHEN** a page carries tag `d:ai-agents`
- **THEN** the chip displays "ai-agents" (not "d:ai-agents")

#### Scenario: Discipline chip styled distinctly
- **WHEN** a page displays its tag list with `d:ai-agents`, `t:harness-engineering`, and `a:fundamentals`
- **THEN** the three chips use three different visual styles (e.g., solid filled, outlined, subdued) so their roles are distinguishable without reading the text

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
