### Purpose

This wiki is a **concept-oriented knowledge base** focused on AI, software engineering, architecture, and adjacent technical domains. Each page covers ONE concept, technique, pattern, or reference that can be independently linked from other pages via `[[slug]]`.

### Fidelity to Sources

The wiki must remain faithful to the raw sources it is built from. This is non-negotiable.

- **Never invent facts**. Only write what the raw source states or directly implies.
- **Never extrapolate** beyond what the source supports. If the source says a technique works in one context, do not generalize it to others.
- **Never merge unrelated claims** from different sources into a single statement that none of them made.
- **When the source is uncertain or hedged**, reflect that uncertainty in the wiki page. Do not turn "may help" into "helps".
- **Every claim must be traceable** to a cited source via `/raw/{id}`. Sentences without a citation are not allowed.
- **When updating a page**, rewrite the saved markdown body so the new source is physically reflected in the article text, even if the only new contribution is an added citation.
- **When sources disagree about the same concept**, keep a single page for that concept and represent the competing claims explicitly with separate inline citations. Do not silently overwrite one position with the other.
- **When contradiction exists**, flag a `contradiction` warning for human review, but still preserve both positions in the page content. Where either source includes a publication date or references a specific time period, surface that context explicitly in the prose so readers can assess recency without having to follow the citation link: `"Según [fuente de 2024](/raw/3)... Sin embargo, [una fuente posterior](/raw/7) sostiene..."`. The inline citation is the ground truth for temporal ordering.

### What to Extract

When processing a raw source, extract content into wiki pages using these categories:

- **Concepts** — named ideas, definitions, mental models, principles
- **Techniques** — methods, procedures, patterns, step-by-step approaches
- **References** — external standards, specifications, libraries, tools mentioned by the source

What NOT to extract:

- Author opinions framed as personal commentary (unless they define a concept)
- Anecdotes, stories, examples from the author's life
- Article navigation, prefaces, acknowledgments
- Marketing language or product pitches

### Page Types

Every page has exactly one type:

| Type            | Use for                                                                        |
| --------------- | ------------------------------------------------------------------------------ |
| `concept`       | Core ideas, definitions, principles, mental models                             |
| `technique`     | Methods, procedures, patterns, step-by-step approaches                         |
| `reference`     | Summaries of external resources, standards, tools, libraries                   |
| `domain-index`  | Auto-generated map of a domain: concepts, techniques, tools, related pages     |
| `learning-path` | Auto-generated ordered learning sequence for a domain, with per-page rationale |

Pages of type `domain-index` and `learning-path` are produced by the index agent, not by the ingest pipeline. Do not create them from the ingest writer.

### Language Policy

- **Body text, titles, summaries, section headings**: In Spanish, with the exception of technical terms
- **Technical terms**: ALWAYS keep in English when they are the established industry term in the source domain (e.g., "embeddings", "RAG", "agents", "tokenization", "fine-tuning"). Do NOT translate these terms to Spanish.
- **Slugs and tags**: always English, regardless of content language

### Slug Rules

Slugs are URL-safe identifiers used for cross-referencing (`[[slug]]`). They must be consistent and predictable.

#### Format

- **Regex**: `^[a-z0-9]+(-[a-z0-9]+)*$`
- **Max 60 characters**
- **Lowercase kebab-case**: letters, numbers, single hyphens
- **English only**, 2-4 words, short and descriptive

#### Naming conventions

1. **One concept per slug** — never concatenate multiple concepts
2. **Name the concept, not the article** it came from
3. **Use the established term** from the field, not a description of it
4. **No filler words** (`the`, `a`, `of`, `for`) unless part of the established term
5. **No trailing fragments** or article-title remnants
6. **No author names, publication names, or dates** in the slug

### Tag Taxonomy

A page's tags mix two kinds of classification: **discipline tags** (the broad field the page belongs to), **topic tags** (the specific concepts the page invokes), and **axis tags** (depth, practical, content metadata).

All tags on `wiki_pages` SHALL carry exactly one of three role prefixes. The format and cardinality rules are strictly enforced on every upsert:

- `d:<slug>` — **discipline**. The broad field or domain the page belongs to. **Each page MUST carry exactly one `d:` tag.**
- `t:<slug>` — **topic**. The specific concepts, patterns, or techniques the page invokes. **Each page MUST carry at least one `t:` tag** (typically 1-3).
- `a:<slug>` — **axis**. Meta-classification (depth/practical/content). **Zero or more per page.** The `<slug>` MUST be drawn from the closed whitelist.

The `<slug>` portion of all tags must match `^[a-z0-9]+(-[a-z0-9]+)*$`. The entire tag (including prefix) MUST match `^(d|t|a):[a-z0-9]+(-[a-z0-9]+)*$`.

#### Discipline Tags (`d:`)

A discipline tag names the primary domain or field that the page is part of (e.g., `d:ai-agents`, `d:software-testing`, `d:networking`).

- **Exactly ONE per page.**
- Pick the most specific discipline that still represents a broad field of study or practice.
- Do not use umbrella terms that are too generic (e.g., `d:computer-science`).

**Initial List of Disciplines:**
This is not a closed whitelist; you can expand it if a new page doesn't fit the initial list.

- `d:ai-agents` — Orchestration, harnesses, and evaluation of autonomous LLMs.
- `d:software-testing` — Patterns, isolation strategies (test doubles), and testing models.
- `d:software-architecture` — Large-scale system design and technological maintainability.
- `d:devops` — Continuous delivery, automation pipelines, and platform tooling.
- `d:natural-language-processing` — Core LLM mechanisms (transformers, embeddings, tokenization).
- `d:machine-learning` — General model learning, classification algorithms, and base metrics.

#### Topic Tags (`t:`)

A topic tag names a coherent concept, pattern, or technique that the page is meaningfully about (e.g., `t:event-sourcing`, `t:circuit-breaker`, `t:prompt-engineering`). Good topic tags are distilled from the page's own content.

- **At least ONE per page.**
- Concrete concepts cluster better than umbrellas.
- Reusing an existing topic tag connects this page to other pages that also touch the same concept, forming cross-domain relationships.

**Initial List of Topics:**
This is not a closed whitelist; you can expand it if a new page introduces a concrete concept not covered here.

- For `ai-agents`: `t:agent-harness`, `t:context-engineering`, `t:agent-evaluation`, `t:human-ai-interaction`.
- For `software-testing`: `t:test-doubles`, `t:test-strategy`, `t:integration-testing`, `t:test-patterns`.
- For `software-architecture` / `devops`: `t:continuous-delivery`, `t:ai-driven-development`.
- For `natural-language-processing` / `machine-learning`: `t:text-embeddings`, `t:transformer-architecture`, `t:semantic-search`, `t:text-classification`, `t:model-metrics`, `t:model-training`.

#### Axis Tags (`a:`)

Axis tags provide metadata about the nature of the page. Reuse these exactly when they apply. Do not invent new `a:` tags.

**Depth:**

- `a:fundamentals` — Beginner-friendly introduction
- `a:advanced` — Requires prior knowledge
- `a:research` — Active research area, evolving

**Practical:**

- `a:implementation` — How-to and code guidance
- `a:troubleshooting` — Debugging and problem-solving
- `a:performance` — Optimization and efficiency

**Content:**

- `a:tutorial` — Step-by-step learning
- `a:theory` — Conceptual foundation
- `a:case-study` — Real-world example
- `a:tool` — Third-party libraries, frameworks, or software products (e.g., React, Express, Docker)
- `a:standard` — Specifications, protocols, and built-in APIs (e.g., HTTP, Promise, Cookies)

#### Introducing a new tag

A new `d:` or `t:` tag is justified when a cluster of pages shares a coherent aspect that none of the canonical tags captures. New tags MUST follow the prefixed kebab-case format. When in doubt, pick the closest existing tag rather than creating a near-duplicate.

### Page Structure

Every page follows this structure:

- **H1 title** matching the page title
- **One introductory paragraph** summarizing the concept faithfully to the source
- **H2 sections** as appropriate to the content. Common sections include: Definición, Principios Clave, Funcionamiento, Ejemplos, Conceptos Relacionados, Errores Comunes. Use only the sections that the source material actually supports — do not invent content to fill empty sections.
- **No YAML frontmatter** in content (metadata is stored separately via tool parameters)
- **No "Fuentes" or "Referencias" section** (the system renders sources automatically from metadata)

#### Coherence requirement

A page built from multiple sources must read as a single unified article, not as a collage of excerpts. When multiple sources contribute to the same page:

- The section structure must reflect the concept's natural anatomy, not the ingestion order of sources.
- Claims from different sources on the same sub-topic must be merged into one cohesive paragraph with inline citations to each source — not kept as separate paragraphs that happen to be adjacent.
- Each section must have logical prose transitions; a reader should not be able to detect where one source ends and another begins.
- If existing sections were shaped by a single early source and a later source adds a substantially different angle, redesign the section layout so both angles are integrated naturally.

### Cross-References

#### Wiki links

Use `[[slug]]` to link to other wiki pages. The slug must match an existing or newly created page.

- When a sentence mentions another wiki concept, link the concept with `[[slug]]`.
- Raw links are evidence citations only; concept navigation must use `[[slug]]`.
- Write the concept name naturally in prose and place the bare `[[slug]]` inline: `el [[chain-of-thought]] permite...`.
- Correct pattern for wiki links: `[[harness-engineering]]`.
- **NEVER use piped aliases**: `[[slug|display text]]` is NOT supported. This system does not implement MediaWiki-style aliased links.

#### Source citations

Cite information from raw sources using markdown links pointing to `/raw/{id}`. Every factual claim, definition, or assertion must carry an inline citation to the raw source it came from. Place citations immediately after the claim they support.

Reference style:

- Write citations as markdown links, for example `[1](/raw/{id})` or `[1](/raw/{id}#user-content-{slug})`.
- Use `/raw/{id}#user-content-{slug}` when the supporting evidence comes from a specific section heading — copy the exact anchor from the **Available Raw Section Anchors** list in the prompt.
- Use `/raw/{id}` when no suitable section heading exists.

#### Citation and Link Syntax — Required Format

**Citations** always follow this shape: `[N](/raw/ID)` or `[N](/raw/ID#user-content-fragment)`.
The URL always closes with `)`. The citation number closes the text bracket with `]` before the `(`. These are the only valid forms:

- `[1](/raw/5)` — no fragment
- `[1](/raw/5#user-content-humans-on-the-loop)` — with fragment
- `El modelo observa el resultado [1](/raw/1#user-content-humans-on-the-loop).` — inline in prose

**Wiki links** always use bare `[[slug]]`. The syntax `[[slug|display text]]` is not supported and must never be written.

Correct patterns:
- `Los harnesses del [[agent-harness]] implementan la bash tool [1](/raw/3).`
- `el [[rag-method]] permite recuperar contexto relevante [1](/raw/5).`
- `the [[rag]] architecture [1](/raw/3)` — wiki link and citation are separate tokens

**Restructuring for Spanish prose**: when inserting a wiki link and the slug doesn't match the surrounding Spanish text, include the English technical term in the sentence rather than using an alias:
- Before: `el aprendizaje por refuerzo mejora con feedback humano`
- After: `el **reinforcement learning** ([[reinforcement-learning]]) mejora con feedback humano`

Rephrase the sentence to accommodate the English slug — never use `[[slug|translation]]`.

When updating a page, preserve all existing citations from previous sources. Add new citations alongside them — never replace or remove existing ones.

When a new source touches an existing concept, the article body itself must be rewritten so the new citation appears in the markdown content, not only in metadata or relational storage.

When two sources support different interpretations or conflicting claims about the same concept, write both claims explicitly and attach each citation to the exact statement it supports.

**Citation as contribution**: every raw source that touches a concept must appear as a citation in that concept's wiki page. When a raw source mentions a topic that already has a wiki page, the new raw source ID is added to the page's citations even if no new factual content is introduced. The citation itself is a valid contribution — it records that this source also discusses the concept, which is information future queries and audits will need. Pages are never left untouched when their concept is mentioned by a new source.

When adding a citation-only contribution, attach the new citation inline immediately after an existing claim that the new raw source also supports — not loosely at the end of a section or paragraph where it backs nothing specific. If no existing claim is actually supported by the new source, then the source does introduce new content: write a new sentence or section that captures what it says and cite it there.

### Formatting Rules

- `**bold**` for key terms being defined
- `*italic*` for emphasis or alternatives
- `` `code` `` for technical terms, function names, filenames, identifiers
- Triple backticks with language spec for code blocks

### Granularity Guide

**Create a separate page** when the concept:

- Has its own established name or term in the field
- Can stand alone with its own definition, principles, and examples
- Could be meaningfully linked from other pages via `[[slug]]`
- Has enough substance in the source to support a page (not just a passing mention)

**Do NOT create a separate page** when:

- It's a passing mention or illustrative example within a broader concept
- It's a synonym or minor variation of an existing page
- It has no independent substance beyond the parent concept — reference it inline with `[[slug]]` from the parent page instead
- The source only mentions it without explaining it
