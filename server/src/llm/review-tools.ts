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
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['']/g, "")
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
  const wikiDir = ensureWikiDirectory();
  const pagesEdited: string[] = [];

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

    upsert_wiki_page: tool({
      description:
        "Create or update a wiki page. The reviewer uses the same upsert semantics as the ingest writer but does not create new page_sources entries (the sources remain as they were ingested).",
      inputSchema: z.object({
        slug: z
          .string()
          .describe("The unique slug of the page (English, kebab-case)."),
        title: z.string().describe("The human-readable title (Spanish)."),
        type: z
          .enum(["concept", "technique", "reference", "index", "domain-index", "learning-path"])
          .describe("The page type."),
        status: z
          .enum(["draft", "published", "archived"])
          .describe("Lifecycle status."),
        tags: z.array(z.string()).describe("List of tags (English)."),
        summary: z.string().describe("Short summary (Spanish)."),
        content: z
          .string()
          .describe(
            "Full markdown content (Spanish). Use [[slug]] for wiki cross-references. Reserve /raw links for citations only: [1](/raw/{RAW_ID}#fragment) when a relevant raw heading anchor is available, otherwise [1](/raw/{RAW_ID}).",
          ),
      }),
      execute: async (page) => {
        if (page.slug.length > 60) {
          return {
            error: `Slug rejected: "${page.slug.substring(0, 30)}..." is ${page.slug.length} chars (max 60).`,
          };
        }
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(page.slug)) {
          return {
            error: `Slug rejected: "${page.slug}" is not valid kebab-case.`,
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
            error: `Raw citation syntax rejected. Use markdown links like "[1](/raw/123)" not "${malformedRawCitations[0]}".`,
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
            error: `Wiki cross-reference rejected. "[${offender.label}](${offender.href})" should use [[${offender.slug}]] instead.`,
          };
        }

        debugLog(`[Tool: review.upsert_wiki_page] writing: ${page.slug}`);

        const existingPage = queries.getWikiPageBySlug(page.slug);
        let pageId: number;

        if (existingPage) {
          debugLog(
            `[Tool: review.upsert_wiki_page] Updating existing page: ${page.slug}`,
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
          debugLog(`[Tool: review.upsert_wiki_page] Creating new page: ${page.slug}`);
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

        // Write to filesystem (no page_sources entry created for reviewer edits)
        const filepath = path.join(wikiDir, `${page.slug}.md`);
        fs.writeFileSync(filepath, page.content);

        // Extract and index wiki links
        queries.deleteWikiLinksForPage(pageId);
        const wikiLinks = extractWikiLinks(page.content);
        for (const linkSlug of wikiLinks) {
          queries.insertWikiLink(pageId, linkSlug);
        }

        // Track the edited slug
        if (!pagesEdited.includes(page.slug)) {
          pagesEdited.push(page.slug);
        }

        return {
          success: true,
          action: existingPage ? "updated" : "created",
          slug: page.slug,
        };
      },
    }),

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
