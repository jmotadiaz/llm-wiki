# Aggregator-specific analysis reference

Load this when analyzing `aggregator.json`.

## Role

The aggregator runs after all writers complete. It handles post-ingest metadata work that spans multiple pages:
- Processing inline mentions (adding cross-references to existing pages)
- Updating inbound links (adding backlinks to pages that should reference the new content)
- Updating tag landscape (adjusting tags on existing pages)
- Reporting plan-level warnings

It uses `maxSteps: 15` and the "flash" model. It may be skipped entirely if no meta work is needed.

## Tools vocabulary

| Tool | Purpose |
|------|---------|
| `get_wiki_page` | Reads existing page to add inline mentions or links |
| `edit_wiki_page` | Updates existing pages with new cross-references or tags |
| `report_warning` | Reports warnings identified by the planner |

## What to look for

### Whether aggregator ran
- If `aggregator.json` is empty or has very few steps, the aggregator may have exited early
- Check `data/log.md` — if only writer results appear, aggregator may have been skipped

### Meta work performed
- **Inline mentions**: `edit_wiki_page` calls adding `[[slug]]` references to existing pages
- **Inbound link updates**: `edit_wiki_page` calls adding backlinks from related pages
- **Tag landscape**: `edit_wiki_page` calls updating tags on existing pages
- **Warnings**: `report_warning` calls for plan-level issues

### Common patterns

#### Early exit (no meta work)
- When planner produces no `inlineMentions`, `inboundLinkUpdates`, `tagLandscapeUpdates`, or `warnings`, the aggregator skips execution
- This is normal and not an error

#### High `get_wiki_page` count
- Aggregator reads many existing pages to update them with cross-references
- More reads = more thorough cross-linking

#### Warning patterns
- Planner warnings carried through to `report_warning` calls
- Common types: `duplicate` (similar pages exist), `inconsistency` (conflicting information across pages)

## Metrics to check

- Whether aggregator ran at all (file exists and has steps)
- Number of `edit_wiki_page` calls (pages modified for cross-references)
- Number of `report_warning` calls
- Total token usage
- Number of unique pages read vs pages modified
