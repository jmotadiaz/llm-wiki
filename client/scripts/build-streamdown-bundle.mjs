/**
 * ════════════════════════════════════════════════════════════
 * ⚠️  OBSOLETO  —  Reemplazado por el plugin de Vite
 *
 * El plugin streamdown-sidecar (client/plugins/streamdown-sidecar.ts)
 * genera este bundle automáticamente durante `vite build`, cacheado en
 * node_modules/.cache/streamdown-sidecar/.
 *
 * Este script se mantiene por si se necesita regenerar el sidecar
 * manualmente (p. ej., para depuración o desarrollo local sin build).
 * ════════════════════════════════════════════════════════════
 *
 * Prebuild streamdown + @streamdown/code + @streamdown/mermaid into a single
 * self-contained ESM file: client/public/vendor/streamdown.mjs.
 *
 * Why a sidecar?
 *   streamdown@2.5.x lazy-loads its Mermaid renderer via
 *     import('./mermaid-GHXKKRXX.js')
 *   When streamdown is served from esm.sh, that dynamic import resolves to a
 *   separately-bundled chunk. The separate chunk contains its OWN copy of
 *   streamdown's `createContext(Ve)` call, so React ends up with two distinct
 *   `Ve` instances. The outer code component sees `plugins.mermaid` via the
 *   first Ve, but the lazy-loaded Mermaid renderer reads the second Ve which
 *   has no provider — producing the persistent error
 *     "Mermaid plugin not available. Please add the mermaid plugin..."
 *
 *   Bundling streamdown into one file inlines the dynamic chunk, leaving a
 *   single createContext call and therefore a single Ve.
 *
 * Why not just bundle streamdown locally with Vite/Rolldown?
 *   It works, but pulls marked/rehype-*/hast-* into the per-build graph and
 *   slows down `npm run build` on the Pi. A sidecar lets us pay the cost ONCE
 *   (whenever we upgrade streamdown) and ship a stable ~500 KB module that
 *   Rolldown treats as external on every build.
 *
 * Usage:
 *   cd client && node scripts/build-streamdown-bundle.mjs
 *
 * Commit the resulting public/vendor/streamdown.mjs alongside the script
 * changes so the Pi build never has to regenerate it.
 */
import * as esbuild from 'esbuild';
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdtempSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:url';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url).replace(/\/[^/]+$/, '/'));
const CLIENT_DIR = fileURLToPath(new URL('..', import.meta.url));
const OUT_FILE = join(CLIENT_DIR, 'public', 'vendor', 'streamdown.mjs');

// Pin to the versions that the rest of the client is built against. Bump
// these in lockstep with client/package.json when upgrading.
const VERSIONS = {
  streamdown: '2.5.0',
  '@streamdown/code': '1.1.1',
  '@streamdown/mermaid': '1.0.2',
};

const work = mkdtempSync(join(tmpdir(), 'sd-bundle-'));
process.on('exit', () => rmSync(work, { recursive: true, force: true }));

writeFileSync(
  join(work, 'package.json'),
  JSON.stringify({ name: 'sd-bundle', private: true, type: 'module' }, null, 2),
);
writeFileSync(join(work, 'empty-stub.mjs'), 'export default {};\n');

const installSpec = Object.entries(VERSIONS)
  .map(([name, v]) => `${name}@${v}`)
  .join(' ');
console.log(`▸ installing ${installSpec} in ${work}`);
const { execSync } = await import('node:child_process');
execSync(`npm install --silent --no-audit --no-fund ${installSpec}`, {
  cwd: work,
  stdio: 'inherit',
});

const entry = join(work, 'entry.mjs');
writeFileSync(
  entry,
  [
    "export * from 'streamdown';",
    "export { code } from '@streamdown/code';",
    "export { mermaid, createMermaidPlugin } from '@streamdown/mermaid';",
    '',
  ].join('\n'),
);

// react / react-dom / shiki / mermaid se resuelven en runtime vía el import
// map ya existente. Mantenemos shiki y mermaid externos porque son pesados
// y ya hacen lazy-loading por idioma/diagrama.
const EXTERNAL = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'shiki',
  'shiki/*',
  '@shikijs/*',
  'mermaid',
];

mkdirSync(dirname(OUT_FILE), { recursive: true });
await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  platform: 'browser',
  splitting: false,
  outfile: OUT_FILE,
  external: EXTERNAL,
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  alias: {
    // Mermaid's Node-only deps (used only by the language-server parser path
    // which we never hit in the browser). Aliased to an empty stub so esbuild
    // doesn't try to walk them.
    'vscode-jsonrpc': join(work, 'empty-stub.mjs'),
    langium: join(work, 'empty-stub.mjs'),
  },
});

const size = readFileSync(OUT_FILE).length;
console.log(`✔ ${OUT_FILE}`);
console.log(`  ${(size / 1024).toFixed(1)} KB`);
console.log(`  external: ${EXTERNAL.join(', ')}`);
