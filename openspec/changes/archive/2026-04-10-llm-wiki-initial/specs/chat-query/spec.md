## ADDED Requirements

### Requirement: Chat interface with SSE streaming
The system SHALL provide a chat interface where users submit questions and receive streamed responses via SSE. The frontend SHALL use Vercel AI SDK `useChat` hook and render streamed responses with Streamdown in streaming mode, configured with `remark-wiki-link` (for clickable `[[slug]]` links) and `remark-gfm`. The current naive `renderContent()` regex function SHALL be replaced by Streamdown streaming rendering.

#### Scenario: Ask a question
- **WHEN** user types "What are the trade-offs between Pinecone and pgvector?" and submits
- **THEN** the system streams an LLM-generated response that appears incrementally in the chat view

### Requirement: Agent loop with tool calling
The backend SHALL use Vercel AI SDK `streamText` with `maxSteps` for an agent loop. The LLM SHALL have access to tools: `get_wiki_pages({ slugs })`, `get_backlinks({ slug })`, `get_page_sources({ slug })`, and `get_recent_ingests({ n })`. The LLM autonomously decides which tools to call.

#### Scenario: LLM retrieves wiki pages
- **WHEN** user asks about "vector databases" and the index contains a relevant page
- **THEN** the LLM calls `get_wiki_pages` with the relevant slugs, reads the content, and synthesizes an answer

#### Scenario: LLM explores backlinks
- **WHEN** user asks "what topics reference vector databases?"
- **THEN** the LLM calls `get_backlinks({ slug: "vector-databases" })` to discover linking pages

#### Scenario: LLM checks provenance
- **WHEN** user asks "where does the info about Pinecone pricing come from?"
- **THEN** the LLM calls `get_page_sources({ slug: "vector-databases" })` to retrieve the raw source documents

#### Scenario: LLM reports recent ingests
- **WHEN** user asks "what did I add recently?"
- **THEN** the LLM calls `get_recent_ingests({ n: 5 })` and summarizes the latest raw sources

### Requirement: Wiki link references in responses
Chat responses SHALL include `[[Page Name]]` wiki-link syntax referencing the wiki pages used as sources. These SHALL render as clickable navigation links via `remark-wiki-link`.

#### Scenario: Response with wiki references
- **WHEN** the LLM uses pages "vector-databases" and "ml-infrastructure" to answer a question
- **THEN** the response includes `[[vector-databases]]` and `[[ml-infrastructure]]` rendered as clickable links

### Requirement: Knowledge boundary honesty
The LLM SHALL explicitly state when the wiki does not contain enough information to answer a question, rather than hallucinating.

#### Scenario: Insufficient wiki knowledge
- **WHEN** user asks about a topic not covered by any wiki page
- **THEN** the LLM responds that the wiki does not contain information on this topic

### Requirement: Stateless chat
Chat SHALL be stateless between sessions. No conversation history is persisted.

#### Scenario: New session
- **WHEN** user reloads the page or returns later
- **THEN** the chat starts fresh with no prior conversation context

### Requirement: L1 context in system prompt
Every query call SHALL include `schema.md` and `index.md` in the system prompt, giving the LLM a complete catalog of wiki pages to reason about relevance before calling tools.

#### Scenario: Index-informed tool usage
- **WHEN** user asks a question
- **THEN** the LLM reads the index in context to identify relevant page slugs before calling `get_wiki_pages`
