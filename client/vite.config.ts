import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// ── Externalización vía import maps (solo en build) ──
// Marcar como external evita que Rolldown procese estos paquetes,
// reduciendo drásticamente el tiempo de build. El navegador los
// resuelve en runtime usando el import map inyectado en index.html.
//
// ⚠️ Trade-off: más requests HTTP, sin tree-shaking ni code-splitting
//    de estos paquetes. Solo recomendado si el tiempo de build es crítico.

interface ExternalEntry {
  name: string;       // bare specifier, ej. "react"
  url: string;        // CDN URL, ej. "https://esm.sh/react@18.2.0?target=es2020"
  preload?: boolean;  // inyectar <link rel="modulepreload"> para ruta crítica
}

const EXTERNALS: ExternalEntry[] = [
  // ── React core ──
  // ?target=es2020 alinea el transpile de esm.sh con el target del build de Vite,
  // evitando código duplicado y garantizando compatibilidad con los módulos locales.
  { name: 'react',             url: 'https://esm.sh/react@18.2.0?target=es2020',                                              preload: true  },
  { name: 'react/jsx-runtime', url: 'https://esm.sh/react@18.2.0/jsx-runtime?target=es2020',                                  preload: true  },
  { name: 'react-dom',         url: 'https://esm.sh/react-dom@18.2.0?bundle&external=react&target=es2020',                   preload: true  },
  { name: 'react-dom/client',  url: 'https://esm.sh/react-dom@18.2.0/client?external=react,react-dom&target=es2020',          preload: true  },

  // ── Router ──
  { name: 'react-router-dom',  url: 'https://esm.sh/react-router-dom@6.20.1?bundle&external=react,react-dom&target=es2020',  preload: true  },

  // ── Vercel AI SDK ──
  // @ai-sdk/react necesita `ai` en ?external para que el browser resuelva ambos
  // desde el import map y no se creen dos instancias del SDK en memoria.
  // { name: 'ai',                url: 'https://esm.sh/ai@6?bundle&external=react&target=es2020' },
  // { name: '@ai-sdk/react',     url: 'https://esm.sh/@ai-sdk/react@3?bundle&external=react,react-dom,ai&target=es2020' },

  // ── Markdown / Streamdown ──
  // shiki sin ?bundle: lazy-load de lenguajes desde esm.sh en demanda.
  // @streamdown/code con ?external=shiki: evita imports con hash 404.
  // streamdown con ?external=remark-gfm: remark-gfm ya está en el import map;
  //   si esm.sh lo bundleara dentro de streamdown habría dos instancias del plugin.
  // { name: 'shiki',             url: 'https://esm.sh/shiki@3.19.0?target=es2020' },
  // { name: 'shiki/engine/javascript', url: 'https://esm.sh/shiki@3.19.0/engine/javascript?target=es2020' },
  // { name: '@streamdown/code',  url: 'https://esm.sh/@streamdown/code@1.1.1?external=shiki&target=es2020' },
  // { name: 'streamdown',        url: 'https://esm.sh/streamdown@2.5.0?bundle&external=react,react-dom,remark-gfm&target=es2020' },
  // { name: 'remark-gfm',        url: 'https://esm.sh/remark-gfm@4.0.0?bundle&target=es2020' },

  // ── Graph ──
  // { name: 'react-force-graph-2d', url: 'https://esm.sh/react-force-graph-2d@1.25.4?bundle&external=react,react-dom&target=es2020' },

  // ── Utils ──
  // ❌ NO externalizar: esm.sh genera bundles con instancias duplicadas
  //    de React que rompen el Router context (useNavigate falla).
  //    Se mantiene en el bundle local.
  // { name: 'nuqs',               url: 'https://esm.sh/nuqs@2.8.9?bundle&external=react' },
  // { name: 'nuqs/adapters/react-router/v6', url: 'https://esm.sh/nuqs@2.8.9/adapters/react-router/v6?external=react' },
];

function externalizePlugin(): Plugin {
  return {
    name: 'externalize-importmap',
    enforce: 'pre',

    config(config, { command }) {
      // Solo externalizar en build, no en dev (Vite pre-bundlea con esbuild)
      if (command !== 'build') return;

      const external = EXTERNALS.map(e => e.name);

      return {
        build: {
          rollupOptions: {
            ...config.build?.rollupOptions,
            external: [
              ...(config.build?.rollupOptions?.external || []),
              ...external,
            ],
          },
        },
      };
    },

    transformIndexHtml: {
      order: 'post' as const,
      handler(html, { bundle }) {
        // bundle solo está presente en build, no en dev
        if (!bundle) return html;

        const imports: Record<string, string> = Object.fromEntries(
          EXTERNALS.map(e => [e.name, e.url])
        );
        // Prefix mapping para sub-paths de shiki (e.g. shiki/themes/nord).
        // No puede llevar ?target porque la URL actúa como prefijo y el path
        // se concatena directamente tras ella.
        imports['shiki/'] = 'https://esm.sh/shiki@3.19.0/';

        const importMap = { imports };

        // Preconnect: reduce el RTT del primer request a esm.sh
        const preconnect = `<link rel="preconnect" href="https://esm.sh" crossorigin>`;

        // Modulepreload: el browser descarga y parsea los módulos críticos
        // antes de que el bundle principal los importe, eliminando la latencia
        // de resolución en cascada (react → jsx-runtime → react-dom/client → router).
        const modulepreloads = EXTERNALS
          .filter(e => e.preload)
          .map(e => `<link rel="modulepreload" href="${e.url}" crossorigin>`)
          .join('\n  ');

        const importMapScript = `<script type="importmap">\n${JSON.stringify(importMap, null, 2)}\n</script>`;

        const injection = [preconnect, modulepreloads, importMapScript].join('\n  ');

        return html.replace('</head>', `  ${injection}\n</head>`);
      },
    },
  };
}

export default defineConfig({
  plugins: [
    externalizePlugin(),
    react(),
  ],
  // Persistent cache for pre-bundled deps + plugin transforms. Survives
  // between `npm run build` invocations so unchanged modules are not
  // re-parsed.
  cacheDir: 'node_modules/.vite',
  build: {
    target: "ES2020",
    outDir: "dist",
    // Don't wipe the output dir before each build — Rolldown writes files
    // with content-hashed names, so unchanged sources produce the same
    // filename and rsync / CDNs skip them. A full reset is available via
    // `npm run build:fresh`.
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      output: {
        // Stable manual chunking: vendor code lives in its own chunk
        // whose hash only changes when its inputs change. App-only edits
        // therefore re-emit just the app chunk, not the vendor chunk.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // react-force-graph only — d3 packages stay in vendor to avoid
          // circular chunk: vendor -> graph -> vendor (d3 ↔ internmap/delaunator).
          if (id.includes('react-force-graph')) return 'graph';
          // @streamdown/mermaid imports the mermaid package (and all its heavy
          // transitive deps: cytoscape, dagre, d3-*). Routing it to vendor prevents
          // Rolldown from pulling those deps into the markdown chunk, which would
          // create a circular dependency (markdown -> vendor -> markdown).
          // Must come before the generic @streamdown rule below.
          // Markdown stack (streamdown, shiki, mermaid) all goes to vendor.
          // Splitting them into a separate 'markdown' chunk causes a circular
          // dependency (markdown -> vendor -> markdown) due to @shikijs/core
          // importing hast-util-to-html and its transitive deps — same pattern
          // as the react-force-graph / d3 problem above.
          if (id.includes('/ai/') || id.includes('@ai-sdk/')) return 'ai';

          return 'vendor';
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3005'
    }
  }
});
