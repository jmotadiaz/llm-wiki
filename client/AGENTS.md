# Agent Guide — LLM Wiki Client

## Deployment Context

This client is deployed on a **Raspberry Pi** with very limited resources. Build time and bundle size are critical constraints. To minimize the bundler's work, we adopt an **externalization approach via import maps** (`esm.sh`) for as many dependencies as possible.

## Golden Rule When Adding Dependencies

> **ALWAYS try to externalize a new dependency via `esm.sh` + import map before including it in the local bundle.**
>
> Only if externalization is not viable (404 runtime errors, duplicate React instances, or esm.sh instability) should the dependency be bundled locally.

## Procedure for Adding a Dependency

1. **Check availability on esm.sh**
   ```bash
   curl -sI "https://esm.sh/<package>@<version>?bundle&external=react,react-dom"
   ```
   It must return HTTP 200. If it returns 404, the package is not externalizable.

2. **Add to the import map**
   Edit `vite.config.ts` and add an entry to the `EXTERNALS` array:
   ```ts
   { name: '<package>', url: 'https://esm.sh/<package>@<version>?bundle&external=react,react-dom' }
   ```
   - Use `?bundle` to prevent esm.sh from exploding the library into dozens of sub-requests.
   - Use `?external=react,react-dom` (or other peer deps) to avoid duplicate module instances.

3. **Build and runtime verification**
   ```bash
   cd client && npm run build
   ```
   Then serve `dist/` and load it with headless Chromium to detect errors:
   ```bash
   chromium --headless=new --no-sandbox --virtual-time-budget=20000 \
     --enable-logging=stderr http://localhost:4173
   ```
   Specifically watch for:
   - `404` on submodules (e.g. `/engine-javascript.hzpS1_41`)
   - `TypeError: Failed to resolve module specifier`
   - `Uncaught Error: useNavigate() may be used only in the context of a <Router>` (signals a duplicate React instance)
   - `ReferenceError` / `SyntaxError`

4. **If it fails → keep it local**
   If runtime verification fails, **do not** externalize. Include it in the bundle and document the failure reason in `vite.config.ts` (see existing examples).

## Lessons Learned (Real Examples)

### ✅ Successfully Externalized

| Package | Valid Configuration |
|---------|---------------------|
| `streamdown` | `?bundle&external=react,react-dom` |
| `@streamdown/code` | `?external=shiki` (❌ `?bundle` fails because esm.sh generates hashed internal imports that return 404) |
| `shiki` | No `?bundle` + map subpath `shiki/engine/javascript` + `shiki/` prefix mapping in the import map |
| `remark-gfm` | `?bundle` |
| `react-force-graph-2d` | `?bundle&external=react,react-dom` (acceptable because `/graph` is not the landing page; generates ~80 d3 sub-requests) |
| `ai`, `@ai-sdk/react` | `?bundle&external=react` / `?bundle&external=react,react-dom` |

### ❌ Must Stay in Local Bundle

| Package | Rejection Reason |
|---------|-----------------|
| `nuqs` | Even with `?external=react`, esm.sh bundles across the dependency graph end up creating **duplicate React instances** at runtime. The `nuqs/adapters/react-router/v6` adapter (and its transitive dependencies) resolve React through different esm.sh URLs than the main `react` import-map entry. This breaks the single React instance requirement, causing `useNavigate()` to fail because the `Router` context lives in a different React instance. There is no reliable `?external` combination that fixes this for the whole bundle graph. |

## Conscious Trade-off

Externalizing means more HTTP requests at runtime and a hard dependency on `esm.sh`. On a Raspberry Pi this is preferable to a 30+ second build and ~1 MB bundles. If a library is critical for first paint (landing page), evaluate whether the network cost is worth it.

## Technical Reference

The externalization logic lives in **`client/vite.config.ts`** (`externalizePlugin`). The `EXTERNALS` array and the injected import map are the source of truth.
