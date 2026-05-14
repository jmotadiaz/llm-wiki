/**
 * Vite plugin: streamdown-sidecar
 *
 * Replaces the manual scripts/build-streamdown-bundle.mjs.
 * Automatically builds and caches a self-contained ESM bundle of
 * streamdown + @streamdown/code + @streamdown/mermaid.
 *
 * ── How it works ──
 *  1. Computes a hash from the installed versions of the three packages.
 *  2. Cache: node_modules/.cache/streamdown-sidecar/streamdown-<hash>.mjs
 *  3. On buildStart(): if cache exists → reuse. If not → run esbuild + cache.
 *  4. Emits the cached file as dist/vendor/streamdown.mjs during the build.
 *
 * ── Why a sidecar? ──
 *  streamdown@2.5.x lazy-loads its Mermaid renderer via a dynamic import.
 *  When served via esm.sh, that chunk duplicates streamdown's createContext(Ve)
 *  so the Mermaid plugin sees a different React context. Bundling everything
 *  into one file inlines the dynamic chunk → single Ve → no error.
 *
 * ── Dev mode ──
 *  No changes: Vite resolves streamdown directly from node_modules, which
 *  doesn't trigger the esm.sh chunk-splitting bug.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import * as esbuild from 'esbuild';
import type { Plugin, ResolvedConfig } from 'vite';

// ── Constants ──

const CACHE_DIR = 'node_modules/.cache/streamdown-sidecar';
const VENDOR_ASSET_FILE = 'vendor/streamdown.mjs';

// Versión de @streamdown/mermaid cuando no está instalado en node_modules
// (el package no está declarado en package.json para evitar arrastrar mermaid
//  y sus ~50 dependencias transitivas al build host).
// Se actualiza manualmente en sincronía con la versión de streamdown.
const FALLBACK_MERMAID_VERSION = '1.0.2';

// Paquetes que streamdown necesita en runtime (bajados via import map en
// index.html). Mantenerlos externos evita duplicar código en el sidecar.
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

// ── Helpers ──

/**
 * Lee la versión instalada de un paquete desde node_modules,
 * ascendiendo desde el directorio de trabajo actual.
 */
function readInstalledVersion(pkgName: string): string | null {
  try {
    let dir = process.cwd();
    while (true) {
      const pkgPath = join(dir, 'node_modules', pkgName, 'package.json');
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        return pkg.version ?? null;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  } catch {
    return null;
  }
}

/** Calcula el cache key a partir de las versiones instaladas. */
function computeCacheKey(): string {
  const streamdownVer = readInstalledVersion('streamdown') ?? 'unknown';
  const codeVer = readInstalledVersion('@streamdown/code') ?? 'unknown';
  const mermaidVer = readInstalledVersion('@streamdown/mermaid') ?? FALLBACK_MERMAID_VERSION;

  const hash = createHash('sha256')
    .update(`streamdown:${streamdownVer}|@streamdown/code:${codeVer}|@streamdown/mermaid:${mermaidVer}`)
    .digest('hex')
    .slice(0, 16);

  return hash;
}

/** Ruta absoluta al archivo de cache para un cache key dado. */
function cacheFilePath(cacheKey: string): string {
  return join(process.cwd(), CACHE_DIR, `streamdown-${cacheKey}.mjs`);
}

/**
 * Construye el bundle con esbuild.
 *
 * Replica la lógica de scripts/build-streamdown-bundle.mjs:
 *  1. Crea un directorio temporal
 *  2. Instala los tres paquetes con npm
 *  3. Escribe el entry point
 *  4. Ejecuta esbuild.bundle()
 *  5. Escribe el resultado en cacheFile
 */
async function buildBundle(cacheFile: string, cacheKey: string): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), `sd-bundle-${cacheKey}-`));

  const cleanup = () => {
    try { rmSync(work, { recursive: true, force: true }); } catch { /* ignore */ }
  };
  process.on('exit', cleanup);

  try {
    // 1. Temp project skeleton
    writeFileSync(
      join(work, 'package.json'),
      JSON.stringify({ name: 'sd-bundle', private: true, type: 'module' }, null, 2),
    );
    writeFileSync(join(work, 'empty-stub.mjs'), 'export default {};\n');

    // 2. Detect versions (fresh read to guarantee consistency with cache key)
    const streamdownVer = readInstalledVersion('streamdown');
    const codeVer = readInstalledVersion('@streamdown/code');
    const mermaidVer = readInstalledVersion('@streamdown/mermaid');

    if (!streamdownVer) {
      throw new Error(
        'streamdown-sidecar: streamdown package not found in node_modules. ' +
        'Make sure it is listed in package.json and `npm install` has been run.',
      );
    }
    if (!codeVer) {
      throw new Error(
        'streamdown-sidecar: @streamdown/code package not found in node_modules. ' +
        'Make sure it is listed in package.json and `npm install` has been run.',
      );
    }

    const mermaidSpec = mermaidVer
      ? `@streamdown/mermaid@${mermaidVer}`
      : `@streamdown/mermaid@${FALLBACK_MERMAID_VERSION}`;

    const installSpec = `streamdown@${streamdownVer} @streamdown/code@${codeVer} ${mermaidSpec}`;

    console.log(`\n▸ streamdown-sidecar: cache miss, building bundle...`);
    console.log(`  installing: ${installSpec}`);
    execSync(`npm install --silent --no-audit --no-fund ${installSpec}`, {
      cwd: work,
      stdio: 'inherit',
      timeout: 180_000,
    });

    // 3. Entry file (re-exporta todo lo que el client necesita)
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

    // 4. esbuild bundle
    console.log(`  bundling with esbuild...`);
    mkdirSync(dirname(cacheFile), { recursive: true });
    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      target: 'es2020',
      platform: 'browser',
      splitting: false,
      outfile: cacheFile,
      external: EXTERNAL,
      minify: true,
      sourcemap: false,
      legalComments: 'none',
      alias: {
        // Mermaid's Node-only deps (used only by its language-server parser
        // path, never hit in the browser). Aliased to an empty stub so esbuild
        // doesn't try to walk them.
        'vscode-jsonrpc': join(work, 'empty-stub.mjs'),
        langium: join(work, 'empty-stub.mjs'),
      },
    });

    const size = readFileSync(cacheFile).length;
    console.log(`✔ streamdown-sidecar: cached`);
    console.log(`  ${relative(process.cwd(), cacheFile)}`);
    console.log(`  ${(size / 1024).toFixed(1)} KB`);
    console.log(`  external: ${EXTERNAL.join(', ')}\n`);
  } catch (err) {
    // Ensure cleanup even on error
    cleanup();
    throw err;
  }
}

// ── Plugin ──

export default function streamdownSidecarPlugin(): Plugin {
  let config: ResolvedConfig;

  return {
    name: 'streamdown-sidecar',

    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    async buildStart() {
      // Solo durante build, no en dev (Vite resuelve directo desde node_modules)
      if (config.command !== 'build') return;

      const cacheKey = computeCacheKey();
      const cacheFile = cacheFilePath(cacheKey);
      const cacheRel = relative(process.cwd(), cacheFile);

      // Cache hit → usar el archivo existente
      if (existsSync(cacheFile)) {
        console.log(`\n▸ streamdown-sidecar: cache hit (${cacheRel})`);
      } else {
        // Cache miss → construir y cachear
        await buildBundle(cacheFile, cacheKey);
      }

      // Emitir el bundle como asset en dist/vendor/streamdown.mjs
      const source = readFileSync(cacheFile, 'utf-8');
      this.emitFile({
        type: 'asset',
        fileName: VENDOR_ASSET_FILE,
        source,
      });
    },
  };
}
