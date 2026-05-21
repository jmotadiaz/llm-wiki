---
name: trace-analyzer
description: Analyze execution traces from LLM Wiki agent runs stored in traces/<session>/. Activated when the user provides a trace session name, raw source ID, or asks about debugging any agent run (ingest, learning-path, review, or chat). Supports analyzing planner, writer, aggregator, reviewer, and chat agent steps, tool calls, token usage, and errors.
---

# Trace Analyzer

Analyze an ingestion run by its trace session directory. All trace data lives under `traces/<session>/`.

## Input

The user provides either:
- A **trace session name** like `anemic-domain-model-raw78-08a043ca`
- A **raw source ID** like `raw-78` (find the matching session directory)
- A **partial name** matching any trace directory

## Run layout — by pipeline type

### Ingest pipeline (`traces/<title>-raw<N>-<id>/`)
```
planner.json              # Planner agent steps (read-only, creates the ingest plan)
aggregator.json           # Aggregator agent steps (post-ingest meta work)
writer-<slug>.json        # One file per writer agent (creates/edits wiki pages)
```

### Learning Path pipeline (`traces/lp-<mode>-<timestamp>-<id>/`)
```
planner.json              # Plans which learning paths to create/revise
writer-<slug>.json        # One per learning-path (autonomous wiki exploration)
```

### Review pipeline (`traces/review-<slug>-c<commentId>-<timestamp>/`)
```
reviewer.json             # Reviewer agent steps (processes feedback, edits pages, replies to comments)
```

### Chat/Query pipeline (`traces/chat-<sessionId>-<timestamp>/`)
```
chat.json                 # Chat agent steps (RAG-style wiki Q&A)
```

## Common step schema

Each `*.json` file is an **array** of step records (not JSONL):

```json
[
  {
    "timestamp": "ISO-8601",
    "stepNumber": 0,
    "finishReason": "tool-calls" | "stop" | "error",
    "text": "optional LLM text response",
    "toolCalls": [{"toolCallId":"...", "toolName":"...", "input":{}}],
    "toolResults": [{"toolCallId":"...", "toolName":"...", "output":{}}],
    "usage": {
      "inputTokens": 0,
      "outputTokens": 0,
      "totalTokens": 0,
      "cachedInputTokens": 0,
      "reasoningTokens": 0
    }
  }
]
```

## Agent types and roles by pipeline

### Ingest
| Agent | File pattern | Role | Tools |
|-------|-------------|------|-------|
| **Planner** | `planner.json` | Reads wiki + raw source, creates ingest plan | `get_wiki_page`, `get_backlinks` |
| **Writer** | `writer-<slug>.json` | Creates or updates a single wiki page | `get_wiki_page`, `add_wiki_page`, `edit_wiki_page`, `delete_wiki_page`, `report_warning` |
| **Aggregator** | `aggregator.json` | Post-ingest meta: inline mentions, inbound links, tags | `get_wiki_page`, `add_wiki_page`, `edit_wiki_page`, `delete_wiki_page`, `report_warning` |

### Learning Path
| Agent | File pattern | Role | Tools |
|-------|-------------|------|-------|
| **Planner** | `planner.json` | Plans which learning-paths to create/revise (no tools, just JSON plan) | none |
| **Writer** | `writer-<slug>.json` | Explores wiki autonomously to build a learning-path page | `get_wiki_page`, `get_backlinks`, `add_wiki_page`, `edit_wiki_page`, `report_warning`, `set_lp_pages` |

### Review
| Agent | File pattern | Role | Tools |
|-------|-------------|------|-------|
| **Reviewer** | `reviewer.json` | Processes user feedback, edits wiki pages, replies to comments | `get_wiki_page`, `edit_wiki_page`, `reply_to_comment`, `report_warning` |

### Chat/Query
| Agent | File pattern | Role | Tools |
|-------|-------------|------|-------|
| **Chat** | `chat.json` | RAG-style Q&A using wiki pages as context | `get_wiki_page`, `get_backlinks`, `list_wiki_pages` |

## Steps

1. **Find the trace session** — match the user's input to a `traces/` directory. Support raw IDs (`raw-78`), partial names, or full session names.
2. **Identify pipeline type** from directory name prefix:
   - `lp-` → learning-path
   - `review-` → review
   - `chat-` → chat/query
   - other → ingest
3. **List agent files** — read all `*.json` in the session directory.
4. **Load the appropriate reference files** (see below).
5. **Analyze steps** — count, token usage, tool calls, errors, duration.
6. **Cross-reference with data/log.md** — for ingest, find the corresponding log entry.
7. **Tailor the rest to what the user asked.** Do not generate a full structured report unless the user explicitly asks for one. Answer the specific question with the specific data.

## Kind-specific analysis

After step 2-3, load reference files based on pipeline type:

| Pipeline | Reference files to load |
|----------|------------------------|
| Ingest (planner) | `references/planner-analysis.md` |
| Ingest (writer) | `references/writer-analysis.md` |
| Ingest (aggregator) | `references/aggregator-analysis.md` |
| Learning Path | `references/learning-path-analysis.md` |
| Review | `references/review-analysis.md` |
| Chat | `references/chat-analysis.md` |

These files contain the tool vocabulary, common patterns, and metrics relevant to each agent type.

## Full report template

Only if the user asks for a "complete report", "structured analysis", or similar → load `references/report-template.md` and follow that output format.

## Script helper

For quick automated extraction (ingest traces only):

```bash
python3 .agents/skills/trace-analyzer/analyze-trace.py <session-name>        # markdown summary
python3 .agents/skills/trace-analyzer/analyze-trace.py <session-name> --output json
python3 .agents/skills/trace-analyzer/analyze-trace.py <session-name> --output text
```

For learning-path, review, and chat traces, read the JSON files directly with the `read` tool.

## Constraints

- Read-only operations only. Never modify trace files.
- Mask sensitive content (full page content in tool outputs) when quoting — show only structure/keys.
- Reference specific timestamps and step numbers when making claims.
- Token counts may include `cachedInputTokens` (prompt cache hits) and `reasoningTokens` — report all three separately.
