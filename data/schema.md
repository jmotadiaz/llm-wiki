# LLM Wiki Schema

This schema defines the structure, types, and conventions for all wiki pages. Follow these rules during ingest to ensure consistency and cross-referenceability across the knowledge base.

## Language Policy

All wiki content must be written in **Spanish**. Follow these rules:

- **Main Content**: Write all body text, summaries, and explanations in Spanish.
- **Technical Terms**: Keep standard technical terms in **English** when they are industry standard (e.g., *prompt engineering*, *fine-tuning*, *RAG*, *token*, *LLM*, *API*, *embeddings*, *vector database*, etc.).
- **Section Headings**: Section headings must always be in Spanish (e.g., Definición, Principios Clave, Ejemplos, Conceptos Relacionados, Errores Comunes).
- **Slugs and Tags**: Slugs and tags must remain in **English** for technical consistency and system-wide searchability.

## Page Types

Every wiki page must have exactly one type from this enumeration:

| Type | Purpose | Characteristics | Example |
|------|---------|-----------------|---------|
| **concept** | Core ideas, definitions, principles | Explains a concept with context and implications | "Machine Learning", "Prompt Engineering" |
| **technique** | Methods, approaches, procedures | Step-by-step or procedural guidance | "Fine-tuning a Language Model", "Implementing RAG" |
| **reference** | External resources, standards, summaries | Curated summaries of external knowledge | "OpenAI API Documentation", "Academic Paper Summary" |
| **index** | Curated collections, overviews | Links related pages under a theme | "Learning Path: LLM Fundamentals", "Applications of NLP" |

## Page Metadata

Every page starts with YAML frontmatter (before the H1 title). Required and optional fields:

```yaml
---
type: concept                          # REQUIRED: one of [concept, technique, reference, index]
title: "Page Title"                    # REQUIRED: human-readable title (matches H1)
slug: page-title                       # REQUIRED: URL-safe identifier (kebab-case)
status: published                      # REQUIRED: one of [draft, published, archived]
tags: ai, llm, fundamentals            # REQUIRED: comma-separated tags (lowercase)
summary: "One-sentence summary"        # RECOMMENDED: brief description for index
sources: [raw-1, raw-5]                # RECOMMENDED: list of raw source IDs used
last_updated: 2024-04-09               # AUTO-GENERATED: system timestamp
---
```

### Field Rules

- **slug**: Must be unique across wiki. Format: `lowercase-with-hyphens`. No special characters.
- **status**: 
  - `draft`: Work in progress, not yet finalized
  - `published`: Complete and ready for reference
  - `archived`: Superseded or outdated, kept for history
- **tags**: Use from the taxonomy below. Create new tags sparingly and document them.
- **summary**: Optional but strongly recommended for discoverability. Keep under 120 characters.

## Tag Taxonomy

Use these tags to categorize pages. Avoid creating new tags unless necessary.

### Domain Tags
- `ai` — Artificial Intelligence (broad)
- `llm` — Large Language Models
- `nlp` — Natural Language Processing
- `ml` — Machine Learning
- `rag` — Retrieval-Augmented Generation
- `agents` — AI Agents and Tool Use

### Concept Depth
- `fundamentals` — Beginner-friendly introduction
- `advanced` — Requires prior knowledge
- `research` — Active research area, evolving

### Practical Application
- `implementation` — How-to and code guidance
- `troubleshooting` — Debugging and problem-solving
- `performance` — Optimization and efficiency

### Content Type
- `tutorial` — Step-by-step learning
- `theory` — Conceptual foundation
- `case-study` — Real-world example
- `tool` — Description of a library/tool

## Cross-Reference Conventions

Use these formats to link between pages and sources.

### Internal Wiki Links

Use `[[slug]]` to link to other wiki pages. The slug must match exactly.

```markdown
This technique builds on concepts from [[prompt-engineering]] and [[few-shot-learning]].

For implementation details, see [[fine-tuning-language-models]].
```

**Rules:**
- Use full slug (kebab-case) inside brackets
- Link to relevant concepts; assume reader may not know them
- Place links naturally in text, not as bullet lists unless organizing a collection

### Raw Source Citations

To cite raw sources inline, use standard markdown links pointing to the `/raw/{id}` path.

```markdown
This concept was introduced in research by Smith [1](/raw/3) or detailed here [Fuente](/raw/3).
```

**Rules:**
- Use the path `/raw/{id}` where `{id}` is the integer ID of the raw source.
- Do NOT create a footnotes or sources section at the bottom of the page. The system UI automatically displays sources based on the YAML frontmatter.

### Backlinks

Backlinks are automatically maintained by the system. When page A references page B via `[[b-slug]]`, B automatically lists A in its backlinks.

## Content Structure

Every page should follow this structure:

```markdown
---
type: concept
title: "Prompt Engineering"
slug: prompt-engineering
status: published
tags: llm, fundamentals, implementation
summary: "Techniques for crafting effective prompts to LLMs"
---

# [Título de la Página]

Resumen de un párrafo sobre qué es este concepto y por qué es importante.

## Definición

Definición clara y concisa. ¿Qué es esto? ¿Qué problemas resuelve?

## Principios Clave

Lista de 3-5 principios o características fundamentales.

## Ejemplos

Ejemplos reales y concretos que muestran el concepto en la práctica.

## Conceptos Relacionados

Breve mención de ideas relacionadas (con `[[wiki-links]]` donde sea apropiado).

## Errores Comunes

Errores o malentendidos que deben evitarse.
```

**Structure Guidelines:**
- Start with a one-paragraph summary before subheadings
- Use H2 headings for major sections
- Keep sections focused; break into multiple pages if complex
- Always include at least one concrete example

## Formatting Rules

### Emphasis and Code

- `**bold**` for key terms being defined
- `*italic*` for gentle emphasis or alternatives
- `` `code` `` for technical terms, function names, filenames
- Triple backticks for code blocks with language specification

```python
def hello():
    return "world"
```

### Lists

- Use `-` for unordered lists (consistency with markdown)
- Use `1.` for numbered steps in procedures
- Indent nested items with 2 spaces

### Admonitions

Use these sparingly for important warnings or tips:

> ⚠️ **Warning**: Do not use this technique in production without testing.

> 💡 **Tip**: This works best when combined with [[few-shot-learning]].

### Tables

Use markdown tables for comparisons and structured data:

| Aspect | Option A | Option B |
|--------|----------|----------|
| Speed  | Fast     | Slow     |
| Cost   | High     | Low      |

## Link Validation Rules

After ingest, these links are validated by the lint system:

- **Broken links**: `[[nonexistent-slug]]` → Flagged as error
- **Orphan pages**: No incoming links and not linked in index → Marked as warning
- **Stale pages**: All source citations are archived → Marked as warning
- **Circular references**: A→B→A patterns are OK, but noted

## Example: Complete Page

```markdown
---
type: technique
title: "Few-Shot Learning with LLMs"
slug: few-shot-learning
status: published
tags: llm, implementation, fundamentals
summary: "Technique of providing examples in prompts to teach LLMs tasks"
sources: [raw-12, raw-15]
---

# Few-Shot Learning con LLMs

El **few-shot learning** es la práctica de incluir un pequeño número de ejemplos de entrada-salida en un *prompt* para enseñar a un LLM a realizar una tarea específica. A diferencia del aprendizaje automático tradicional, que requiere actualizaciones de gradiente, el *few-shot learning* funciona enteramente a través del contexto del *prompt*.

## Definición

Proporcionar de 2 a 5 ejemplos del formato de entrada-salida deseado antes de la consulta real. El LLM aprende el patrón de estos ejemplos (*in-context learning*) sin actualizaciones del modelo.

## Principios Clave

1. **Diversidad de ejemplos**: Elegir ejemplos que cubran el rango de casos que el modelo verá.
2. **Consistencia de formato**: Todos los ejemplos deben seguir exactamente la misma estructura.
3. **Claridad de límites**: Incluir casos de borde para mostrar qué NO hacer.
4. **Conjunto mínimo suficiente**: 3-5 ejemplos suelen ser óptimos; más pueden confundir.

## Cómo Funciona

El LLM lee los ejemplos e infiere el patrón de la tarea a través de la predicción del siguiente *token*. No ocurre un aprendizaje real; los ejemplos son simplemente contexto.

## Ejemplo

\`\`\`
Tarea: Extraer entidades nombradas de reseñas de clientes (salida como JSON)

Ejemplo 1:
Entrada: "¡Me encanta mi nuevo iPhone, la pantalla es increíble!"
Salida: {"product": "iPhone", "sentiment": "positive", "features": ["display"]}

Ejemplo 2:
Entrada: "El portátil era lento pero la duración de la batería es asombrosa."
Salida: {"product": "laptop", "sentiment": "mixed", "features": ["battery life"]}

Ahora clasifica esta reseña:
Entrada: "La calidad de sonido de los AirPods Pro es sobresaliente, vale la pena el precio."
Salida: ?
\`\`\`

El LLM debería responder con: \`{"product": "AirPods Pro", "sentiment": "positive", "features": ["sound quality"]}\`

## Conceptos Relacionados

- [[zero-shot-learning]]: No se proporcionan ejemplos.
- [[fine-tuning-language-models]]: Los pesos del modelo se actualizan; requiere muchos ejemplos y computación.
- [[chain-of-thought]]: Se muestran pasos de razonamiento, no ejemplos de tareas.

## Errores Comunes

1. **Formato inconsistente** entre ejemplos y la tarea real.
2. **Demasiados ejemplos** (>7) que pueden introducir ruido.
3. **Falta de casos de borde**: si una reseña tiene múltiples productos, los ejemplos deberían mostrar esto.
4. **Ejemplos desequilibrados**: todas las reseñas positivas enseñan un patrón desequilibrado.

> 💡 **Tip**: Prueba tus ejemplos a fondo. Lo que parece claro para un humano puede confundir al LLM.
```

## Schema Version

**Current Version:** 1.0 (2024-04-09)

This schema defines the contract between the ingest LLM and the backend system. Pages must conform to these rules for proper indexing, linking, and lint validation.
