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
  const linkRegex = /\[([^\]]+)\]\(\/wiki\/([^)]+)\)/g;
  const links: string[] = [];
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const slug = match[2].trim();
    if (slug) links.push(slug);
  }
  return links;
}

function findMalformedRawCitations(content: string): string[] {
  // [/raw/123] — URL directly in brackets, missing link text
  const bracketWrapped = content.match(/\[(?:\s*)\/raw\/[^\]\s]+(?:\s*)\]/g) || [];
  // [N](/raw/123] — correct text bracket but URL closed with ] instead of )
  const bracketClosed = content.match(/\[\d+\]\(\/raw\/[^)]*\]/g) || [];
  return [...bracketWrapped, ...bracketClosed];
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

export function ensureWikiDirectory(): string {
  const wikiDir = path.join(__dirname, "../../..", "data", "wiki");
  if (!fs.existsSync(wikiDir)) {
    fs.mkdirSync(wikiDir, { recursive: true });
  }
  return wikiDir;
}

/**
 * Shared page content validations used by add_wiki_page and edit_wiki_page.
 * Returns an error string if invalid, or null if valid.
 */
function validatePageContent(
  slug: string,
  tags: string[],
  content: string,
  knownSlugs: Set<string>,
  allowRawCitations: boolean,
): string | null {
  if (slug.length > 60) {
    return `Slug rejected: "${slug.substring(0, 30)}..." is ${slug.length} chars (max 60).`;
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return `Slug rejected: "${slug}" is not valid kebab-case.`;
  }

  const tagValidation = validateTagContract(tags);
  if (!tagValidation.valid) {
    return `Tags rejected: ${tagValidation.error}`;
  }

  if (allowRawCitations) {
    const malformed = findMalformedRawCitations(content);
    if (malformed.length > 0) {
      return `Raw citation syntax rejected: citation URLs must close with ")" — correct forms are [1](/raw/123) or [1](/raw/123#user-content-fragment). Found a malformed citation that closes with "]" or wraps the URL in brackets directly. Fix: replace the closing "]" with ")".`;
    }

    const badLinks = findRawLinksThatShouldBeWikiLinks(content, knownSlugs);
    if (badLinks.length > 0) {
      const offender = badLinks[0];
      return `Wiki cross-reference rejected. "[${offender.label}](${offender.href})" should use [${offender.label}](/wiki/${offender.slug}) instead.`;
    }
  }

  return null;
}

/**
 * Shared helper to write a page to the DB, filesystem, and update wiki links.
 * Does NOT create page_sources entries.
 */
function persistPage(
  queries: Queries,
  wikiDir: string,
  pageId: number,
  page: {
    slug: string;
    title: string;
    summary: string;
    content: string;
    tags: string[];
    status: string;
  },
): void {
  queries.updateWikiPage(
    pageId,
    page.title,
    page.summary,
    page.content,
    page.tags.join(","),
    page.status,
  );

  const filepath = path.join(wikiDir, `${page.slug}.md`);
  fs.writeFileSync(filepath, page.content);

  queries.deleteWikiLinksForPage(pageId);
  const wikiLinks = extractWikiLinks(page.content);
  for (const linkSlug of wikiLinks) {
    queries.insertWikiLink(pageId, linkSlug);
  }
}

export interface WikiToolsOptions {
  /**
   * Whether to validate /raw/ citations in page content.
   * The ingest writer and reviewer work with raw source citations;
   * the index agent does NOT (index pages use only [text](/wiki/slug) links).
   */
  allowRawCitations: boolean;
  /**
   * Optional hook called after a page is successfully added or edited.
   * Useful for tracking which slugs were touched (e.g. for pagesEdited arrays).
   */
  onPageWritten?: (slug: string) => void;
  /**
   * Optional: if provided, add_wiki_page / edit_wiki_page will also call
   * queries.insertPageSource(pageId, rawSourceId) to link the raw source.
   */
  rawSourceId?: number;
}

/**
 * Creates the shared wiki editing tools (add_wiki_page, edit_wiki_page, delete_wiki_page).
 * These replace the legacy upsert_wiki_page tool.
 */
export function createWikiEditTools(
  db: Database.Database,
  options: WikiToolsOptions,
) {
  const queries = new Queries(db);
  const wikiDir = ensureWikiDirectory();
  const { allowRawCitations, onPageWritten, rawSourceId } = options;

  return {
    add_wiki_page: tool({
      description:
        "Create a new wiki page. Fails if a page with the given slug already exists. Use edit_wiki_page to update an existing page.",
      inputSchema: z.object({
        slug: z
          .string()
          .describe(
            "The unique slug of the page (English, kebab-case, max 60 chars).",
          ),
        title: z.string().describe("The human-readable title (Spanish)."),
        type: z
          .enum([
            "concept",
            "technique",
            "reference",
            "index",
            "domain-index",
            "learning-path",
          ])
          .describe("The page type."),
        status: z
          .enum(["draft", "published", "archived"])
          .describe("Lifecycle status."),
        tags: z.array(z.string()).describe("List of tags (English)."),
        summary: z.string().describe("Short summary (Spanish)."),
        content: z
          .string()
          .describe(
            "Full markdown content (Spanish). Use [text](/wiki/slug) for wiki cross-references. Reserve /raw links for citations only: [1](/raw/{RAW_ID}#user-content-fragment) or [1](/raw/{RAW_ID}).",
          ),
      }),
      execute: async (page) => {
        console.log(`[Tool: wiki.add_wiki_page] slug: ${page.slug}`);

        const knownSlugs = new Set(
          queries.getAllWikiPages().map((p) => p.slug),
        );

        const validationError = validatePageContent(
          page.slug,
          page.tags,
          page.content,
          knownSlugs,
          allowRawCitations,
        );
        if (validationError) {
          return { error: validationError };
        }

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

        queries.deleteWikiLinksForPage(pageId);
        const wikiLinks = extractWikiLinks(page.content);
        for (const linkSlug of wikiLinks) {
          queries.insertWikiLink(pageId, linkSlug);
        }

        if (rawSourceId !== undefined) {
          queries.insertPageSource(pageId, rawSourceId);
        }

        onPageWritten?.(page.slug);

        return {
          success: true,
          action: "created",
          slug: page.slug,
        };
      },
    }),

    edit_wiki_page: tool({
      description:
        "Update an existing wiki page. Fails if the slug does not exist. Supports two mutually exclusive modes: (1) full content replacement via the `content` field, or (2) partial patching via the `edits` array of {old_content, new_content} pairs. You MUST provide exactly one of `content` or `edits`, not both.",
      inputSchema: z.object({
        slug: z
          .string()
          .describe(
            "The unique slug of the page to update (must already exist).",
          ),
        title: z
          .string()
          .optional()
          .describe(
            "Updated human-readable title (Spanish). If omitted, the existing title is preserved.",
          ),
        type: z
          .enum([
            "concept",
            "technique",
            "reference",
            "index",
            "domain-index",
            "learning-path",
          ])
          .optional()
          .describe(
            "Updated page type. If omitted, the existing type is preserved.",
          ),
        status: z
          .enum(["draft", "published", "archived"])
          .optional()
          .describe(
            "Updated lifecycle status. If omitted, the existing status is preserved.",
          ),
        tags: z
          .array(z.string())
          .optional()
          .describe(
            "Updated list of tags (English). If omitted, the existing tags are preserved.",
          ),
        summary: z
          .string()
          .optional()
          .describe(
            "Updated short summary (Spanish). If omitted, the existing summary is preserved.",
          ),
        content: z
          .string()
          .optional()
          .describe(
            "Full replacement markdown content (Spanish). Mutually exclusive with `edits`. If provided, replaces the entire page body.",
          ),
        edits: z
          .array(
            z.object({
              old_content: z
                .string()
                .describe(
                  "The exact string to find in the current page content.",
                ),
              new_content: z.string().describe("The replacement string."),
            }),
          )
          .optional()
          .describe(
            "Array of exact string replacements. Mutually exclusive with `content`. Each edit replaces old_content with new_content. The replacements are applied sequentially.",
          ),
      }),
      execute: async (args) => {
        console.log(`[Tool: wiki.edit_wiki_page] slug: ${args.slug}`);

        // Runtime mutual exclusivity check
        if (args.content !== undefined && args.edits !== undefined) {
          return {
            error:
              "Invalid arguments: you must provide either `content` (full replacement) or `edits` (partial patches), not both.",
          };
        }

        const existingPage = queries.getWikiPageBySlug(args.slug);
        if (!existingPage) {
          return {
            error: `Page "${args.slug}" not found. Use add_wiki_page to create a new page.`,
          };
        }

        // Resolve final metadata (fall back to existing values if not provided)
        const finalTitle = args.title ?? existingPage.title;
        const finalStatus = args.status ?? existingPage.status;
        const finalSummary = args.summary ?? existingPage.summary;
        const finalTags =
          args.tags ?? (existingPage.tags ? existingPage.tags.split(",") : []);

        let finalContent: string;
        let appliedEdits: Array<{
          old_content: string;
          new_content: string;
          snippet: string;
        }> = [];

        if (args.content !== undefined) {
          // Full replacement mode
          finalContent = args.content;
        } else if (args.edits !== undefined && args.edits.length > 0) {
          // Partial patching mode
          let workingContent = existingPage.content;
          const failed: string[] = [];

          for (const edit of args.edits) {
            if (!workingContent.includes(edit.old_content)) {
              failed.push(
                `old_content not found: "${edit.old_content.substring(0, 80)}${edit.old_content.length > 80 ? "…" : ""}"`,
              );
            } else {
              workingContent = workingContent.replace(
                edit.old_content,
                edit.new_content,
              );
              // Capture a snippet of the surrounding context for verification
              const idx = workingContent.indexOf(edit.new_content);
              const start = Math.max(0, idx - 40);
              const end = Math.min(
                workingContent.length,
                idx + edit.new_content.length + 40,
              );
              appliedEdits.push({
                old_content: edit.old_content,
                new_content: edit.new_content,
                snippet: `…${workingContent.slice(start, end)}…`,
              });
            }
          }

          if (failed.length > 0) {
            return {
              error: `Partial edit failed. The following old_content strings were not found in the page:\n${failed.join("\n")}\n\nCall get_wiki_page to read the current content and retry with the exact text.`,
            };
          }

          finalContent = workingContent;
        } else {
          // No content or edits — only metadata fields are being updated
          finalContent = existingPage.content;
        }

        // Validate the final content
        const knownSlugs = new Set(
          queries.getAllWikiPages().map((p) => p.slug),
        );
        knownSlugs.add(args.slug);

        const validationError = validatePageContent(
          args.slug,
          finalTags,
          finalContent,
          knownSlugs,
          allowRawCitations,
        );
        if (validationError) {
          return { error: validationError };
        }

        persistPage(queries, wikiDir, existingPage.id, {
          slug: args.slug,
          title: finalTitle,
          summary: finalSummary,
          content: finalContent,
          tags: finalTags,
          status: finalStatus,
        });

        if (rawSourceId !== undefined) {
          queries.insertPageSource(existingPage.id, rawSourceId);
        }

        onPageWritten?.(args.slug);

        if (args.edits !== undefined && args.edits.length > 0) {
          return {
            success: true,
            action: "patched",
            slug: args.slug,
            applied_edits: appliedEdits,
          };
        }

        return {
          success: true,
          action: "updated",
          slug: args.slug,
        };
      },
    }),

    delete_wiki_page: tool({
      description:
        "Permanently delete a wiki page by its slug. Removes the page from the database and the filesystem. Use with care — this is irreversible. Useful for consolidating duplicate pages.",
      inputSchema: z.object({
        slug: z.string().describe("The slug of the wiki page to delete."),
      }),
      execute: async ({ slug }) => {
        console.log(`[Tool: wiki.delete_wiki_page] slug: ${slug}`);

        const existingPage = queries.getWikiPageBySlug(slug);
        if (!existingPage) {
          return {
            error: `Page "${slug}" not found. Nothing to delete.`,
          };
        }

        // Remove wiki links originating from this page
        queries.deleteWikiLinksForPage(existingPage.id);

        // Remove from DB
        const stmt = db.prepare("DELETE FROM wiki_pages WHERE id = ?");
        stmt.run(existingPage.id);

        // Remove from filesystem
        const filepath = path.join(wikiDir, `${slug}.md`);
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }

        return {
          success: true,
          action: "deleted",
          slug,
        };
      },
    }),
  };
}
