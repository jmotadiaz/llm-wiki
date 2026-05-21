# Learning Path-specific analysis reference

Load this when analyzing `traces/lp-*/` directories.

## Role

The learning-path pipeline creates or revises **learning-path** type pages — curated journeys through wiki content. It has a planner (no tools, generates a JSON plan from index) and writers (autonomous exploration of wiki pages).

## Directory layout

```
traces/lp-<mode>-<timestamp>-<id>/
  planner.json              # Plan: which paths to create/revise
  writer-<slug>.json        # One per learning-path page
```

## Pipeline flow

1. **Planner** — reads the wiki index + existing learning paths, outputs a JSON plan with `paths` array
2. **Writer** (parallel, max 3) — each writer explores the wiki autonomously to build/revise one learning-path page
3. **Aggregator** (deterministic, no LLM) — collects results, no trace file

## Planner specifics

- **No tools** — pure generation from system prompt context
- **maxSteps: 1** — single step output
- System prompt includes: wiki index, existing learning paths, mode block
- Plan schema: `{ paths: [{ slug, action: "new"|"revise", seedPages: [] }] }`
- **Modes**:
  - `regenerate-all`: all paths are "new" (existing LP pages wiped first)
  - `review`: can be "new" or "revise"

## Writer specifics

- **maxSteps: 30** — high limit for autonomous exploration
- Tools: `get_wiki_page`, `get_backlinks`, `add_wiki_page`, `edit_wiki_page`, `report_warning`, `set_lp_pages`
- Writers autonomously explore the wiki to find relevant pages for the learning path
- Each writer handles ONE learning-path page

## What to look for

### Planner
- Number of paths planned (`paths.length` in final step text)
- Mix of "new" vs "revise" actions
- `seedPages` count per path

### Writers
- Steps taken per writer (high count = deep exploration)
- Number of `get_wiki_page` calls (research depth)
- Whether page was created vs updated
- Token usage (writers with many steps consume significant tokens)
- Any `report_warning` calls

### Metrics
- Total pipeline tokens (often large due to writer parallelism)
- Cache hit rate (writers benefit from prompt caching)
- Time from planner to last writer completion

## jq-style analysis

```bash
SESSION="lp-review-2026-..."

# Plan details
python3 -c "
import json
steps = json.load(open('traces/$SESSION/planner.json'))
for s in reversed(steps):
    t = s.get('text', '')
    if 'paths' in t:
        import re
        m = re.search(r'\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`', t)
        if m:
            plan = json.loads(m.group(1).strip())
            for p in plan['paths']:
                print(f'{p[\"slug\"]}: {p[\"action\"]} (seeds: {len(p[\"seedPages\"])})')
        break
"

# Writer summary
python3 -c "
import json, glob, os
for f in sorted(glob.glob('traces/$SESSION/writer-*.json')):
    steps = json.load(open(f))
    slug = os.path.basename(f).replace('writer-', '').replace('.json', '')
    tokens = sum(s['usage']['totalTokens'] for s in steps)
    tools = set()
    for s in steps:
        for tc in s.get('toolCalls', []):
            tools.add(tc['toolName'])
    print(f'{slug}: {len(steps)} steps, {tokens:,} tokens, tools: {tools}')
"
```
