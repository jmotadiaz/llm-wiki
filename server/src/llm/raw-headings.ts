import { getHeadingId } from "@llm-wiki/shared";

interface RawHeading {
  depth: number;
  text: string;
  fragment: string;
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

export function extractRawHeadings(rawContent: string): RawHeading[] {
  const lines = rawContent.split(/\r?\n/);
  const headings: RawHeading[] = [];
  let inCodeFence = false;
  let headingIndex = 0;

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

    // Use absolute index for deterministic IDs: user-content-[idx]-[slug]
    const fragment = getHeadingId(text, headingIndex);
    headingIndex++;

    headings.push({
      depth,
      text,
      fragment,
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
        `- /raw/${rawSourceId}#${heading.fragment} -> ${heading.text} (H${heading.depth})`,
    )
    .join("\n");
}
