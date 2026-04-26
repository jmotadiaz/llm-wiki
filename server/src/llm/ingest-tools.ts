import { tool } from "ai";
import { z } from "zod";
import { Queries } from "../db/queries.js";
import Database from "better-sqlite3";
import { debugLog } from "../utils/debug.js";
import { createWikiEditTools } from "./wiki-tools.js";

/**
 * Creates tools for the ingestion agent.
 * These tools allow the agent to read existing pages, write/update pages,
 * and report warnings. Side-effects (DB, FS) are executed directly.
 */
export const createIngestTools = (
  db: Database.Database,
  rawSourceId: number,
) => {
  const queries = new Queries(db);

  const wikiEditTools = createWikiEditTools(db, {
    allowRawCitations: true,
    rawSourceId,
  });

  return {
    get_wiki_page: tool({
      description:
        "Read the full content, metadata, and existing source IDs of an existing wiki page by its slug.",
      inputSchema: z.object({
        slug: z.string().describe("The slug of the wiki page to read."),
      }),
      execute: async ({ slug }) => {
        debugLog(`[Tool: get_wiki_page] reading: ${slug}`);
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

    add_wiki_page: wikiEditTools.add_wiki_page,
    edit_wiki_page: wikiEditTools.edit_wiki_page,
    delete_wiki_page: wikiEditTools.delete_wiki_page,

    report_warning: tool({
      description:
        "Report an ACTUAL content issue or warning. NEVER call this to report success or the absence of warnings.",
      inputSchema: z.object({
        type: z
          .string()
          .describe("The type of warning (e.g., missing_context, ambiguous)."),
        message: z.string().describe("A detailed description of the issue."),
      }),
      execute: async ({ type, message }) => {
        debugLog(`[Tool: report_warning] ${type}: ${message}`);
        queries.insertLintWarning(null, type, message, "warning");
        return { success: true };
      },
    }),
  };
};

/**
 * Creates read-only tools for the ingestion planner agent.
 * The planner must be able to inspect existing wiki pages and their backlinks
 * in order to decide whether a concept is new/update, whether a raw source
 * actually adds new claims, and which existing pages should cross-link to
 * newly planned pages. These tools NEVER mutate state.
 */
export const createIngestPlannerTools = (db: Database.Database) => {
  const queries = new Queries(db);

  return {
    get_wiki_page: tool({
      description:
        "Read the full content, metadata, and existing source IDs of an existing wiki page by its slug. Use this to decide whether the raw source actually adds new claims, restates existing ones, or contradicts the page.",
      inputSchema: z.object({
        slug: z.string().describe("The slug of the wiki page to read."),
      }),
      execute: async ({ slug }) => {
        console.log(`[Tool: planner.get_wiki_page] reading: ${slug}`);
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

    get_backlinks: tool({
      description:
        "List existing wiki pages that already link to a given slug. Use this to discover which existing pages should be updated to cross-link a newly planned concept, or to understand the surrounding context of an existing concept.",
      inputSchema: z.object({
        slug: z
          .string()
          .describe(
            "The slug whose inbound links you want. Works for both existing and not-yet-created slugs: a not-yet-created slug simply returns an empty list.",
          ),
      }),
      execute: async ({ slug }) => {
        console.log(`[Tool: planner.get_backlinks] slug: ${slug}`);
        const backlinks = queries.getBacklinks(slug);
        return backlinks.map((page: any) => ({
          slug: page.slug,
          title: page.title,
          tags: page.tags ? page.tags.split(",") : [],
        }));
      },
    }),
  };
};
