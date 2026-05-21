# Planner-specific analysis reference

Always load this when analyzing `planner.json`.

## Role

The planner is a **read-only** agent. It reads the raw source document and existing wiki pages, then produces a structured ingest plan (JSON) determining which wiki pages to create, update, or mention. It uses `maxSteps: 20` and the "flash" model.

## Tools vocabulary

| Tool | Purpose |
|------|---------|
| `get_wiki_page` | Reads an existing wiki page by slug to check current content |
| `get_backlinks` | Finds which existing pages link to a given slug (for inbound link analysis) |

## What to look for

### Plan quality signals
- **Number of `get_wiki_page` calls** — more calls generally mean more thorough context gathering
- **Parallel tool calls** — planner often calls `get_wiki_page` with 2+ slugs simultaneously; check `toolCalls` array length per step
- **High token usage on first step** — planner loads the full wiki index, schema, raw heading index, and domain tag counts as system prompt context

### Common patterns

#### Expensive initial context load
- Step 0 typically has very high `inputTokens` (20K–60K+) because the system prompt includes:
  - `L1_INDEX` — full wiki page listing (slugs, titles, tags)
  - `DOMAIN_TAGS_INDEX` — domain tag usage counts
  - `L1_SCHEMA` — wiki page schema definition
  - `RAW_HEADING_INDEX` — heading structure of the raw source

#### Good caching behavior
- Look for `cachedInputTokens` increasing across steps — the planner benefits heavily from prompt caching on the system context
- Step 0: low cache (cold start)
- Step 1+: high cache (system prompt reused)

#### Plan parsing
- The planner's final step (finishReason: "stop") outputs the plan as JSON in the `text` field
- The plan structure includes: `pages` (array of PlanItem), `inlineMentions`, `inboundLinkUpdates`, `tagLandscapeUpdates`, `warnings`

### Metrics to check

- Total steps (typically 2–8)
- Total tokens (input + output)
- Cache hit rate (`cachedInputTokens / inputTokens`)
- Number of unique wiki pages read (count distinct `get_wiki_page` calls)
- Number of pages planned (from the plan JSON in the final step's `text`)

## jq-style analysis (for reference)

```bash
SESSION="anemic-domain-model-raw78-08a043ca"
PLANNER="traces/${SESSION}/planner.json"

# Step count and finish reasons
python3 -c "import json; steps=json.load(open('$PLANNER')); print(f'Steps: {len(steps)}'); [print(f'  Step {s[\"stepNumber\"]}: {s[\"finishReason\"]}') for s in steps]"

# Token usage per step
python3 -c "import json; [print(f'Step {s[\"stepNumber\"]}: input={s[\"usage\"][\"inputTokens\"]}, output={s[\"usage\"][\"outputTokens\"]}, cached={s[\"usage\"][\"cachedInputTokens\"]}') for s in json.load(open('$PLANNER'))]"

# Tools called
python3 -c "
import json, collections
steps = json.load(open('$PLANNER'))
tools = collections.Counter()
for s in steps:
    for tc in s.get('toolCalls', []):
        tools[tc['toolName']] += 1
for t, c in tools.most_common():
    print(f'{t}: {c}')
"

# Final plan (JSON in text field)
python3 -c "
import json
steps = json.load(open('$PLANNER'))
for s in reversed(steps):
    if s.get('text') and s['finishReason'] == 'stop':
        print(s['text'][:2000])
        break
"
```
