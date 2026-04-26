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

export function createIndexTools(
  db: Database.Database,
  allowedType: "domain-index" | "learning-path",
  expectedSlug: string,
  result: IndexAgentResult,
) {
  const queries = new Queries(db);
  const wikiDir = ensureWikiDirectory();

  function validateIndexArgs(slug: string, type: string, content: string): string | null {
    if (slug !== expectedSlug) {
      return `Slug rejected: expected "${expectedSlug}" but got "${slug}". Use the target slug from the prompt.`;
    }
    if (type !== allowedType) {
      return `Type rejected: expected "${allowedType}" but got "${type}".`;
    }
    if (content.includes("/raw/")) {
      return `Index pages MUST NOT contain /raw/ citations. Use only [[slug]] links to wiki pages.`;
    }
    return null;
  }

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

    add_wiki_page: tool({
      description:
        "Create the target index page. The slug MUST match the provided target slug. The page type MUST match the agent's target type.",
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
        const guard = validateIndexArgs(page.slug, page.type, page.content);
        if (guard) return { error: guard };

        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(page.slug)) {
          return { error: `Slug "${page.slug}" is not valid kebab-case.` };
        }

        const tagValidation = validateTagContract(page.tags);
        if (!tagValidation.valid) {
          return { error: `Tags rejected: ${tagValidation.error}` };
        }

        debugLog(`[Tool: index.add_wiki_page] writing: ${page.slug}`);

        const existing = queries.getWikiPageBySlug(page.slug);
        if (existing) {
          return {
            error: `Slug "${page.slug}" already exists. Use edit_wiki_page to update it.`,
          };
        }

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

        const linkRegex = /\[\[([^\]]+)\]\]/g;
        let match;
        while ((match = linkRegex.exec(page.content)) !== null) {
          const linkSlug = match[1].split("|")[0].trim();
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
        "Update the target index page. The slug MUST match the provided target slug. Supports two mutually exclusive modes: full replacement via `content`, or partial patching via `edits` array.",
      inputSchema: z.object({
        slug: z.string().describe("The slug of the index page (must match the target slug)."),
        title: z.string().optional().describe("Updated title (Spanish). If omitted, the existing title is preserved."),
        type: z
          .enum(["domain-index", "learning-path"])
          .optional()
          .describe("Updated page type. If omitted, the existing type is preserved."),
        status: z.enum(["draft", "published", "archived"]).optional(),
        tags: z.array(z.string()).optional().describe("Updated list of tags. If omitted, existing tags are preserved."),
        summary: z.string().optional().describe("Updated summary (Spanish). If omitted, existing summary is preserved."),
        content: z
          .string()
          .optional()
          .describe("Full replacement markdown content. Mutually exclusive with `edits`. Do not use /raw/ citations."),
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
        if (args.slug !== expectedSlug) {
          return {
            error: `Slug rejected: expected "${expectedSlug}" but got "${args.slug}". Use the target slug from the prompt.`,
          };
        }
        if (args.content !== undefined && args.edits !== undefined) {
          return {
            error: "Invalid arguments: provide either `content` (full replacement) or `edits` (partial patches), not both.",
          };
        }
        if (args.content?.includes("/raw/")) {
          return { error: `Index pages MUST NOT contain /raw/ citations. Use only [[slug]] links to wiki pages.` };
        }
        if (args.type && args.type !== allowedType) {
          return { error: `Type rejected: expected "${allowedType}" but got "${args.type}".` };
        }

        const tagValidation = args.tags ? validateTagContract(args.tags) : { valid: true };
        if (!tagValidation.valid) {
          return { error: `Tags rejected: ${(tagValidation as any).error}` };
        }

        const existingPage = queries.getWikiPageBySlug(args.slug);
        if (!existingPage) {
          return {
            error: `Page "${args.slug}" not found. Use add_wiki_page to create a new page.`,
          };
        }

        debugLog(`[Tool: index.edit_wiki_page] writing: ${args.slug}`);

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
        const linkRegex = /\[\[([^\]]+)\]\]/g;
        let match;
        while ((match = linkRegex.exec(finalContent)) !== null) {
          const linkSlug = match[1].split("|")[0].trim();
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

    delete_wiki_page: tool({
      description:
        "Permanently delete a wiki page by its slug. Removes the page from the database and the filesystem.",
      inputSchema: z.object({
        slug: z.string().describe("The slug of the wiki page to delete."),
      }),
      execute: async ({ slug }) => {
        debugLog(`[Tool: index.delete_wiki_page] slug: ${slug}`);
        const existingPage = queries.getWikiPageBySlug(slug);
        if (!existingPage) {
          return { error: `Page "${slug}" not found. Nothing to delete.` };
        }
        queries.deleteWikiLinksForPage(existingPage.id);
        const stmt = db.prepare("DELETE FROM wiki_pages WHERE id = ?");
        stmt.run(existingPage.id);
        const filepath = path.join(wikiDir, `${slug}.md`);
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        return { success: true, action: "deleted", slug };
      },
    }),
  };
}
