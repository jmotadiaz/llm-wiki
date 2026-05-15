import { Queries } from "../db/queries.js";

const EXCLUDED_FROM_INDEX = new Set(["learning-path"]);

export function buildIngestIndex(queries: Queries): string {
  const pages = queries
    .getAllWikiPages()
    .filter((p) => !EXCLUDED_FROM_INDEX.has(p.type));
  if (pages.length === 0) return "(No pages in wiki yet)";
  return pages
    .map((page) => {
      const tags = page.tags || "untagged";
      const summary = page.summary ? ` | summary: ${page.summary}` : "";
      return `- /wiki/${page.slug}: ${page.title} | tags: ${tags}${summary}`;
    })
    .join("\n");
}

export function buildDetailedIndex(queries: Queries): string {
  const pages = queries
    .getAllWikiPages()
    .filter((p) => !EXCLUDED_FROM_INDEX.has(p.type));
  if (pages.length === 0) return "(No pages in wiki yet)";
  const inboundCounts = queries.getInboundLinkCounts();
  return pages
    .map((page) => {
      const tags = page.tags || "untagged";
      const summary = page.summary ? ` | summary: ${page.summary}` : "";
      const inbound = inboundCounts.get(page.slug) ?? 0;
      return `- \`${page.slug}\` (${page.type}, inbound: ${inbound}): ${page.title} | tags: ${tags}${summary}`;
    })
    .join("\n");
}
