# Dependency Drift Tracker — Design Spec

**Date:** 2026-03-28
**Status:** Approved

## Overview

A new `/dependencies` page in the PR viewer that monitors version drift for a configured set of dependencies across all repos in the GitHub org. Drift is defined as a repo pinning an older version than the latest published version in the package registry. The feature is generic — each package ecosystem (npm, PyPI, etc.) is handled by a small adapter module with a shared interface.

---

## Architecture

### New files

```
src/
  services/
    dependencies/
      index.js          — orchestrator: discovers repos, fetches manifests, builds drift matrix
      adapters/
        npm.js          — reads package.json, hits registry.npmjs.org
        pypi.js         — reads requirements.txt, hits pypi.org/pypi/{pkg}/json
  routes/
    dependencies.js     — GET /dependencies
  views/
    dependencies.html
```

### Adapter interface

Each adapter exports three named exports:

```js
export const manifestFile = 'package.json'  // path in repo to fetch from GitHub

export function extractVersion(fileContent, packageName) {
  // parse the manifest string, return pinned version string or null if absent
}

export async function fetchLatestVersion(packageName) {
  // hit the public registry, return latest version string
}
```

The orchestrator selects an adapter by the ecosystem key prefix in `TRACKED_DEPENDENCIES` (e.g. `npm` → `adapters/npm.js`).

### Orchestrator flow (`services/dependencies/index.js`)

1. **Discover repos** — fetch all org repos via GitHub API (same token, same pattern as PR fetching)
2. **Determine which adapters apply** — group tracked dependencies by ecosystem key
3. **Fetch manifests** — for each repo × adapter combination, fetch the manifest file via GitHub raw content API; results stored in shared cache under key `dep:manifest:{org}/{repo}/{file}`
4. **Extract pinned versions** — call `adapter.extractVersion(content, packageName)` per package
5. **Fetch latest versions** — call `adapter.fetchLatestVersion(packageName)` once per package; stored in shared cache under key `dep:latest:{ecosystem}:{package}`
6. **Build drift matrix** — return `{ repo, package, ecosystem, pinned, latest, isDrift }[]`

### Configuration

```
TRACKED_DEPENDENCIES=npm:govuk-frontend,npm:hapi,npm:pino
```

Each entry is `{ecosystem}:{packageName}`. The env var is optional — if unset or empty, the `/dependencies` page renders an informational message rather than an empty table.

### Caching

Both manifest content and latest registry versions are stored in the shared in-memory cache (same TTL, same manual `/refresh` bust as PR data). Cache keys are namespaced to avoid collisions with PR cache entries.

---

## Route & View

### Route: `GET /dependencies`

Same shape as existing routes. Calls the orchestrator, receives the drift matrix, passes it to the view. Errors surface through the existing error plugin.

A nav entry is added to `layout.html` with an `app-badge` showing the count of drifted repos (omitted or grey if zero).

### View: `dependencies.html`

Extends `layout.html`, uses existing `app-*` CSS classes throughout — no new design system dependencies.

- **Status banner** — `app-alert app-alert--success` if no drift, `app-alert app-alert--warning` if drift detected (e.g. *"2 packages have drift across 3 repos"*)
- **Table** — repos as rows, tracked packages as columns
  - Cell shows pinned version; drifted cells use a class (e.g. `app-dep--drift`) and display the latest version alongside
  - `—` for packages not present in the repo's manifest
  - Cached-at timestamp matching other views

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Manifest file absent (404) | Treat as `—` (package absent), not an error |
| Registry fetch fails | Render cell as `—` with latest = `unknown`; log warning via pino |
| GitHub API error fetching manifest (non-404) | Render cell as `—`; surface via title attribute |
| `TRACKED_DEPENDENCIES` unset/empty | Render informational message instead of table |

---

## Testing

**Adapter unit tests** (one file per adapter):
- `extractVersion` tested with real fixture strings (sample `package.json`, `requirements.txt`)
- `fetchLatestVersion` tested with mocked `fetch`
- Cases: package present, package absent, malformed manifest

**Orchestrator unit tests**:
- Mock GitHub API calls and adapter modules
- Verify drift matrix shape: correct `isDrift` flag, `—` for absent packages, `unknown` for failed registry lookups

**Route integration test**:
- Mock the orchestrator
- Verify route renders without error and passes correct data to view

No Nunjucks template tests (consistent with existing approach).
