## ADDED Requirements

### Requirement: Home page has three tabs
The home page (`/`) SHALL display three tabs: "Páginas", "Dominios", and "Learning Paths". The "Páginas" tab SHALL be the default active tab and display the existing wiki page list. The "Dominios" tab SHALL list all `domain-index` pages. The "Learning Paths" tab SHALL list all `learning-path` pages.

#### Scenario: Default tab on load
- **WHEN** a user navigates to `/`
- **THEN** the "Páginas" tab is active and the existing wiki page list is displayed

#### Scenario: Dominios tab shows domain indexes
- **WHEN** a user clicks the "Dominios" tab
- **THEN** a list of all `domain-index` pages is displayed, each showing its title, description excerpt, and page count

#### Scenario: Learning Paths tab shows learning paths
- **WHEN** a user clicks the "Learning Paths" tab
- **THEN** a list of all `learning-path` pages is displayed, each showing its title and domain

### Requirement: Each tab has a global regeneration trigger
The "Dominios" and "Learning Paths" tabs SHALL each display a "Regenerar todo" button that triggers `POST /api/index/generate` without parameters, regenerating all index pages.

#### Scenario: Global regeneration triggered
- **WHEN** a user clicks "Regenerar todo" in the "Dominios" tab
- **THEN** `POST /api/index/generate` is called, a loading state is shown, and the list refreshes on completion

### Requirement: Each index page has an individual regeneration trigger
Each `domain-index` and `learning-path` page, when rendered at `/wiki/<slug>`, SHALL display a "Regenerar" button. Clicking it SHALL call `POST /api/index/generate` with the appropriate `domain` parameter.

#### Scenario: Individual regeneration triggered from page view
- **WHEN** a user clicks "Regenerar" on the `domain-index-testing` page
- **THEN** `POST /api/index/generate` is called with `{ domain: "testing" }`, and the page content refreshes on completion

### Requirement: Index pages display generation timestamp
Each rendered `domain-index` and `learning-path` page SHALL display a `generated_at` timestamp indicating when the content was last generated, so users can assess freshness.

#### Scenario: Timestamp shown on domain-index page
- **WHEN** a `domain-index` page is rendered
- **THEN** a "Generado el [date]" label is visible on the page

### Requirement: Tag chips strip role prefixes and differentiate classes visually
Whenever the client renders a tag (page detail, page list, filter chips, graph labels, domain tab), it SHALL strip the `d:`, `t:`, or `a:` prefix before displaying the text, and SHALL apply a visual style that identifies the tag's class. The three classes SHALL be distinguishable at a glance (e.g., color, chip outline, size, or icon).

#### Scenario: Prefix stripped on render
- **WHEN** a page carries tag `d:ai-agents`
- **THEN** the chip displays "ai-agents" (not "d:ai-agents")

#### Scenario: Discipline chip styled distinctly from topic and axis
- **WHEN** a page displays its tag list with `d:ai-agents`, `t:harness-engineering`, and `a:fundamentals`
- **THEN** the three chips use three different visual styles (e.g., solid filled, outlined, subdued) so their roles are distinguishable without reading the text

### Requirement: Home "Páginas" tab filters by discipline and topic
The "Páginas" tab SHALL expose a primary filter for discipline (`d:` tags present in the wiki) and a secondary filter for topics (`t:` tags). Selecting a discipline SHALL narrow the listing to pages with that `d:`; additionally selecting topics SHALL further narrow to pages that carry all selected `t:` tags.

#### Scenario: Discipline filter narrows listing
- **WHEN** a user selects the `ai-agents` discipline filter
- **THEN** the listing shows only pages with tag `d:ai-agents`

#### Scenario: Topic filter further narrows within a discipline
- **WHEN** a user has discipline `ai-agents` selected and then selects topic `harness-engineering`
- **THEN** the listing shows only pages with both `d:ai-agents` and `t:harness-engineering`
