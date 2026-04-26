import { Queries } from "../db/queries.js";
import Database from "better-sqlite3";

export interface PageMeta {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  type: string;
  tags: string[];
  inboundLinks: number;
}

export interface DomainCluster {
  tag: string;
  pages: PageMeta[];
  relatedSlugs: string[];
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function loadPageMeta(db: Database.Database): PageMeta[] {
  const queries = new Queries(db);
  const pages = queries.getAllWikiPages();
  const inboundCounts = queries.getInboundLinkCounts();

  return pages
    .filter((p: any) => p.status === "published")
    .filter((p: any) => p.type !== "domain-index" && p.type !== "learning-path")
    .map((p: any) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      summary: p.summary,
      type: p.type,
      tags: parseTags(p.tags),
      inboundLinks: inboundCounts.get(p.slug) ?? 0,
    }));
}

export function discoverDomains(pages: PageMeta[]): DomainCluster[] {
  if (pages.length === 0) return [];

  const domainMap = new Map<string, PageMeta[]>();

  for (const page of pages) {
    const dTags = page.tags.filter(t => t.startsWith("d:"));
    const domainTag = dTags.length > 0 ? dTags[0].substring(2) : "untagged";

    if (!domainMap.has(domainTag)) {
      domainMap.set(domainTag, []);
    }
    domainMap.get(domainTag)!.push(page);
  }

  const clusters: DomainCluster[] = [];

  for (const [tag, matching] of domainMap.entries()) {
    if (tag === "untagged") continue;

    const domainTopics = new Set<string>();
    for (const p of matching) {
      for (const t of p.tags) {
        if (t.startsWith("t:")) {
          domainTopics.add(t);
        }
      }
    }

    const relatedSlugs = pages
      .filter(
        (p) =>
          !matching.some((m) => m.slug === p.slug) &&
          p.tags.some((t) => domainTopics.has(t))
      )
      .sort((a, b) => b.inboundLinks - a.inboundLinks)
      .slice(0, 8)
      .map((p) => p.slug);

    clusters.push({
      tag,
      pages: matching,
      relatedSlugs,
    });
  }

  return clusters;
}

export function assignLearningStages(pages: PageMeta[]): {
  fundamentals: PageMeta[];
  intermediate: PageMeta[];
  advanced: PageMeta[];
} {
  // agrupa primero por `t:` dentro del dominio
  const topicMap = new Map<string, PageMeta[]>();
  for (const page of pages) {
    const tTags = page.tags.filter(t => t.startsWith("t:"));
    const topic = tTags.length > 0 ? tTags[0] : "t:general";
    if (!topicMap.has(topic)) {
      topicMap.set(topic, []);
    }
    topicMap.get(topic)!.push(page);
  }

  // ordena cada grupo por inboundLinks, con a:fundamentals / a:advanced como tiebreakers
  const sortedTopics = Array.from(topicMap.values()).map(group => {
    return group.sort((a, b) => {
      const aFund = a.tags.includes("a:fundamentals") ? 1 : 0;
      const bFund = b.tags.includes("a:fundamentals") ? 1 : 0;
      if (aFund !== bFund) return bFund - aFund; // fundamentals first

      const aAdv = a.tags.includes("a:advanced") ? 1 : 0;
      const bAdv = b.tags.includes("a:advanced") ? 1 : 0;
      if (aAdv !== bAdv) return aAdv - bAdv; // advanced last

      return b.inboundLinks - a.inboundLinks;
    });
  });

  // Flatten the groups into a single sorted array
  const orderedPages: PageMeta[] = [];
  for (const group of sortedTopics) {
    orderedPages.push(...group);
  }

  // Now split them into stages just to satisfy the existing interface
  // (Alternatively we could change the interface, but keeping it ensures we don't break callers)
  const fundamentals: PageMeta[] = [];
  const intermediate: PageMeta[] = [];
  const advanced: PageMeta[] = [];

  for (const page of orderedPages) {
    const hasFundamentals = page.tags.includes("a:fundamentals");
    const hasAdvanced = page.tags.includes("a:advanced");
    
    if (hasFundamentals && !hasAdvanced) {
      fundamentals.push(page);
    } else if (hasAdvanced && !hasFundamentals) {
      advanced.push(page);
    } else {
      intermediate.push(page);
    }
  }

  // If there are no fundamentals, promote the first half of intermediate
  if (fundamentals.length === 0 && intermediate.length > 0) {
    const half = Math.ceil(intermediate.length / 2);
    fundamentals.push(...intermediate.splice(0, half));
  }

  return { fundamentals, intermediate, advanced };
}

export function domainSlug(tag: string): string {
  const cleanTag = tag.startsWith("d:") ? tag.substring(2) : tag;
  return cleanTag.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
