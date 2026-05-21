# Full report template

Use this only when the user explicitly asks for a "complete report", "structured analysis", or similar.

## Report structure

```markdown
# Trace Analysis — {sessionName}

## Summary
- Raw source ID: {rawSourceId}
- Session: {sessionName}
- Agent files: {N} (planner + {M} writers + aggregator)
- Total steps: {sum across all agents}
- Total tokens: {sum across all agents}
- Pages planned: {N}
- Pages written: {M}
- Warnings: {K}
- Errors: {E}

## Planner
| Metric | Value |
|--------|-------|
| Steps | N |
| Total tokens | N |
| Cache hits | N |
| Wiki pages read | N |
| Pages planned | N |
| Inline mentions | N |
| Inbound link updates | N |

## Writers (per page)
| Page | Action | Steps | Tokens | Warnings | Status |
|------|--------|-------|--------|----------|--------|
| slug | new/update | N | N | N | ok/error |

## Aggregator
| Metric | Value |
|--------|-------|
| Steps | N |
| Pages modified | N |
| Warnings reported | N |

## Performance
| Metric | Value |
|--------|-------|
| Total input tokens | N |
| Total output tokens | N |
| Total cached tokens | N |
| Cache hit rate | X% |
| Total reasoning tokens | N |

## Tool call breakdown
| Tool | Calls | Notes |
|------|-------|-------|
| get_wiki_page | N | planner + writers + aggregator |
| add_wiki_page | N | new pages |
| edit_wiki_page | N | updates |
| report_warning | N | issues found |
| get_backlinks | N | planner only |

## Warnings & errors
List with timestamps, agent, and details.

## Timeline
Show start/end timestamps per agent file.

## Recommended actions
1. ...
```

Do not generate this full report unless the user asks for it. Answer specific questions with specific data.
