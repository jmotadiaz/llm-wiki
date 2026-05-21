# Writer-specific analysis reference

Load this when analyzing any `writer-<slug>.json` file.

## Role

Each writer agent creates or updates a **single wiki page**. It reads the raw source, the plan item for its page, and sibling page slugs. It uses `maxSteps: 15` and the "flash" model.

## Tools vocabulary

| Tool | Purpose |
|------|---------|
| `get_wiki_page` | Reads existing page content (for updates) |
| `add_wiki_page` | Creates a new wiki page |
| `edit_wiki_page` | Updates an existing wiki page |
| `delete_wiki_page` | Removes a wiki page (rare) |
| `report_warning` | Reports a lint/content warning for later review |

## What to look for

### Write operation type
- **`add_wiki_page`** — new page creation (plan item action: "new")
- **`edit_wiki_page`** — existing page update (plan item action: "update")
- Check `toolResults` for `success: true/false` and `action: "created"/"updated"`

### Common patterns

#### Successful write flow
1. Step 0: `get_wiki_page` — reads existing page (if updating)
2. Steps 1-N: processes content, may call `get_wiki_page` for cross-references
3. Final write step: `add_wiki_page` or `edit_wiki_page` with full markdown content
4. Last step: `finishReason: "stop"` with summary text in Spanish

#### Content volume signals
- High `outputTokens` (>1000) on write steps indicate substantial page content
- Check `toolCalls[].input.content` length for the actual page size
- Writers produce pages in Spanish with `[[slug]]` cross-references and `[N](/raw/{id})` citations

#### Warning reports
- `report_warning` calls indicate the writer detected content issues
- Check `toolCalls[].input` for `type` and `message`
- Common warning types: `inconsistency`, `duplicate`, `missing_citation`

#### Error handling
- If a writer fails, the step array may end abruptly
- Check for missing write tool calls — a writer that never calls `add_wiki_page` or `edit_wiki_page` failed to produce output
- Errors are caught at the workflow level; failed writers produce `{success: false, error: "..."}` in results

### Metrics to check

- Total steps per writer (typically 2–5)
- Whether the page was created vs updated
- Number of `report_warning` calls
- Token usage: especially `outputTokens` (proportional to page size)
- `cachedInputTokens` ratio (higher = better reuse of system context)
- Number of `get_wiki_page` calls (context gathering depth)

## jq-style analysis (for reference)

```bash
SESSION="anemic-domain-model-raw78-08a043ca"
WRITER="traces/${SESSION}/writer-anemic-domain-model.json"

# Quick summary
python3 -c "
import json
steps = json.load(open('$WRITER'))
print(f'Steps: {len(steps)}')
total_tokens = sum(s['usage']['totalTokens'] for s in steps)
print(f'Total tokens: {total_tokens:,}')
tools = set()
for s in steps:
    for tc in s.get('toolCalls', []):
        tools.add(tc['toolName'])
print(f'Tools used: {tools}')
for s in steps:
    for tc in s.get('toolCalls', []):
        if tc['toolName'] in ('add_wiki_page', 'edit_wiki_page'):
            content_len = len(tc.get('input', {}).get('content', ''))
            print(f'  -> {tc[\"toolName\"]}: {content_len:,} chars of content')
"

# Warnings reported
python3 -c "
import json
steps = json.load(open('$WRITER'))
for s in steps:
    for tc in s.get('toolCalls', []):
        if tc['toolName'] == 'report_warning':
            print(f'Step {s[\"stepNumber\"]}: {json.dumps(tc[\"input\"], indent=2)}')
"

# Step-by-step token usage
python3 -c "
import json
for s in json.load(open('$WRITER')):
    u = s['usage']
    print(f'Step {s[\"stepNumber\"]}: in={u[\"inputTokens\"]:,} out={u[\"outputTokens\"]:,} cached={u[\"cachedInputTokens\"]:,} total={u[\"totalTokens\"]:,}')" 
```
