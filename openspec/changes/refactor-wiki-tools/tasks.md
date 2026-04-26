## 1. Core Tooling Refactoring

- [ ] 1.1 Remove `upsert_wiki_page` from `server/src/llm/index-tools.ts`.
- [ ] 1.2 Remove `upsert_wiki_page` from `server/src/llm/review-tools.ts`.
- [ ] 1.3 Create a new shared file `server/src/llm/wiki-tools.ts` to hold the shared editing tools.
- [ ] 1.4 Implement `add_wiki_page`, `edit_wiki_page`, and `delete_wiki_page` in `server/src/llm/wiki-tools.ts`.
- [ ] 1.5 Export and include these tools in the tool sets returned by `server/src/llm/index-tools.ts` and `server/src/llm/review-tools.ts`.


## 2. Agents & System Prompts Updates

- [ ] 2.1 Update system prompts for the ingest writer to instruct the use of `add_wiki_page` and `edit_wiki_page` instead of `upsert`.
- [ ] 2.2 Update system prompts for the reviewer agent to instruct the use of `edit_wiki_page` with partial edits when fixing specific typos.

## 3. Testing and Validation

- [ ] 3.1 Verify `add_wiki_page` successfully creates a new page and fails if the slug exists.
- [ ] 3.2 Verify `edit_wiki_page` successfully replaces content using the `content` argument.
- [ ] 3.3 Verify `edit_wiki_page` successfully performs an exact string replacement using the `edits` array and returns a diff/snippet to validate the change without returning the full page.
- [ ] 3.4 Verify `edit_wiki_page` returns a runtime error when both `content` and `edits` are provided.
- [ ] 3.5 Verify `edit_wiki_page` returns a runtime error when `old_content` is not found in the page.
- [ ] 3.6 Verify `delete_wiki_page` successfully removes a page.
