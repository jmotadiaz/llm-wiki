import { tool } from "ai";
import { z } from "zod";
import { Queries } from "../db/queries.js";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { debugLog } from "../utils/debug.js";
import { validateTagContract } from "./tag-validator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function extractWikiLinks(content: string): string[] {
  const linkRegex = /\[\[([^\]]+)\]\]/g;
  const links: string[] = [];
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    // Strip pipe alias syntax: [[slug|display text]] → slug
    const slug = match[1].split("|")[0].trim();
    if (slug) {
      links.push(slug);
    }
  }

  return links;
}

function findMalformedRawCitations(content: string): string[] {
  const malformed = content.match(/\[(?:\s*)\/raw\/[^\]\s]+(?:\s*)\]/g) || [];
  return malformed;
}

function extractRawMarkdownLinks(
  content: string,
): Array<{ label: string; href: string }> {
  const linkRegex = /\[([^\]]+)\]\((\/raw\/[^)]+)\)/g;
  const links: Array<{ label: string; href: string }> = [];
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    links.push({ label: match[1].trim(), href: match[2] });
  }

  return links;
}

function normalizePotentialSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function findRawLinksThatShouldBeWikiLinks(
  content: string,
  knownSlugs: Set<string>,
): Array<{ label: string; href: string; slug: string }> {
  return extractRawMarkdownLinks(content)
    .map((link) => ({
      ...link,
      slug: normalizePotentialSlug(link.label),
    }))
    .filter((link) => link.slug.length > 0 && knownSlugs.has(link.slug));
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
            "Full markdown content (Spanish). Use [[slug]] for wiki cross-references. Reserve /raw links for citations only: [1](/raw/{RAW_ID}#fragment) when a relevant raw heading anchor is available, otherwise [1](/raw/{RAW_ID}). WARNING: ensure citation links are closed with ')' and NOT ']' (incorrect: [1](/raw/4]).",
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

        const tagValidation = validateTagContract(page.tags);
        if (!tagValidation.valid) {
          return {
            error: `Tags rejected: ${tagValidation.error}`,
          };
        }

        const malformedRawCitations = findMalformedRawCitations(page.content);
        if (malformedRawCitations.length > 0) {
          return {
            error: `Raw citation syntax rejected. Use markdown links like "[1](/raw/${rawSourceId})" or "[1](/raw/${rawSourceId}#user-content-fragment)", not bare bracketed paths like "${malformedRawCitations[0]}".`,
          };
        }

        const knownSlugs = new Set(
          queries.getAllWikiPages().map((wikiPage) => wikiPage.slug),
        );
        knownSlugs.add(page.slug);

        const rawLinksThatShouldBeWikiLinks = findRawLinksThatShouldBeWikiLinks(
          page.content,
          knownSlugs,
        );
        if (rawLinksThatShouldBeWikiLinks.length > 0) {
          const offender = rawLinksThatShouldBeWikiLinks[0];
          return {
            error: `Wiki cross-reference rejected. "[${offender.label}](${offender.href})" points to a known wiki concept. Use [[${offender.slug}]] for the concept mention and keep the /raw link only as a separate citation after the supported claim.`,
          };
        }

        debugLog(`[Tool: upsert_wiki_page] writing: ${page.slug}`);

        const existingPage = queries.getWikiPageBySlug(page.slug);
        let pageId: number;

        if (existingPage) {
          debugLog(
            `[Tool: upsert_wiki_page] Updating existing page: ${page.slug}`,
          );
          queries.updateWikiPage(
            existingPage.id,
            page.title,
            page.summary,
            page.content,
            page.tags.join(","),
            page.status,
          );
          pageId = existingPage.id;
        } else {
          debugLog(`[Tool: upsert_wiki_page] Creating new page: ${page.slug}`);
          pageId = queries.insertWikiPage(
            page.slug,
            page.title,
            page.summary,
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
        queries.deleteWikiLinksForPage(pageId);
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
        debugLog(`[Tool: planner.get_wiki_page] reading: ${slug}`);
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
        debugLog(`[Tool: planner.get_backlinks] slug: ${slug}`);
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
