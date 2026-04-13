interface RawHeading {
  depth: number;
  text: string;
  fragment: string;
}

function slugifyHeading(text: string): string {
  const normalized = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "section";
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^\)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+#+\s*$/, "")
    .trim();
}

function toDomFragment(fragment: string): string {
  return `user-content-${fragment}`;
}

export function extractRawHeadings(rawContent: string): RawHeading[] {
  const lines = rawContent.split(/\r?\n/);
  const seenFragments = new Map<string, number>();
  const headings: RawHeading[] = [];
  let inCodeFence = false;

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) {
      continue;
    }

    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) {
      continue;
    }

    const depth = match[1].length;
    const text = stripInlineMarkdown(match[2]);
    if (!text) {
      continue;
    }

    const baseFragment = slugifyHeading(text);
    const duplicateCount = seenFragments.get(baseFragment) ?? 0;
    seenFragments.set(baseFragment, duplicateCount + 1);

    headings.push({
      depth,
      text,
      fragment:
        duplicateCount === 0
          ? baseFragment
          : `${baseFragment}-${duplicateCount}`,
    });
  }

  return headings;
}

export function buildRawHeadingIndex(
  rawContent: string,
  rawSourceId: number,
): string {
  const headings = extractRawHeadings(rawContent).filter(
    (heading) => heading.depth >= 2,
  );

  if (headings.length === 0) {
    return `- No section headings detected for /raw/${rawSourceId}. Use /raw/${rawSourceId} without a fragment.`;
  }

  return headings
    .map(
      (heading) =>
        `- /raw/${rawSourceId}#${toDomFragment(heading.fragment)} -> ${heading.text} (H${heading.depth})`,
    )
    .join("\n");
}
