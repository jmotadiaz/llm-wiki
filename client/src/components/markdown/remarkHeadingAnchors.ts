import { visit } from "unist-util-visit";
import { getHeadingId } from "@llm-wiki/shared";

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
    let headingIndex = 0;

    visit(tree, "heading", (node: any) => {
      const text = extractNodeText(node).trim();
      if (!text) {
        return;
      }

      // Use absolute index for deterministic IDs: user-content-[idx]-[slug]
      const fragment = getHeadingId(text, headingIndex);
      headingIndex++;

      node.data ??= {};
      node.data.id = fragment;
      node.data.hProperties = {
        ...(node.data.hProperties || {}),
        id: fragment,
      };
    });
  };
}
