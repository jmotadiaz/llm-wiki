import mermaid from 'mermaid';
import type { DiagramPlugin } from 'streamdown';

mermaid.initialize({ startOnLoad: false });

export const mermaidPlugin: DiagramPlugin = {
  name: 'mermaid',
  type: 'diagram',
  language: 'mermaid',
  getMermaid: () => mermaid,
};
