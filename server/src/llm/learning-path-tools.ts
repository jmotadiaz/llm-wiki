import { tool } from "ai";
import { z } from "zod";
import { Queries } from "../db/queries.js";
import Database from "better-sqlite3";
import { debugLog } from "../utils/debug.js";
import { validateTagContract } from "./tag-validator.js";

export interface LearningPathWriterResult {
  writtenSlugs: string[];
}

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const REQUIRED_TOPIC_TAG = "t:learning-path";

function validatePagePayload(
  slug: string,
  content: string,
  tags: string[],
): string | null {
  if (!SLUG_REGEX.test(slug)) {
    return `Slug "${slug}" is not valid kebab-case (must match ^[a-z0-9]+(-[a-z0-9]+)*$).`;
  }
  if (content.includes("/raw/")) {
    return `Learning-path pages MUST NOT contain /raw/ citations. Use only [text](/wiki/slug) links to wiki pages.`;
  }
  const tagCheck = validateTagContract(tags);
  if (!tagCheck.valid) {
    return `Tags rejected: ${tagCheck.error}`;
  }
  if (!tags.includes(REQUIRED_TOPIC_TAG)) {
    return `Tags rejected: learning-path pages MUST include the topic tag "${REQUIRED_TOPIC_TAG}".`;
  }
  return null;
}

/**
 * Tools for a single-page learning-path WRITER agent.
 * The writer autonomously explores the wiki (full page content + backlinks)
 * to design the curriculum and then writes the page.
 */
export function createLearningPathWriterTools(
  db: Database.Database,
  result: LearningPathWriterResult,
) {
  const queries = new Queries(db);

  return {
    get_wiki_page: tool({
      description:
        "Read the full content and metadata of a wiki page by slug. Use this to understand the depth and scope of a page before assigning it to a stage, and to discover cross-references to other relevant pages.",
      inputSchema: z.object({
        slug: z.string().describe("The slug of the wiki page to read."),
      }),
      execute: async ({ slug }) => {
        debugLog(`[Tool: lp.writer.get_wiki_page] slug: ${slug}`);
        const page = queries.getWikiPageBySlug(slug);
        if (!page) {
          return { error: `Page "${slug}" not found.` };
        }
        return {
          slug: page.slug,
          title: page.title,
          type: page.type,
          status: page.status,
          tags: (page.tags || "").split(",").map((t: string) => t.trim()).filter(Boolean),
          summary: page.summary,
          content: page.content,
        };
      },
    }),

    get_backlinks: tool({
      description:
        "List wiki pages that link TO a given slug. High inbound counts signal foundational pages — use this to determine stage ordering and discover hub pages that should appear early in the path.",
      inputSchema: z.object({
        slug: z.string().describe("The slug whose inbound links you want."),
      }),
      execute: async ({ slug }) => {
        debugLog(`[Tool: lp.writer.get_backlinks] slug: ${slug}`);
        const backlinks = queries.getBacklinks(slug);
        return backlinks.map((page: any) => ({
          slug: page.slug,
          title: page.title,
          type: page.type,
          tags: page.tags ? page.tags.split(",") : [],
        }));
      },
    }),

    add_wiki_page: tool({
      description:
        'Create a new learning-path page. The slug MUST be a clean topic kebab-case (e.g. "llm-agents") — do NOT prepend "learning-path-". The type MUST be "learning-path". Call this exactly once for action="new".',
      inputSchema: z.object({
        slug: z.string().describe('Clean topic kebab-case, no "learning-path-" prefix (e.g. "llm-agents").'),
        title: z.string().describe("The human-readable title (Spanish)."),
        type: z.literal("learning-path"),
        status: z.enum(["draft", "published", "archived"]),
        tags: z.array(z.string()).describe(
          'Tags. Required: exactly one d:<domain-kebab>, plus t:learning-path. Optional t: and a: tags allowed.',
        ),
        summary: z.string().describe("One-sentence Spanish summary (max 150 chars)."),
        content: z.string().describe("Full markdown content (Spanish). Use [text](/wiki/slug) for cross-references. No /raw/ citations."),
      }),
      execute: async (page) => {
        const guard = validatePagePayload(page.slug, page.content, page.tags);
        if (guard) return { error: guard };

        const existing = queries.getWikiPageBySlug(page.slug);
        if (existing) {
          return {
            error: `Slug "${page.slug}" already exists. Use edit_wiki_page to update it.`,
          };
        }

        debugLog(`[Tool: lp.writer.add_wiki_page] writing: ${page.slug}`);

        const now = new Date().toISOString();
        const pageId = queries.insertWikiPage(
          page.slug,
          page.title,
          page.summary,
          page.content,
          page.type,
          page.tags.join(","),
          page.status,
          now,
        );

        const linkRegex = /\[([^\]]+)\]\(\/wiki\/([^)]+)\)/g;
        let match;
        while ((match = linkRegex.exec(page.content)) !== null) {
          const linkSlug = match[2].trim();
          if (linkSlug) queries.insertWikiLink(pageId, linkSlug);
        }

        if (!result.writtenSlugs.includes(page.slug)) {
          result.writtenSlugs.push(page.slug);
        }

        return { success: true, action: "created", slug: page.slug };
      },
    }),

    edit_wiki_page: tool({
      description:
        "Update an existing learning-path page. Always pass full `content` (no `edits` patches for learning paths).",
      inputSchema: z.object({
        slug: z.string().describe('The slug of the learning-path page to edit (matches the existing record).'),
        title: z.string().optional(),
        status: z.enum(["draft", "published", "archived"]).optional(),
        tags: z.array(z.string()).optional(),
        summary: z.string().optional(),
        content: z.string().describe("Full replacement markdown. No /raw/ citations."),
      }),
      execute: async (args) => {
        const existingPage = queries.getWikiPageBySlug(args.slug);
        if (!existingPage) {
          return {
            error: `Page "${args.slug}" not found. Use add_wiki_page to create a new page.`,
          };
        }
        if (existingPage.type !== "learning-path") {
          return {
            error: `Page "${args.slug}" has type "${existingPage.type}", not "learning-path". Refusing to edit.`,
          };
        }

        const finalTitle = args.title ?? existingPage.title;
        const finalStatus = args.status ?? existingPage.status;
        const finalSummary = args.summary ?? existingPage.summary;
        const finalTags = args.tags ?? (existingPage.tags ? existingPage.tags.split(",") : []);
        const finalContent = args.content;

        const guard = validatePagePayload(args.slug, finalContent, finalTags);
        if (guard) return { error: guard };

        debugLog(`[Tool: lp.writer.edit_wiki_page] writing: ${args.slug}`);

        queries.updateWikiPage(
          existingPage.id,
          finalTitle,
          finalSummary,
          finalContent,
          finalTags.join(","),
          finalStatus,
          new Date().toISOString(),
        );

        queries.deleteWikiLinksForPage(existingPage.id);
        const linkRegex = /\[([^\]]+)\]\(\/wiki\/([^)]+)\)/g;
        let match;
        while ((match = linkRegex.exec(finalContent)) !== null) {
          const linkSlug = match[2].trim();
          if (linkSlug) queries.insertWikiLink(existingPage.id, linkSlug);
        }

        if (!result.writtenSlugs.includes(args.slug)) {
          result.writtenSlugs.push(args.slug);
        }

        return { success: true, action: "updated", slug: args.slug };
      },
    }),
  };
}
