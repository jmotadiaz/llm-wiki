import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// ── Externalización vía import maps (solo en build) ──
// Marcar como external evita que Rolldown procese estos paquetes,
// reduciendo drásticamente el tiempo de build. El navegador los
// resuelve en runtime usando el import map inyectado en index.html.
//
// ⚠️ Trade-off: más requests HTTP, sin tree-shaking ni code-splitting
//    de estos paquetes. Solo recomendado si el tiempo de build es crítico.
//
// React, react-dom y react-router-dom NO están aquí: se bundlean localmente
// (ruta crítica sin dependencia de CDN). Sus URLs se inyectan en el import
// map dinámicamente desde los chunks generados, de modo que los módulos CDN
// que declaran ?external=react,react-dom resuelven la misma instancia local.

interface ExternalEntry {
  name: string;  // bare specifier, ej. "streamdown"
  url: string;   // CDN URL con ?bundle/?external adecuados
}

const EXTERNALS: ExternalEntry[] = [
  // ── Vercel AI SDK ──
  // @ai-sdk/react necesita `ai` en ?external para que el browser resuelva ambos
  // desde el import map y no se creen dos instancias del SDK en memoria.
  { name: 'ai',                   url: 'https://esm.sh/ai@6?bundle&external=react&target=es2020' },
  { name: '@ai-sdk/react',        url: 'https://esm.sh/@ai-sdk/react@3?bundle&external=react,react-dom,ai&target=es2020' },

  // ── Markdown / Streamdown ──
  // shiki sin ?bundle: lazy-load de lenguajes bajo demanda.
  // @streamdown/code con ?external=shiki: evita imports con hash 404.
  // streamdown con ?external=remark-gfm: remark-gfm ya está en el import map;
  //   bundlearlo dentro crearía dos instancias del plugin.
  { name: 'shiki',                url: 'https://esm.sh/shiki@3.19.0?target=es2020' },
  { name: 'shiki/engine/javascript', url: 'https://esm.sh/shiki@3.19.0/engine/javascript?target=es2020' },
  { name: '@streamdown/code',     url: 'https://esm.sh/@streamdown/code@1.1.1?external=shiki&target=es2020' },
  { name: 'streamdown',           url: 'https://esm.sh/streamdown@2.5.0?bundle&external=react,react-dom,remark-gfm&target=es2020' },
  { name: 'remark-gfm',           url: 'https://esm.sh/remark-gfm@4.0.0?bundle&target=es2020' },

  // ── Graph ──
  // Solo se usa en /graph; el ?bundle agrupa ~80 sub-módulos d3 en uno solo.
  { name: 'react-force-graph-2d', url: 'https://esm.sh/react-force-graph-2d@1.25.4?bundle&external=react,react-dom&target=es2020' },

  // ── Utils ──
  // ❌ NO externalizar: esm.sh genera bundles con instancias duplicadas
  //    de React que rompen el Router context (useNavigate falla).
  //    Se mantiene en el bundle local.
  // { name: 'nuqs',               url: 'https://esm.sh/nuqs@2.8.9?bundle&external=react' },
  // { name: 'nuqs/adapters/react-router/v6', url: '...' },
];

// Especificadores que los módulos CDN declaran como ?external y que el
// bundle local provee. El nombre del chunk (valor) se usa para localizar
// el archivo generado en transformIndexHtml e inyectar su URL local.
const LOCAL_REACT_SPECIFIERS: Record<string, string> = {
  'react':                 'vendor-react',
  'react/jsx-runtime':     'vendor-react-jsx',
  'react/jsx-dev-runtime': 'vendor-react-jsx',
  'react-dom':             'vendor-react-dom',
  'react-dom/client':      'vendor-react-dom-client',
};

function externalizePlugin(): Plugin {
  return {
    name: 'externalize-importmap',
    enforce: 'pre',

    config(_config, { command }) {
      if (command !== 'build') return;

      return {
        build: {
          rollupOptions: {
            external: EXTERNALS.map(e => e.name),
            output: {
              // React y react-dom se dividen en chunks nombrados para poder
              // referenciarlos en el import map con su URL local definitiva.
              // Así los módulos CDN con ?external=react,react-dom obtienen
              // la misma instancia que el bundle de la aplicación.
              manualChunks(id: string) {
                if (!id.includes('/node_modules/')) return;
                const pkg = id.split('/node_modules/')[1].split('/')[0];

                if (pkg === 'react') {
                  return id.includes('jsx') ? 'vendor-react-jsx' : 'vendor-react';
                }
                if (pkg === 'react-dom') {
                  return id.includes('client') ? 'vendor-react-dom-client' : 'vendor-react-dom';
                }
              },
            },
          },
        },
      };
    },

    transformIndexHtml: {
      order: 'post' as const,
      handler(html, { bundle }) {
        if (!bundle) return html;

        // Construir entradas locales del import map a partir de los chunks
        // generados por Rolldown para react y react-dom.
        const localImports: Record<string, string> = {};
        for (const [fileName, chunk] of Object.entries(bundle)) {
          if (chunk.type !== 'chunk') continue;
          for (const [specifier, chunkName] of Object.entries(LOCAL_REACT_SPECIFIERS)) {
            if (chunk.name === chunkName && !(specifier in localImports)) {
              localImports[specifier] = `/${fileName}`;
            }
          }
        }

        const cdnImports: Record<string, string> = Object.fromEntries(
          EXTERNALS.map(e => [e.name, e.url])
        );
        // Prefix mapping para sub-paths de shiki (e.g. shiki/themes/nord).
        // No puede llevar ?target porque la URL actúa como prefijo.
        cdnImports['shiki/'] = 'https://esm.sh/shiki@3.19.0/';

        const importMap = { imports: { ...localImports, ...cdnImports } };

        // Preconnect: reduce el RTT del primer request a esm.sh
        const preconnect = `<link rel="preconnect" href="https://esm.sh" crossorigin>`;
        const importMapScript = `<script type="importmap">\n${JSON.stringify(importMap, null, 2)}\n</script>`;

        return html.replace('</head>', `  ${preconnect}\n  ${importMapScript}\n</head>`);
      },
    },
  };
}

export default defineConfig({
  plugins: [
    externalizePlugin(),
    react(),
  ],
  build: {
    target: 'ES2020',
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3005'
    }
  }
});
