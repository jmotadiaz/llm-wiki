---
name: No npm overrides hack
description: Never use npm overrides to fix dependency conflicts — resolve by aligning actual package versions
type: feedback
---

Never use `overrides` in package.json to fix dependency version conflicts. Instead, align the actual package versions so they are naturally compatible (e.g., if two packages need the same transitive dependency, pick versions of both packages that agree on the same version range).

**Why:** The user considers overrides a hack, not a real fix. It masks the underlying incompatibility rather than solving it.

**How to apply:** When there's a version conflict (e.g., esbuild binary mismatch), trace the dependency tree (`npm ls <pkg>`), find which packages bring conflicting versions, and update the packages themselves to versions that naturally align.
