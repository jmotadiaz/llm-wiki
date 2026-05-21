# Review-specific analysis reference

Load this when analyzing `traces/review-*/` directories.

## Role

The review pipeline processes user feedback on wiki pages. A reviewer agent reads the feedback, analyzes the page, makes edits if needed, and replies to the user.

## Directory layout

```
traces/review-<slug>-c<commentId>-<timestamp>/
  reviewer.json             # Reviewer agent steps
```

## Pipeline flow

1. **User submits feedback** as a comment on a wiki page
2. **Reviewer agent** — reads the page, feedback, wiki context; decides what to do
3. **Reviewer tools**: edits the page, replies to comment, reports warnings

## Reviewer specifics

- **maxSteps: 15** — enough for analysis + edits + reply
- Model: `pro` (higher quality than ingest's `flash`)
- Tools: `get_wiki_page`, `edit_wiki_page`, `reply_to_comment`, `report_warning`
- Different prompt templates per page type:
  - Standard pages → `reviewer.md`
  - Domain index → `review-domain-index.md`
  - Learning path → `review-learning-path.md`
- Supports **threaded conversations** — multi-turn feedback via `thread` JSON in comment

## Reviewer agent kinds

| Kind | Prompt file | Purpose |
|------|------------|---------|
| `standard` | `reviewer.md` | Regular wiki page review |
| `domain-index` | `review-domain-index.md` | Domain index page review |
| `learning-path` | `review-learning-path.md` | Learning path page review |

## What to look for

### Success indicators
- `reply_to_comment` was called → reviewer responded to user
- `edit_wiki_page` was called → reviewer made changes based on feedback
- No errors in trace

### Failure indicators
- `reply_to_comment` NOT called → fallback message was used (system error response)
- Errors in tool calls
- Agent exceeded maxSteps without completing

### Threaded conversations
- If the comment has a `thread` (JSON array of `{role, content}`), the reviewer sees the full conversation history
- Multiple user/assistant turns before the reviewer acts

### Token usage patterns
- High `inputTokens` initially (wiki index + page content loaded as context)
- `outputTokens` proportional to reply length + edit content
- `cachedInputTokens` should increase if reviewing multiple comments

## Common patterns

### Simple acknowledgment
- 1-2 steps, `get_wiki_page` then `reply_to_comment`
- Feedback was informational, no changes needed

### Substantive review
- 3-8 steps, multiple `get_wiki_page` calls, `edit_wiki_page`, then `reply_to_comment`
- Feedback required page modifications

### Error/failure
- Few steps, no `reply_to_comment`
- Check `setCommentFailed` in log.md or DB

## jq-style analysis

```bash
SESSION="review-some-slug-c42-2026-..."

# Quick summary
python3 -c "
import json
steps = json.load(open('traces/$SESSION/reviewer.json'))
print(f'Steps: {len(steps)}')
tokens = sum(s['usage']['totalTokens'] for s in steps)
print(f'Total tokens: {tokens:,}')
tools = set()
for s in steps:
    for tc in s.get('toolCalls', []):
        tools.add(tc['toolName'])
print(f'Tools used: {tools}')
print(f'Replied: {\"reply_to_comment\" in tools}')
print(f'Edited: {\"edit_wiki_page\" in tools}')
"
```
