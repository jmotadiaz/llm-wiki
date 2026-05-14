import { memo, useMemo } from "react";
import { Streamdown, defaultRemarkPlugins } from "streamdown";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import remarkGfm from "remark-gfm";
import { useNavigate } from "react-router-dom";
import remarkHeadingAnchors from "./remarkHeadingAnchors";
import { useTheme } from "../ThemeContext";

interface MarkdownProps {
  content: string;
  className?: string;
  streaming?: boolean;
}

const Markdown = memo(function Markdown({
  content,
  className = "",
  streaming = false,
}: MarkdownProps) {
  const navigate = useNavigate();
  const { theme } = useTheme();

  // Custom remark plugins: defaults + wiki links + GFM.
  // Must depend on `content` so remarkHeadingAnchors gets a fresh instance
  // (reset headingIndex counter) for each document, matching server output.
  const remarkPlugins = useMemo(
    () => [
      ...Object.values(defaultRemarkPlugins),
      remarkGfm,
      remarkHeadingAnchors,
    ],
    [content],
  );

  // Mermaid theme follows the app theme. The config object is memoized on
  // `theme` so streamdown's internal effect (which depends on config
  // identity) only re-renders diagrams when the user actually toggles theme.
  const mermaidConfig = useMemo(
    () => ({
      config: {
        theme: theme === "dark" ? ("dark" as const) : ("default" as const),
        fontFamily: "inherit",
      },
    }),
    [theme],
  );

  return (
    <div className={`prose dark:prose-invert max-w-none ${className}`}>
      <Streamdown
        plugins={{ code, mermaid }}
        remarkPlugins={remarkPlugins as any}
        mermaid={mermaidConfig}
        controls={{
          table: false,
          code: { copy: true, download: false },
          mermaid: {
            copy: true,
            download: true,
            fullscreen: true,
            panZoom: true,
          },
        }}
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
}, (prev, next) => prev.content === next.content && prev.className === next.className);

Markdown.displayName = "Markdown";

export default Markdown;
