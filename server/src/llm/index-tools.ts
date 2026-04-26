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
    if (slug) links.push(slug);
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

export interface IndexAgentResult {
  writtenSlugs: string[];
}

export function createIndexTools(
  db: Database.Database,
  allowedType: "domain-index" | "learning-path",
  expectedSlug: string,
  result: IndexAgentResult,
) {
  const queries = new Queries(db);
  const wikiDir = ensureWikiDirectory();

  return {
    get_wiki_index: tool({
      description:
        "Retrieve the full wiki index (all published pages) with slug, title, type, tags, summary, and inbound link count.",
      inputSchema: z.object({}),
      execute: async () => {
        debugLog(`[Tool: index.get_wiki_index] fetching wiki index`);
        const pages = queries.getAllWikiPages();
        const inboundCounts = queries.getInboundLinkCounts();
        return pages
          .filter((p: any) => p.status === "published")
          .map((p: any) => ({
            slug: p.slug,
            title: p.title,
            type: p.type,
            tags: (p.tags || "").split(",").map((t: string) => t.trim()).filter(Boolean),
            summary: p.summary,
            inbound_links: inboundCounts.get(p.slug) ?? 0,
          }));
      },
    }),

    get_backlinks: tool({
      description:
        "List wiki pages that link TO a given slug (backlinks). Useful for confirming foundational status of a page before placing it early in a learning path.",
      inputSchema: z.object({
        slug: z.string().describe("The slug whose inbound links you want."),
      }),
      execute: async ({ slug }) => {
        debugLog(`[Tool: index.get_backlinks] slug: ${slug}`);
        const backlinks = queries.getBacklinks(slug);
        return backlinks.map((page: any) => ({
          slug: page.slug,
          title: page.title,
          type: page.type,
          tags: page.tags ? page.tags.split(",") : [],
        }));
      },
    }),

    upsert_wiki_page: tool({
      description:
        "Create or replace the target index page. The slug MUST match the provided target slug. The page type MUST match the agent's target type.",
      inputSchema: z.object({
        slug: z.string().describe("The slug of the index page (must match the target slug)."),
        title: z.string().describe("The human-readable title (Spanish)."),
        type: z
          .enum(["domain-index", "learning-path"])
          .describe("The page type."),
        status: z.enum(["draft", "published", "archived"]),
        tags: z.array(z.string()).describe("List of tags (English kebab-case)."),
        summary: z.string().describe("Short summary (Spanish)."),
        content: z
          .string()
          .describe("Full markdown content (Spanish). Use [[slug]] for wiki cross-references. Do not use /raw/ citations."),
      }),
      execute: async (page) => {
        if (page.slug !== expectedSlug) {
          return {
            error: `Slug rejected: expected "${expectedSlug}" but got "${page.slug}". Use the target slug from the prompt.`,
          };
        }
        if (page.type !== allowedType) {
          return {
            error: `Type rejected: expected "${allowedType}" but got "${page.type}".`,
          };
        }
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(page.slug)) {
          return { error: `Slug "${page.slug}" is not valid kebab-case.` };
        }

        const tagValidation = validateTagContract(page.tags);
        if (!tagValidation.valid) {
          return {
            error: `Tags rejected: ${tagValidation.error}`,
          };
        }

        if (page.content.includes("/raw/")) {
          return {
            error: `Index pages MUST NOT contain /raw/ citations. Use only [[slug]] links to wiki pages.`,
          };
        }

        debugLog(`[Tool: index.upsert_wiki_page] writing: ${page.slug}`);

        const existing = queries.getWikiPageBySlug(page.slug);
        const now = new Date().toISOString();
        let pageId: number;

        if (existing) {
          queries.updateWikiPage(
            existing.id,
            page.title,
            page.summary,
            page.content,
            page.tags.join(","),
            page.status,
            now,
          );
          pageId = existing.id;
        } else {
          pageId = queries.insertWikiPage(
            page.slug,
            page.title,
            page.summary,
            page.content,
            page.type,
            page.tags.join(","),
            page.status,
            now,
          );
        }

        const filepath = path.join(wikiDir, `${page.slug}.md`);
        fs.writeFileSync(filepath, page.content);

        queries.deleteWikiLinksForPage(pageId);
        const wikiLinks = extractWikiLinks(page.content);
        for (const linkSlug of wikiLinks) {
          queries.insertWikiLink(pageId, linkSlug);
        }

        if (!result.writtenSlugs.includes(page.slug)) {
          result.writtenSlugs.push(page.slug);
        }

        return {
          success: true,
          action: existing ? "updated" : "created",
          slug: page.slug,
        };
      },
    }),
  };
}
