# Chat/Query-specific analysis reference

Load this when analyzing `traces/chat-*/` directories.

## Role

The chat pipeline handles user Q&A against the wiki. It's a RAG-style system that uses tools to look up wiki pages and answer questions conversationally.

## Directory layout

```
traces/chat-<sessionId>-<timestamp>/
  chat.json                 # Chat agent steps for this session
```

## Pipeline flow

1. **User sends message** via `/api/chat` endpoint
2. **Chat agent** — uses tools to search/retrieve wiki pages, synthesizes answer
3. **Streaming response** sent back to client via SSE

## Chat specifics

- **maxSteps: 10** — enough for multi-tool lookups and answer synthesis
- Model: `flash` (fast, cost-effective for interactive use)
- Tools: `get_wiki_page`, `get_backlinks`, `list_wiki_pages`
- System prompt includes wiki index and schema as L1 context
- Response is streamed to the client in real-time

## What to look for

### Session behavior
- Number of steps (more = more research needed)
- Tool call patterns: which pages were looked up
- Whether the agent found relevant information or said it couldn't find anything

### Token efficiency
- Chat sessions should be relatively lightweight (< 50K tokens typically)
- High `cachedInputTokens` = system prompt reuse across steps
- `reasoningTokens` indicate model is "thinking" about the answer

### Common patterns

### Direct answer (1-2 steps)
- Agent finds answer in L1 context (wiki index) without tool calls
- Fast, low token cost

### Research (3-6 steps)
- Agent calls `get_wiki_page` for relevant pages
- Synthesizes answer from retrieved content
- Moderate token cost

### Deep research (7+ steps)
- Multiple `get_wiki_page` and `get_backlinks` calls
- Agent explores wiki graph to find connections
- Higher token cost, may indicate the wiki needs better discoverability

### No relevant content
- Agent exhausts tools without finding relevant pages
- May return "I don't have information about that"
- Signal that the wiki needs more content on this topic

### Multi-turn sessions
- Multiple `chat-<sessionId>-*` directories may exist for the same session
- Look at timestamps to order them
- Each directory is one request/response exchange

## Metrics to check

- Total steps (research depth)
- Total tokens (cost of session)
- Number of unique pages looked up (tool calls)
- `finishReason`: "stop" = answered, "tool-calls" = mid-research
- `reasoningTokens` proportion (higher = more complex reasoning)

## jq-style analysis

```bash
SESSION="chat-xyz-2026-..."

# Quick summary
python3 -c "
import json
steps = json.load(open('traces/$SESSION/chat.json'))
print(f'Steps: {len(steps)}')
tokens = sum(s['usage']['totalTokens'] for s in steps)
print(f'Total tokens: {tokens:,}')
tools = set()
for s in steps:
    for tc in s.get('toolCalls', []):
        tools.add(tc['toolName'])
    # Print slugs looked up
    for tc in s.get('toolCalls', []):
        if tc['toolName'] == 'get_wiki_page':
            print(f'  -> looked up: {tc[\"input\"][\"slug\"]}')
print(f'Tools used: {tools}')
for s in steps:
    u = s['usage']
    print(f'Step {s[\"stepNumber\"]}: {u[\"totalTokens\"]:,} tokens, finish={s[\"finishReason\"]}')
"
```
