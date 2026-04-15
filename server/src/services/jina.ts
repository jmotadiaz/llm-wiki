interface JinaResponse {
  data: {
    title: string | null;
    description: string | null;
    content: string;
    publishedTime: string | null;
    metadata: {
      author: string | null;
      "og:article:modified_time": string | null;
    };
  };
}

interface JinaOptions {
  targetSelector?: string;
  removeSelector?: string;
  removeSelectors?: string[];
}

const DEFAULT_EXCLUDE = [
  "header",
  "footer",
  "nav",
  "aside",
  ".class",
  "#id",
  "script",
  "style",
  "noscript",
  "template",
  "[role='navigation']",
  "[role='banner']",
  "[role='complementary']",
  "[role='contentinfo']",
  "[class*='cookie']",
  "[id*='cookie']",
  "[class*='consent']",
  "[id*='consent']",
  ".advertisement",
  ".ads",
  ".ad",
  "[class*='advert']",
  "[id*='advert']",
  ".ad-container",
  ".ad-slot",
  ".modal",
  ".popup",
  ".overlay",
  "[role='dialog']",
  "[aria-modal='true']",
  ".sidebar",
  ".widget",
  ".share-bar",
  ".social-share",
  "[class*='share']",
  "iframe",
  "svg",
  "[aria-hidden='true']",
  ".breadcrumb",
  ".pagination",
  "[class*='newsletter']",
  "[class*='subscribe']",
  "[class*='promo']",
  "[class*='banner']",
];

export class JinaReader {
  private baseUrl = "https://r.jina.ai/";

  async extractUrl(
    url: string,
    options?: JinaOptions,
  ): Promise<{
    title: string | null;
    description: string | null;
    content: string;
    publishedTime: string | null;
    author: string | null;
  }> {
    const apiKey = process.env.JINA_API_KEY;

    const removeSelectors = [
      ...DEFAULT_EXCLUDE,
      ...(options?.removeSelectors || []),
    ];

    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Md-Link-Style": "discarded",
      "X-Return-Format": "markdown",
    };

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    if (removeSelectors.length > 0) {
      headers["X-Remove-Selector"] = removeSelectors.join(", ");
    }

    if (options?.targetSelector) {
      headers["X-Target-Selector"] = options.targetSelector;
    }

    const response = await fetch(this.baseUrl + url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(
        `Jina API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as JinaResponse;
    console.log(data.data.publishedTime);
    const modifiedDate =
      data.data.metadata["og:article:modified_time"] || data.data.publishedTime;
    return {
      title: data.data.title || null,
      description: data.data.description || null,
      content: data.data.content,
      publishedTime: modifiedDate ? new Date(modifiedDate).toISOString() : null,
      author: data.data.metadata?.author || null,
    };
  }
}
