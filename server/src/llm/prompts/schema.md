# LLM Wiki Schema

This schema is the single source of truth for the structure, rules, and conventions of all wiki pages. Any tool or agent that reads, writes, or references wiki content must follow these rules.

## Purpose

This wiki is a **concept-oriented knowledge base** focused on AI, software engineering, architecture, and adjacent technical domains. Each page covers ONE concept, technique, pattern, or reference that can be independently linked from other pages via `[[slug]]`.

## Fidelity to Sources

The wiki must remain faithful to the raw sources it is built from. This is non-negotiable.

- **Never invent facts**. Only write what the raw source states or directly implies.
- **Never extrapolate** beyond what the source supports. If the source says a technique works in one context, do not generalize it to others.
- **Never merge unrelated claims** from different sources into a single statement that none of them made.
- **When the source is uncertain or hedged**, reflect that uncertainty in the wiki page. Do not turn "may help" into "helps".
- **Every claim must be traceable** to a cited source via `/raw/{id}`. Sentences without a citation are not allowed.
- **When updating a page**, rewrite the saved markdown body so the new source is physically reflected in the article text, even if the only new contribution is an added citation.
- **When sources disagree about the same concept**, keep a single page for that concept and represent the competing claims explicitly with separate inline citations. Do not silently overwrite one position with the other.
- **When contradiction exists**, flag a `contradiction` warning for human review, but still preserve both positions in the page content. Where either source includes a publication date or references a specific time period, surface that context explicitly in the prose so readers can assess recency without having to follow the citation link: `"Según [fuente de 2024](/raw/3)... Sin embargo, [una fuente posterior](/raw/7) sostiene..."`. The inline citation is the ground truth for temporal ordering.

## What to Extract

When processing a raw source, extract content into wiki pages using these categories:

- **Concepts** — named ideas, definitions, mental models, principles
- **Techniques** — methods, procedures, patterns, step-by-step approaches
- **References** — external standards, specifications, libraries, tools mentioned by the source

What NOT to extract:

- Author opinions framed as personal commentary (unless they define a concept)
- Anecdotes, stories, examples from the author's life
- Article navigation, prefaces, acknowledgments
- Marketing language or product pitches

## Page Types

Every page has exactly one type:

| Type | Use for |
|------|---------|
| `concept` | Core ideas, definitions, principles, mental models |
| `technique` | Methods, procedures, patterns, step-by-step approaches |
| `reference` | Summaries of external resources, standards, tools, libraries |
| `index` | Curated collections that link related pages under a theme |

## Language Policy

- **Body text, titles, summaries, section headings**: Spanish
- **Technical terms inline**: keep in English when they are the established industry term in the source domain
- **Slugs and tags**: always English, regardless of content language

## Slug Rules

Slugs are URL-safe identifiers used for cross-referencing (`[[slug]]`). They must be consistent and predictable.

### Format

- **Regex**: `^[a-z0-9]+(-[a-z0-9]+)*$`
- **Max 60 characters**
- **Lowercase kebab-case**: letters, numbers, single hyphens
- **English only**, 2-4 words, short and descriptive

### Naming conventions

1. **One concept per slug** — never concatenate multiple concepts
2. **Name the concept, not the article** it came from
3. **Use the established term** from the field, not a description of it
4. **No filler words** (`the`, `a`, `of`, `for`) unless part of the established term
5. **No trailing fragments** or article-title remnants
6. **No author names, publication names, or dates** in the slug

## Tag Taxonomy

Use only these tags. Do not invent new ones.

### Domain Tags
- `ai` — Artificial Intelligence (broad)
- `llm` — Large Language Models
- `nlp` — Natural Language Processing
- `ml` — Machine Learning
- `rag` — Retrieval-Augmented Generation
- `agents` — AI Agents and Tool Use
- `software-engineering` — Software development practices and methodologies
- `architecture` — System and software architecture patterns
- `devops` — CI/CD, infrastructure, deployment
- `testing` — Testing strategies and frameworks
- `data` — Data engineering, databases, pipelines

### Depth Tags
- `fundamentals` — Beginner-friendly introduction
- `advanced` — Requires prior knowledge
- `research` — Active research area, evolving

### Practical Tags
- `implementation` — How-to and code guidance
- `troubleshooting` — Debugging and problem-solving
- `performance` — Optimization and efficiency

### Content Tags
- `tutorial` — Step-by-step learning
- `theory` — Conceptual foundation
- `case-study` — Real-world example
- `tool` — Description of a library/tool

## Page Structure

Every page follows this structure:

- **H1 title** matching the page title
- **One introductory paragraph** summarizing the concept faithfully to the source
- **H2 sections** as appropriate to the content. Common sections include: Definición, Principios Clave, Funcionamiento, Ejemplos, Conceptos Relacionados, Errores Comunes. Use only the sections that the source material actually supports — do not invent content to fill empty sections.
- **No YAML frontmatter** in content (metadata is stored separately via tool parameters)
- **No "Fuentes" or "Referencias" section** (the system renders sources automatically from metadata)

## Cross-References

### Wiki links

Use `[[slug]]` to link to other wiki pages. The slug must match an existing or newly created page.

- When a sentence mentions another wiki concept, link the concept with `[[slug]]`.
- Do not link wiki concepts directly to `/raw/{id}`.
- Raw links are evidence citations only; concept navigation must use `[[slug]]`.
- Correct pattern: `[[harness-engineering]] ... [1](/raw/2#user-content-fragment)`.
- Incorrect pattern: `[harness engineering](/raw/2)`.

### Source citations

Cite information from raw sources using markdown links pointing to `/raw/{id}`. Every factual claim, definition, or assertion must carry an inline citation to the raw source it came from. Place citations immediately after the claim they support.

Reference style:
- Write citations as markdown links, for example `[1](/raw/{id})` or `[1](/raw/{id}#user-content-fragment)`.
- Use `/raw/{id}#fragment` when the supporting evidence comes from a specific section heading in the raw source.
- Use `/raw/{id}` when no suitable section heading exists.
- Use only valid section-heading fragments from the raw source.
- Do not invent fragments.
- Do not use the document title or top-level H1 as a citation fragment.
- Do not write bare bracketed paths such as `[/raw/{id}]` or `[/raw/{id}#fragment]`.

When updating a page, preserve all existing citations from previous sources. Add new citations alongside them — never replace or remove existing ones.

When a new source touches an existing concept, the article body itself must be rewritten so the new citation appears in the markdown content, not only in metadata or relational storage.

When two sources support different interpretations or conflicting claims about the same concept, write both claims explicitly and attach each citation to the exact statement it supports.

**Citation as contribution**: every raw source that touches a concept must appear as a citation in that concept's wiki page. When a raw source mentions a topic that already has a wiki page, the new raw source ID is added to the page's citations even if no new factual content is introduced. The citation itself is a valid contribution — it records that this source also discusses the concept, which is information future queries and audits will need. Pages are never left untouched when their concept is mentioned by a new source.

When adding a citation-only contribution, attach the new citation inline immediately after an existing claim that the new raw source also supports — not loosely at the end of a section or paragraph where it backs nothing specific. If no existing claim is actually supported by the new source, then the source does introduce new content: write a new sentence or section that captures what it says and cite it there.

## Formatting Rules

- `**bold**` for key terms being defined
- `*italic*` for emphasis or alternatives
- `` `code` `` for technical terms, function names, filenames, identifiers
- Triple backticks with language spec for code blocks

## Granularity Guide

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
