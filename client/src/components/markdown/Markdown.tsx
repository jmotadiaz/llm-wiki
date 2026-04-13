import { useMemo } from "react";
import { Streamdown, defaultRemarkPlugins } from "streamdown";
import remarkWikiLink from "remark-wiki-link";
import remarkGfm from "remark-gfm";
import { useNavigate } from "react-router-dom";
import remarkHeadingAnchors from "./remarkHeadingAnchors";

interface MarkdownProps {
  content: string;
  streaming?: boolean;
}

export default function Markdown({
  content,
  streaming = false,
}: MarkdownProps) {
  const navigate = useNavigate();

  // Custom remark plugins: defaults + wiki links + GFM
  const remarkPlugins = useMemo(
    () => [
      ...Object.values(defaultRemarkPlugins),
      remarkGfm,
      remarkHeadingAnchors,
      [
        remarkWikiLink,
        {
          hrefTemplate: (permalink: string) =>
            permalink ? `/wiki/${permalink}` : "",
          pageResolver: (name: string) =>
            name ? [name.toLowerCase().replace(/ /g, "-")] : [],
        },
      ],
    ],
    [],
  );

  return (
    <div className="prose dark:prose-invert max-w-none">
      <Streamdown
        remarkPlugins={remarkPlugins as any}
        components={{
          a: ({ node, ...props }: any) => {
            const { href = "", target, rel, ...rest } = props;
            const isInternal = href.startsWith("/") || href.startsWith("#");

            if (isInternal) {
              if (href.startsWith("#")) {
                // Intercept footnote references that point to raw sources
                // e.g., href="#user-content-fn-raw-4"
                const rawMatch = href.match(
                  /^#(?:user-content-)?fn-raw-(\d+)$/,
                );
                if (rawMatch) {
                  const rawPath = `/raw/${rawMatch[1]}`;
                  return (
                    <a
                      href={rawPath}
                      {...rest}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(rawPath);
                      }}
                    />
                  );
                }

                // Standard anchor links natively scroll the page
                return <a href={href} {...rest} />;
              }
              // Other internal links use React Router
              return (
                <a
                  href={href}
                  {...rest}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(href);
                  }}
                />
              );
            }
            // External links
            return (
              <a
                href={href}
                {...rest}
                rel="noopener noreferrer"
                target="_blank"
              />
            );
          },
        }}
      >
        {content}
      </Streamdown>
    </div>
  );
}
