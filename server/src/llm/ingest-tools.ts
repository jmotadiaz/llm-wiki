import { tool } from "ai";
import { z } from "zod";
import { Queries } from "../db/queries.js";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function extractWikiLinks(content: string): string[] {
  const linkRegex = /\[\[([^\]]+)\]\]/g;
  const links: string[] = [];
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    links.push(match[1]);
  }

  return links;
}

function ensureWikiDirectory(): string {
  const wikiDir = path.join(__dirname, "../../..", "data", "wiki");
  if (!fs.existsSync(wikiDir)) {
    fs.mkdirSync(wikiDir, { recursive: true });
  }
  return wikiDir;
}

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
  const wikiDir = ensureWikiDirectory();

  return {
    get_wiki_page: tool({
      description:
        "Read the full content, metadata, and existing source IDs of an existing wiki page by its slug.",
      inputSchema: z.object({
        slug: z.string().describe("The slug of the wiki page to read."),
      }),
      execute: async ({ slug }) => {
        console.log(`[Tool: get_wiki_page] reading: ${slug}`);
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

    upsert_wiki_page: tool({
      description:
        "Create or update a wiki page. This is an UPSERT operation: if a page with the given slug already exists, first read it with get_wiki_page and merge your new information into the existing content before writing the full replacement content. If the slug does not exist, a new page is created. The same tool handles both cases. You MUST use this tool to persist any change, including citation-only updates. The current raw source link is recorded automatically by the system; do not pass source IDs as input.",
      inputSchema: z.object({
        slug: z
          .string()
          .describe("The unique slug of the page (English, kebab-case)."),
        title: z.string().describe("The human-readable title (Spanish)."),
        type: z
          .enum(["concept", "technique", "reference", "index"])
          .describe("The page type."),
        status: z
          .enum(["draft", "published", "archived"])
          .describe("Lifecycle status."),
        tags: z.array(z.string()).describe("List of tags (English)."),
        summary: z.string().describe("Short summary (Spanish)."),
        content: z
          .string()
          .describe(
            "Full markdown content (Spanish). Include citations using [1](/raw/{RAW_ID}#fragment) when a relevant raw heading anchor is available, otherwise [1](/raw/{RAW_ID}).",
          ),
      }),
      execute: async (page) => {
        // Validate slug
        if (page.slug.length > 60) {
          return {
            error: `Slug rejected: "${page.slug.substring(0, 30)}..." is ${page.slug.length} chars (max 60). Use a short kebab-case slug like "${page.slug.split("-").slice(0, 3).join("-")}".`,
          };
        }
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(page.slug)) {
          return {
            error: `Slug rejected: "${page.slug}" is not valid kebab-case. Must be lowercase letters, numbers, and hyphens only (e.g., "harness-engineering").`,
          };
        }

        console.log(`[Tool: upsert_wiki_page] writing: ${page.slug}`);

        const existingPage = queries.getWikiPageBySlug(page.slug);
        let pageId: number;

        if (existingPage) {
          console.log(
            `[Tool: upsert_wiki_page] Updating existing page: ${page.slug}`,
          );
          queries.updateWikiPage(
            existingPage.id,
            page.title,
            page.content,
            page.tags.join(","),
            page.status,
          );
          pageId = existingPage.id;
        } else {
          console.log(
            `[Tool: upsert_wiki_page] Creating new page: ${page.slug}`,
          );
          pageId = queries.insertWikiPage(
            page.slug,
            page.title,
            page.content,
            page.type,
            page.tags.join(","),
            page.status,
          );
        }

        // Write to filesystem
        const filepath = path.join(wikiDir, `${page.slug}.md`);
        fs.writeFileSync(filepath, page.content);

        // Link raw source to page
        queries.insertPageSource(pageId, rawSourceId);

        // Extract and index wiki links
        const wikiLinks = extractWikiLinks(page.content);
        for (const linkSlug of wikiLinks) {
          queries.insertWikiLink(pageId, linkSlug);
        }

        return {
          success: true,
          action: existingPage ? "updated" : "created",
          slug: page.slug,
        };
      },
    }),

    report_warning: tool({
      description:
        "Report a consistency issue, missing context, or any other warning detected during ingestion.",
      inputSchema: z.object({
        type: z
          .string()
          .describe("The type of warning (e.g., missing_context, ambiguous)."),
        message: z.string().describe("A detailed description of the issue."),
      }),
      execute: async ({ type, message }) => {
        console.log(`[Tool: report_warning] ${type}: ${message}`);
        queries.insertLintWarning(null, type, message, "warning");
        return { success: true };
      },
    }),
  };
};
