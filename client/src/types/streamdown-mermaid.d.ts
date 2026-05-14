// Stub for @streamdown/mermaid — package is not installed locally.
// Loaded at runtime via esm.sh import map; types are inlined here to
// avoid installing mermaid and its ~50 transitive deps on the build host.
declare module "@streamdown/mermaid" {
  import type { DiagramPlugin } from "streamdown";
  export const mermaid: DiagramPlugin;
  export function createMermaidPlugin(options?: {
    config?: Record<string, unknown>;
  }): DiagramPlugin;
}
