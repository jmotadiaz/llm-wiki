import { tool } from "ai";
import { z } from "zod";
import { Queries } from "../db/queries.js";
import Database from "better-sqlite3";
import { debugLog } from "../utils/debug.js";
import { ensureWikiDirectory } from "./wiki-tools.js";
import { validateTagContract } from "./tag-validator.js";
import fs from "fs";
import path from "path";

export interface IndexAgentResult {
  writtenSlugs: string[];
}

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function expectedTopicTag(type: "domain-index" | "learning-path"): string {
  return type === "domain-index" ? "t:index" : "t:learning-path";
}

function validateIndexPagePayload(
  type: "domain-index" | "learning-path",
  slug: string,
  content: string,
  tags: string[],
): string | null {
  if (!SLUG_REGEX.test(slug)) {
    return `Slug "${slug}" is not valid kebab-case (must match ^[a-z0-9]+(-[a-z0-9]+)*$).`;
  }
  const expectedPrefix = `${type}-`;
  if (!slug.startsWith(expectedPrefix)) {
    return `Slug "${slug}" must start with "${expectedPrefix}" for type "${type}".`;
  }
  if (slug.length === expectedPrefix.length) {
    return `Slug "${slug}" must include a domain segment after "${expectedPrefix}".`;
  }
  if (content.includes("/raw/")) {
    return `Index pages MUST NOT contain /raw/ citations. Use only [text](/wiki/slug) links to wiki pages.`;
  }
  const tagCheck = validateTagContract(tags);
  if (!tagCheck.valid) {
    return `Tags rejected: ${tagCheck.error}`;
  }
  const requiredTopic = expectedTopicTag(type);
  if (!tags.includes(requiredTopic)) {
    return `Tags rejected: ${type} pages MUST include the topic tag "${requiredTopic}".`;
  }
  return null;
}

export function createIndexTools(
  db: Database.Database,
  allowedType: "domain-index" | "learning-path",
  result: IndexAgentResult,
) {
  const queries = new Queries(db);
  const wikiDir = ensureWikiDirectory();

  return {
    get_wiki_page: tool({
      description:
        "Read the full content and metadata of a wiki page by slug. Use this when the index.md entry for a page is not enough to decide its placement (e.g., to confirm depth, foundationality, or topical fit before assigning it to a domain or learning-path stage).",
      inputSchema: z.object({
        slug: z.string().describe("The slug of the wiki page to read."),
      }),
      execute: async ({ slug }) => {
        debugLog(`[Tool: index.get_wiki_page] slug: ${slug}`);
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
        "List wiki pages that link TO a given slug (backlinks). High inbound counts signal foundational pages — useful for deciding if a page belongs early in a learning path or as a hub in a domain index.",
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

    add_wiki_page: tool({
      description:
        `Create a new ${allowedType} page. May be called multiple times in a single session (one call per domain). The slug MUST follow "${allowedType}-<domain-kebab>" and the type MUST be "${allowedType}".`,
      inputSchema: z.object({
        slug: z.string().describe(`The slug, formatted as "${allowedType}-<domain-kebab>".`),
        title: z.string().describe("The human-readable title (Spanish)."),
        type: z
          .enum(["domain-index", "learning-path"])
          .describe("The page type. Must equal the agent's allowed type."),
        status: z.enum(["draft", "published", "archived"]),
        tags: z.array(z.string()).describe(
          `Tags. Required: exactly one d:<domain-kebab> matching the slug's domain segment, and ${expectedTopicTag(allowedType)}. Optional a: tags allowed.`,
        ),
        summary: z.string().describe("One-sentence Spanish summary (max 150 chars)."),
        content: z
          .string()
          .describe("Full markdown content (Spanish). Use [text](/wiki/slug) for cross-references. No /raw/ citations."),
      }),
      execute: async (page) => {
        if (page.type !== allowedType) {
          return { error: `Type rejected: expected "${allowedType}" but got "${page.type}".` };
        }
        const guard = validateIndexPagePayload(allowedType, page.slug, page.content, page.tags);
        if (guard) return { error: guard };

        const existing = queries.getWikiPageBySlug(page.slug);
        if (existing) {
          return {
            error: `Slug "${page.slug}" already exists. Use edit_wiki_page to update it.`,
          };
        }

        debugLog(`[Tool: index.add_wiki_page] writing: ${page.slug}`);

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

        const filepath = path.join(wikiDir, `${page.slug}.md`);
        fs.writeFileSync(filepath, page.content);

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
        `Update an existing ${allowedType} page. Use this to revise pages identified as outdated, or to incorporate newly added wiki content. Supports full replacement via "content" or partial patches via "edits".`,
      inputSchema: z.object({
        slug: z.string().describe(`The slug, formatted as "${allowedType}-<domain-kebab>".`),
        title: z.string().optional(),
        type: z.enum(["domain-index", "learning-path"]).optional(),
        status: z.enum(["draft", "published", "archived"]).optional(),
        tags: z.array(z.string()).optional(),
        summary: z.string().optional(),
        content: z
          .string()
          .optional()
          .describe("Full replacement markdown. Mutually exclusive with `edits`. No /raw/ citations."),
        edits: z
          .array(
            z.object({
              old_content: z.string().describe("Exact string to find."),
              new_content: z.string().describe("Replacement string."),
            }),
          )
          .optional()
          .describe("Array of exact string replacements. Mutually exclusive with `content`."),
      }),
      execute: async (args) => {
        if (args.content !== undefined && args.edits !== undefined) {
          return {
            error: "Invalid arguments: provide either `content` (full replacement) or `edits` (partial patches), not both.",
          };
        }
        if (args.type && args.type !== allowedType) {
          return { error: `Type rejected: expected "${allowedType}" but got "${args.type}".` };
        }

        const existingPage = queries.getWikiPageBySlug(args.slug);
        if (!existingPage) {
          return {
            error: `Page "${args.slug}" not found. Use add_wiki_page to create a new page.`,
          };
        }
        if (existingPage.type !== allowedType) {
          return {
            error: `Page "${args.slug}" has type "${existingPage.type}", not "${allowedType}". Refusing to edit.`,
          };
        }

        const finalTitle = args.title ?? existingPage.title;
        const finalStatus = args.status ?? existingPage.status;
        const finalSummary = args.summary ?? existingPage.summary;
        const finalTags = args.tags ?? (existingPage.tags ? existingPage.tags.split(",") : []);

        let finalContent: string;
        let appliedEdits: Array<{ old_content: string; new_content: string; snippet: string }> = [];

        if (args.content !== undefined) {
          finalContent = args.content;
        } else if (args.edits !== undefined && args.edits.length > 0) {
          let workingContent = existingPage.content;
          const failed: string[] = [];

          for (const edit of args.edits) {
            if (!workingContent.includes(edit.old_content)) {
              failed.push(`old_content not found: "${edit.old_content.substring(0, 80)}${edit.old_content.length > 80 ? "…" : ""}"`);
            } else {
              workingContent = workingContent.replace(edit.old_content, edit.new_content);
              const idx = workingContent.indexOf(edit.new_content);
              const start = Math.max(0, idx - 40);
              const end = Math.min(workingContent.length, idx + edit.new_content.length + 40);
              appliedEdits.push({
                old_content: edit.old_content,
                new_content: edit.new_content,
                snippet: `…${workingContent.slice(start, end)}…`,
              });
            }
          }

          if (failed.length > 0) {
            return {
              error: `Partial edit failed. The following old_content strings were not found:\n${failed.join("\n")}\n\nCall get_wiki_page to read the current content and retry.`,
            };
          }
          finalContent = workingContent;
        } else {
          finalContent = existingPage.content;
        }

        const guard = validateIndexPagePayload(allowedType, args.slug, finalContent, finalTags);
        if (guard) return { error: guard };

        debugLog(`[Tool: index.edit_wiki_page] writing: ${args.slug}`);

        queries.updateWikiPage(
          existingPage.id,
          finalTitle,
          finalSummary,
          finalContent,
          finalTags.join(","),
          finalStatus,
        );

        const filepath = path.join(wikiDir, `${args.slug}.md`);
        fs.writeFileSync(filepath, finalContent);

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

        if (args.edits !== undefined && args.edits.length > 0) {
          return { success: true, action: "patched", slug: args.slug, applied_edits: appliedEdits };
        }

        return { success: true, action: "updated", slug: args.slug };
      },
    }),
  };
}
