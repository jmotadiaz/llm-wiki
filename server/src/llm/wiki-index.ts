import { Queries } from "../db/queries.js";

const EXCLUDED_FROM_INDEX = new Set(["learning-path"]);

function firstSentence(text: string | null | undefined): string {
  if (!text) return "";
  const trimmed = text.trim();
  const dotIdx = trimmed.indexOf(".");
  return dotIdx === -1 ? trimmed : trimmed.slice(0, dotIdx).trim();
}

export function buildIngestIndex(queries: Queries): string {
  const pages = queries
    .getAllWikiPages()
    .filter((p) => !EXCLUDED_FROM_INDEX.has(p.type));
  if (pages.length === 0) return "(No pages in wiki yet)";
  return pages
    .map((page) => {
      const tags = page.tags || "untagged";
      const synopsis = firstSentence(page.summary);
      const synopsisPart = synopsis ? ` | summary: ${synopsis}` : "";
      return `- /wiki/${page.slug}: ${page.title} | tags: ${tags}${synopsisPart}`;
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
      const synopsis = firstSentence(page.summary);
      const synopsisPart = synopsis ? ` | summary: ${synopsis}` : "";
      const inbound = inboundCounts.get(page.slug) ?? 0;
      return `- \`${page.slug}\` (${page.type}, inbound: ${inbound}): ${page.title} | tags: ${tags}${synopsisPart}`;
    })
    .join("\n");
}
