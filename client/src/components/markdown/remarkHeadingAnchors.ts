import { visit } from "unist-util-visit";

interface MarkdownNode {
  type?: string;
  value?: string;
  alt?: string;
  children?: MarkdownNode[];
  data?: {
    id?: string;
    hProperties?: Record<string, unknown>;
  };
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

function extractNodeText(node: MarkdownNode): string {
  if (typeof node.value === "string") {
    return node.value;
  }

  if (node.type === "image" && typeof node.alt === "string") {
    return node.alt;
  }

  return node.children?.map(extractNodeText).join("") ?? "";
}

export default function remarkHeadingAnchors() {
  return (tree: any) => {
    const seenFragments = new Map<string, number>();

    visit(tree, "heading", (node: any) => {
      const text = extractNodeText(node).trim();
      if (!text) {
        return;
      }

      const baseFragment = slugifyHeading(text);
      const duplicateCount = seenFragments.get(baseFragment) ?? 0;
      seenFragments.set(baseFragment, duplicateCount + 1);

      const fragment =
        duplicateCount === 0
          ? baseFragment
          : `${baseFragment}-${duplicateCount}`;

      node.data ??= {};
      node.data.id = fragment;
      node.data.hProperties = {
        ...(node.data.hProperties || {}),
        id: fragment,
      };
    });
  };
}
