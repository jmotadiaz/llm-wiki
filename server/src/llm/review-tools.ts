import { tool } from "ai";
import { z } from "zod";
import { Queries } from "../db/queries.js";
import Database from "better-sqlite3";
import { debugLog } from "../utils/debug.js";
import { createWikiEditTools } from "./wiki-tools.js";

export type ReviewAgentKind =
  | "standard"
  | "domain-index"
  | "learning-path";

export const createReviewTools = (
  db: Database.Database,
  commentId: number,
  pageSlug: string,
  kind: ReviewAgentKind = "standard",
) => {
  const queries = new Queries(db);
  const pagesEdited: string[] = [];

  const wikiEditTools = createWikiEditTools(db, {
    allowRawCitations: kind === "standard",
    onPageWritten: (slug) => {
      if (!pagesEdited.includes(slug)) {
        pagesEdited.push(slug);
      }
    },
  });

  const baseTools = {
    get_wiki_page: tool({
      description:
        "Read the full content, metadata, and existing source IDs of an existing wiki page by its slug.",
      inputSchema: z.object({
        slug: z.string().describe("The slug of the wiki page to read."),
      }),
      execute: async ({ slug }) => {
        debugLog(`[Tool: review.get_wiki_page] reading: ${slug}`);
        const page = queries.getWikiPageBySlug(slug);
        if (!page) {
          const allPages = queries.getAllWikiPages();
          const available = allPages.map((p) => p.slug);
          return {
            error: `Page "${slug}" not found.`,
            available_slugs: available,
          };
        }
        const sources = queries.getSourcesForPage(page.id);
        return {
          slug: page.slug,
          title: page.title,
          type: page.type,
          status: page.status,
          tags: page.tags ? page.tags.split(",") : [],
          source_ids: sources.map((source) => source.id),
          content: page.content,
        };
      },
    }),

    list_page_sources: tool({
      description:
        "List metadata (title, description, source URL) of all raw sources linked to a wiki page. Use this to see what sources are available for the page, then call get_raw_source to fetch the full content of a specific source.",
      inputSchema: z.object({
        slug: z.string().describe("The slug of the wiki page."),
      }),
      execute: async ({ slug }) => {
        debugLog(`[Tool: review.list_page_sources] listing sources for: ${slug}`);
        const page = queries.getWikiPageBySlug(slug);
        if (!page) {
          return { error: `Page "${slug}" not found.` };
        }

        const stmt = db.prepare(`
          SELECT rs.id, rs.title, rs.description, rs.source_url
          FROM raw_sources rs
          JOIN page_sources ps ON rs.id = ps.source_id
          WHERE ps.page_id = ?
          ORDER BY rs.created_at DESC
        `);
        const sources = stmt.all(page.id) as any[];

        return sources.map((source) => ({
          id: source.id,
          title: source.title,
          description: source.description,
          source_url: source.source_url,
        }));
      },
    }),

    get_raw_source: tool({
      description:
        "Fetch the full content of a raw source that is linked to the target wiki page. Returns an error if the source is not linked to the page.",
      inputSchema: z.object({
        id: z.number().describe("The ID of the raw source."),
      }),
      execute: async ({ id }) => {
        debugLog(`[Tool: review.get_raw_source] fetching source: ${id}`);

        // Validate that the source is linked to the target page
        const page = queries.getWikiPageBySlug(pageSlug);
        if (!page) {
          return { error: `Target page "${pageSlug}" not found.` };
        }

        const stmt = db.prepare(`
          SELECT rs.* FROM raw_sources rs
          JOIN page_sources ps ON rs.id = ps.source_id
          WHERE rs.id = ? AND ps.page_id = ?
        `);
        const source = stmt.get(id, page.id) as any;

        if (!source) {
          return {
            error: `Source ${id} is not linked to page "${pageSlug}".`,
          };
        }

        return {
          id: source.id,
          title: source.title,
          description: source.description,
          source_url: source.source_url,
          content: source.content,
        };
      },
    }),

    add_wiki_page: wikiEditTools.add_wiki_page,
    edit_wiki_page: wikiEditTools.edit_wiki_page,
    delete_wiki_page: wikiEditTools.delete_wiki_page,

    reply_to_comment: tool({
      description: "Finalize the review by replying to the comment with reasoning about the changes made.",
      inputSchema: z.object({
        reasoning: z.string().describe("Explanation of what was changed and why."),
      }),
      execute: async ({ reasoning }) => {
        debugLog(`[Tool: review.reply_to_comment] finalizing comment ${commentId}`);
        queries.setCommentAnswered(commentId, reasoning, pagesEdited);
        return { success: true };
      },
    }),
  };

  const indexTools = {
    get_wiki_index: tool({
      description:
        "Retrieve the full wiki index with slug, title, type, tags, and summary. Use to decide which pages to include in a domain-index or learning-path.",
      inputSchema: z.object({}),
      execute: async () => {
        debugLog(`[Tool: review.get_wiki_index] fetching wiki index`);
        const pages = queries.getAllWikiPages();
        return pages
          .filter((p: any) => p.status === "published")
          .map((p: any) => ({
            slug: p.slug,
            title: p.title,
            type: p.type,
            tags: (p.tags || "").split(",").map((t: string) => t.trim()).filter(Boolean),
            summary: p.summary,
          }));
      },
    }),
    get_backlinks: tool({
      description:
        "List wiki pages that link TO a given slug (backlinks). Foundational pages tend to have many backlinks.",
      inputSchema: z.object({
        slug: z.string().describe("The slug whose inbound links you want."),
      }),
      execute: async ({ slug }) => {
        debugLog(`[Tool: review.get_backlinks] slug: ${slug}`);
        const backlinks = queries.getBacklinks(slug);
        return backlinks.map((page: any) => ({
          slug: page.slug,
          title: page.title,
          type: page.type,
          tags: page.tags ? page.tags.split(",") : [],
        }));
      },
    }),
  };

  if (kind === "domain-index") {
    const { list_page_sources: _a, get_raw_source: _b, ...rest } = baseTools;
    return {
      ...rest,
      get_wiki_index: indexTools.get_wiki_index,
    };
  }

  if (kind === "learning-path") {
    const { list_page_sources: _a, get_raw_source: _b, ...rest } = baseTools;
    return {
      ...rest,
      get_wiki_index: indexTools.get_wiki_index,
      get_backlinks: indexTools.get_backlinks,
    };
  }

  return baseTools;
};
