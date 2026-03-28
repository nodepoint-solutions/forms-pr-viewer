# Dependency Drift Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/dependencies` page that shows whether tracked packages are on their latest version across all team repos, using a per-ecosystem adapter pattern so new package managers can be added as single files.

**Architecture:** An orchestrator at `src/services/dependencies/index.js` fetches team repos and manifest files from GitHub, calls per-ecosystem adapter modules to extract pinned versions and fetch latest versions from registries, and builds a drift matrix. A separate `dep-cache.js` provides keyed TTL caching for both manifest content and registry responses, cleared on `/refresh` alongside the existing PR cache.

**Tech Stack:** Node.js ES modules, Hapi.js, Nunjucks, native `fetch`, Jest with `jest.unstable_mockModule` for ESM mocking.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/config.js` | Modify | Add `TRACKED_DEPENDENCIES` env var parsing |
| `src/services/github.js` | Modify | Add `fetchFile` for single-file content fetches |
| `src/services/dep-cache.js` | Create | Keyed in-memory cache for manifest + registry data |
| `src/services/dependencies/adapters/npm.js` | Create | npm adapter: `package.json` + registry.npmjs.org |
| `src/services/dependencies/adapters/pypi.js` | Create | PyPI adapter: `requirements.txt` + pypi.org |
| `src/services/dependencies/index.js` | Create | Orchestrator: discovers repos, builds drift matrix |
| `src/routes/refresh.js` | Modify | Clear dep cache + add `/dependencies` to ALLOWED |
| `src/routes/dependencies.js` | Create | `GET /dependencies` route handler |
| `src/plugins/router.js` | Modify | Register dependencies route |
| `src/views/layout.html` | Modify | Add Dependencies nav entry |
| `src/views/dependencies.html` | Create | Drift matrix view |
| `src/public/application.css` | Modify | Add dep table CSS classes |
| `test/services/config.test.js` | Modify | Tests for `trackedDependencies` parsing |
| `test/services/github.test.js` | Modify | Tests for `fetchFile` |
| `test/services/dep-cache.test.js` | Create | Tests for keyed cache |
| `test/services/dependencies/adapters/npm.test.js` | Create | Tests for npm adapter |
| `test/services/dependencies/adapters/pypi.test.js` | Create | Tests for pypi adapter |
| `test/services/dependencies/index.test.js` | Create | Tests for orchestrator |
| `test/routes/dependencies.test.js` | Create | Route integration tests |

---

## Task 1: Parse `TRACKED_DEPENDENCIES` in config

**Files:**
- Modify: `src/config.js`
- Modify: `test/services/config.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `test/services/config.test.js`, inside the existing `describe('config', ...)` block:

```js
it('returns empty trackedDependencies when TRACKED_DEPENDENCIES is unset', async () => {
  delete process.env.TRACKED_DEPENDENCIES
  const { config } = await import('../../src/config.js?v=' + Math.random())
  expect(config.trackedDependencies).toEqual([])
})

it('parses TRACKED_DEPENDENCIES into ecosystem/packageName pairs', async () => {
  process.env.TRACKED_DEPENDENCIES = 'npm:govuk-frontend,npm:hapi,pypi:requests'
  const { config } = await import('../../src/config.js?v=' + Math.random())
  expect(config.trackedDependencies).toEqual([
    { ecosystem: 'npm', packageName: 'govuk-frontend' },
    { ecosystem: 'npm', packageName: 'hapi' },
    { ecosystem: 'pypi', packageName: 'requests' },
  ])
})

it('skips malformed entries in TRACKED_DEPENDENCIES', async () => {
  process.env.TRACKED_DEPENDENCIES = 'npm:valid,badentry,npm:also-valid'
  const { config } = await import('../../src/config.js?v=' + Math.random())
  expect(config.trackedDependencies).toEqual([
    { ecosystem: 'npm', packageName: 'valid' },
    { ecosystem: 'npm', packageName: 'also-valid' },
  ])
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --experimental-vm-modules node_modules/.bin/jest test/services/config.test.js --no-coverage
```

Expected: 3 new tests fail with `config.trackedDependencies is not defined` or similar.

- [ ] **Step 3: Implement in `src/config.js`**

Add `TRACKED_DEPENDENCIES = ''` to the destructuring at the top, add the parser function, and add the field to `config`:

```js
const {
  PORT = '3000',
  GITHUB_TOKEN,
  GITHUB_ORG,
  GITHUB_TEAM,
  JIRA_TICKET_PATTERN,
  JIRA_BASE_URL,
  APP_URL,
  CACHE_TTL_MS = '1200000',
  NODE_ENV = 'production',
  SLACK_BOT_TOKEN,
  SLACK_CHANNEL_ID,
  TRACKED_DEPENDENCIES = '',
} = process.env

if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN environment variable is required')
if (!GITHUB_ORG) throw new Error('GITHUB_ORG environment variable is required')
if (!GITHUB_TEAM) throw new Error('GITHUB_TEAM environment variable is required')

const hasJiraPattern = Boolean(JIRA_TICKET_PATTERN)
const hasJiraUrl = Boolean(JIRA_BASE_URL)
if (hasJiraPattern !== hasJiraUrl) {
  throw new Error('JIRA_TICKET_PATTERN and JIRA_BASE_URL must both be set or both be unset')
}

const jiraEnabled = hasJiraPattern && hasJiraUrl

function parseTrackedDeps(raw) {
  if (!raw.trim()) return []
  return raw.split(',')
    .map((entry) => {
      const trimmed = entry.trim()
      const colon = trimmed.indexOf(':')
      if (colon === -1) return null
      const ecosystem = trimmed.slice(0, colon).trim()
      const packageName = trimmed.slice(colon + 1).trim()
      if (!ecosystem || !packageName) return null
      return { ecosystem, packageName }
    })
    .filter(Boolean)
}

export const config = {
  port: parseInt(PORT, 10),
  githubToken: GITHUB_TOKEN,
  org: GITHUB_ORG,
  team: GITHUB_TEAM,
  jiraEnabled,
  jiraTicketPattern: jiraEnabled ? JIRA_TICKET_PATTERN : null,
  jiraBaseUrl: jiraEnabled ? JIRA_BASE_URL : null,
  appUrl: APP_URL ?? null,
  cacheTtlMs: parseInt(CACHE_TTL_MS, 10),
  isDevelopment: NODE_ENV === 'development',
  slackBotToken: SLACK_BOT_TOKEN ?? null,
  slackChannelId: SLACK_CHANNEL_ID ?? null,
  trackedDependencies: parseTrackedDeps(TRACKED_DEPENDENCIES),
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
node --experimental-vm-modules node_modules/.bin/jest test/services/config.test.js --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/config.js test/services/config.test.js
git commit -m "feat: add TRACKED_DEPENDENCIES config parsing"
```

---

## Task 2: Add `fetchFile` to `github.js`

**Files:**
- Modify: `src/services/github.js`
- Modify: `test/services/github.test.js`

- [ ] **Step 1: Write the failing tests**

Add a new `describe('fetchFile', ...)` block at the end of `test/services/github.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { getNextPage, fetchAllPages, fetchWithRetry, fetchFile } from '../../src/services/github.js'
```

(Update the import at the top of the file to include `fetchFile`, then add):

```js
describe('fetchFile', () => {
  let mockFetch

  beforeEach(() => {
    mockFetch = jest.fn()
    global.fetch = mockFetch
  })

  afterEach(() => {
    delete global.fetch
  })

  it('returns decoded file content when the file exists', async () => {
    const content = 'hello world'
    const encoded = Buffer.from(content).toString('base64')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ content: encoded }),
    })
    const result = await fetchFile('/repos/org/repo/contents/package.json', 'token')
    expect(result).toBe('hello world')
  })

  it('returns null when the file does not exist (404)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
    const result = await fetchFile('/repos/org/repo/contents/package.json', 'token')
    expect(result).toBeNull()
  })

  it('throws on non-404 error responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ message: 'Server error' }),
    })
    await expect(fetchFile('/repos/org/repo/contents/package.json', 'token')).rejects.toThrow('GitHub API error 500')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --experimental-vm-modules node_modules/.bin/jest test/services/github.test.js --no-coverage
```

Expected: 3 new tests fail with `fetchFile is not a function`.

- [ ] **Step 3: Implement `fetchFile` in `src/services/github.js`**

Add at the end of the file:

```js
export async function fetchFile(path, token) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: HEADERS(token) })
  if (res.status === 404) return null
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`GitHub API error ${res.status} on ${path}: ${body.message ?? res.statusText}`)
  }
  const data = await res.json()
  return Buffer.from(data.content, 'base64').toString('utf-8')
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
node --experimental-vm-modules node_modules/.bin/jest test/services/github.test.js --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/github.js test/services/github.test.js
git commit -m "feat: add fetchFile helper to github service"
```

---

## Task 3: Create `dep-cache.js`

**Files:**
- Create: `src/services/dep-cache.js`
- Create: `test/services/dep-cache.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/services/dep-cache.test.js`:

```js
import { describe, it, expect, beforeEach } from '@jest/globals'
import * as depCache from '../../src/services/dep-cache.js'

describe('dep-cache', () => {
  beforeEach(() => {
    depCache.clear()
  })

  it('returns null for an unknown key', () => {
    expect(depCache.get('missing')).toBeNull()
  })

  it('stores and retrieves a value', () => {
    depCache.set('key', '1.2.3')
    expect(depCache.get('key')).toBe('1.2.3')
  })

  it('stores null values', () => {
    depCache.set('key', null)
    expect(depCache.get('key')).toBeNull()
  })

  it('marks an unknown key as expired', () => {
    expect(depCache.isExpired('missing', 60000)).toBe(true)
  })

  it('marks a recently set key as not expired', () => {
    depCache.set('key', 'value')
    expect(depCache.isExpired('key', 60000)).toBe(false)
  })

  it('marks a key as expired when ttl has elapsed', async () => {
    depCache.set('key', 'value')
    // Simulate TTL of 0 — already expired
    expect(depCache.isExpired('key', 0)).toBe(true)
  })

  it('clears all entries', () => {
    depCache.set('a', '1')
    depCache.set('b', '2')
    depCache.clear()
    expect(depCache.get('a')).toBeNull()
    expect(depCache.get('b')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --experimental-vm-modules node_modules/.bin/jest test/services/dep-cache.test.js --no-coverage
```

Expected: all tests fail with module not found.

- [ ] **Step 3: Implement `src/services/dep-cache.js`**

```js
const store = new Map() // key -> { value, storedAt }

export function get(key) {
  return store.get(key)?.value ?? null
}

export function set(key, value) {
  store.set(key, { value, storedAt: Date.now() })
}

export function isExpired(key, ttlMs) {
  const entry = store.get(key)
  if (!entry) return true
  return Date.now() - entry.storedAt > ttlMs
}

export function clear() {
  store.clear()
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
node --experimental-vm-modules node_modules/.bin/jest test/services/dep-cache.test.js --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/dep-cache.js test/services/dep-cache.test.js
git commit -m "feat: add dep-cache keyed in-memory cache"
```

---

## Task 4: Create npm adapter

**Files:**
- Create: `src/services/dependencies/adapters/npm.js`
- Create: `test/services/dependencies/adapters/npm.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/services/dependencies/adapters/npm.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { manifestFile, extractVersion, fetchLatestVersion } from '../../../../src/services/dependencies/adapters/npm.js'

describe('npm adapter', () => {
  describe('manifestFile', () => {
    it('is package.json', () => {
      expect(manifestFile).toBe('package.json')
    })
  })

  describe('extractVersion', () => {
    it('returns version from dependencies', () => {
      const content = JSON.stringify({ dependencies: { hapi: '^21.3.0' } })
      expect(extractVersion(content, 'hapi')).toBe('^21.3.0')
    })

    it('returns version from devDependencies', () => {
      const content = JSON.stringify({ devDependencies: { jest: '^29.0.0' } })
      expect(extractVersion(content, 'jest')).toBe('^29.0.0')
    })

    it('prefers dependencies over devDependencies', () => {
      const content = JSON.stringify({
        dependencies: { pkg: '1.0.0' },
        devDependencies: { pkg: '2.0.0' },
      })
      expect(extractVersion(content, 'pkg')).toBe('1.0.0')
    })

    it('returns null when package is absent', () => {
      const content = JSON.stringify({ dependencies: { other: '1.0.0' } })
      expect(extractVersion(content, 'missing')).toBeNull()
    })

    it('returns null for malformed JSON', () => {
      expect(extractVersion('not json', 'pkg')).toBeNull()
    })

    it('returns null when no dependencies key exists', () => {
      const content = JSON.stringify({ name: 'my-app' })
      expect(extractVersion(content, 'pkg')).toBeNull()
    })
  })

  describe('fetchLatestVersion', () => {
    let mockFetch

    beforeEach(() => {
      mockFetch = jest.fn()
      global.fetch = mockFetch
    })

    afterEach(() => {
      delete global.fetch
    })

    it('returns the latest version from the npm registry', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '5.3.0' }),
      })
      const result = await fetchLatestVersion('govuk-frontend')
      expect(result).toBe('5.3.0')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://registry.npmjs.org/govuk-frontend/latest'
      )
    })

    it('throws when the registry returns a non-ok status', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
      await expect(fetchLatestVersion('nonexistent')).rejects.toThrow('npm registry error 404')
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --experimental-vm-modules node_modules/.bin/jest test/services/dependencies/adapters/npm.test.js --no-coverage
```

Expected: all tests fail with module not found.

- [ ] **Step 3: Create `src/services/dependencies/adapters/npm.js`**

```js
export const manifestFile = 'package.json'

export function extractVersion(fileContent, packageName) {
  let parsed
  try {
    parsed = JSON.parse(fileContent)
  } catch {
    return null
  }
  return parsed.dependencies?.[packageName] ?? parsed.devDependencies?.[packageName] ?? null
}

export async function fetchLatestVersion(packageName) {
  const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`)
  if (!res.ok) throw new Error(`npm registry error ${res.status} for ${packageName}`)
  const data = await res.json()
  return data.version
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
node --experimental-vm-modules node_modules/.bin/jest test/services/dependencies/adapters/npm.test.js --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/dependencies/adapters/npm.js test/services/dependencies/adapters/npm.test.js
git commit -m "feat: add npm dependency adapter"
```

---

## Task 5: Create PyPI adapter

**Files:**
- Create: `src/services/dependencies/adapters/pypi.js`
- Create: `test/services/dependencies/adapters/pypi.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/services/dependencies/adapters/pypi.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { manifestFile, extractVersion, fetchLatestVersion } from '../../../../src/services/dependencies/adapters/pypi.js'

describe('pypi adapter', () => {
  describe('manifestFile', () => {
    it('is requirements.txt', () => {
      expect(manifestFile).toBe('requirements.txt')
    })
  })

  describe('extractVersion', () => {
    it('extracts version from exact pin (==)', () => {
      const content = 'requests==2.28.0\nnumpy==1.24.0\n'
      expect(extractVersion(content, 'requests')).toBe('2.28.0')
    })

    it('extracts version from >= constraint', () => {
      const content = 'requests>=2.28.0\n'
      expect(extractVersion(content, 'requests')).toBe('2.28.0')
    })

    it('is case-insensitive for package name', () => {
      const content = 'Requests==2.28.0\n'
      expect(extractVersion(content, 'requests')).toBe('2.28.0')
    })

    it('ignores comment lines', () => {
      const content = '# requests==1.0.0\nrequests==2.28.0\n'
      expect(extractVersion(content, 'requests')).toBe('2.28.0')
    })

    it('ignores inline comments', () => {
      const content = 'requests==2.28.0 # keep pinned\n'
      expect(extractVersion(content, 'requests')).toBe('2.28.0')
    })

    it('returns null when package is absent', () => {
      const content = 'numpy==1.24.0\n'
      expect(extractVersion(content, 'requests')).toBeNull()
    })

    it('returns null for empty content', () => {
      expect(extractVersion('', 'requests')).toBeNull()
    })
  })

  describe('fetchLatestVersion', () => {
    let mockFetch

    beforeEach(() => {
      mockFetch = jest.fn()
      global.fetch = mockFetch
    })

    afterEach(() => {
      delete global.fetch
    })

    it('returns the latest version from PyPI', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ info: { version: '2.31.0' } }),
      })
      const result = await fetchLatestVersion('requests')
      expect(result).toBe('2.31.0')
      expect(mockFetch).toHaveBeenCalledWith('https://pypi.org/pypi/requests/json')
    })

    it('throws when PyPI returns a non-ok status', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
      await expect(fetchLatestVersion('nonexistent')).rejects.toThrow('PyPI registry error 404')
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --experimental-vm-modules node_modules/.bin/jest test/services/dependencies/adapters/pypi.test.js --no-coverage
```

Expected: all tests fail with module not found.

- [ ] **Step 3: Create `src/services/dependencies/adapters/pypi.js`**

```js
export const manifestFile = 'requirements.txt'

export function extractVersion(fileContent, packageName) {
  const lines = fileContent.split('\n')
  const pattern = new RegExp(`^${packageName}[=<>!~]+(.+)$`, 'i')
  for (const line of lines) {
    const trimmed = line.split('#')[0].trim()
    const match = trimmed.match(pattern)
    if (match) return match[1].trim()
  }
  return null
}

export async function fetchLatestVersion(packageName) {
  const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`)
  if (!res.ok) throw new Error(`PyPI registry error ${res.status} for ${packageName}`)
  const data = await res.json()
  return data.info.version
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
node --experimental-vm-modules node_modules/.bin/jest test/services/dependencies/adapters/pypi.test.js --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/dependencies/adapters/pypi.js test/services/dependencies/adapters/pypi.test.js
git commit -m "feat: add pypi dependency adapter"
```

---

## Task 6: Create dependencies orchestrator

**Files:**
- Create: `src/services/dependencies/index.js`
- Create: `test/services/dependencies/index.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/services/dependencies/index.test.js`:

```js
import { jest, describe, it, expect, beforeEach } from '@jest/globals'

jest.unstable_mockModule('../../../src/config.js', () => ({
  config: {
    org: 'test-org',
    team: 'test-team',
    githubToken: 'test-token',
    cacheTtlMs: 300000,
    trackedDependencies: [
      { ecosystem: 'npm', packageName: 'hapi' },
    ],
  },
}))

const mockFetchAllPages = jest.fn()
const mockFetchFile = jest.fn()

jest.unstable_mockModule('../../../src/services/github.js', () => ({
  fetchAllPages: mockFetchAllPages,
  fetchFile: mockFetchFile,
}))

const mockDepCache = {
  get: jest.fn().mockReturnValue(null),
  set: jest.fn(),
  isExpired: jest.fn().mockReturnValue(true),
  clear: jest.fn(),
}

jest.unstable_mockModule('../../../src/services/dep-cache.js', () => mockDepCache)

const mockNpmAdapter = {
  manifestFile: 'package.json',
  extractVersion: jest.fn(),
  fetchLatestVersion: jest.fn(),
}

jest.unstable_mockModule('../../../src/services/dependencies/adapters/npm.js', () => mockNpmAdapter)

const { getDependencies } = await import('../../../src/services/dependencies/index.js')

describe('getDependencies', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDepCache.isExpired.mockReturnValue(true)
    mockDepCache.get.mockReturnValue(null)
  })

  it('returns empty result when trackedDependencies is empty', async () => {
    // Override config for this test only via the mock
    const { config } = await import('../../../src/config.js')
    config.trackedDependencies = []

    const result = await getDependencies()
    expect(result.rows).toEqual([])
    expect(result.trackedDependencies).toEqual([])
    expect(result.driftCount).toBe(0)

    // restore
    config.trackedDependencies = [{ ecosystem: 'npm', packageName: 'hapi' }]
  })

  it('marks a package as drifted when pinned !== latest', async () => {
    mockFetchAllPages.mockResolvedValueOnce([{ name: 'forms-api' }])
    mockNpmAdapter.fetchLatestVersion.mockResolvedValueOnce('22.0.0')
    mockFetchFile.mockResolvedValueOnce(JSON.stringify({ dependencies: { hapi: '^21.3.0' } }))
    mockNpmAdapter.extractVersion.mockReturnValueOnce('^21.3.0')

    const result = await getDependencies()
    expect(result.driftCount).toBe(1)
    expect(result.rows[0].deps['npm:hapi'].isDrift).toBe(true)
    expect(result.rows[0].deps['npm:hapi'].pinned).toBe('^21.3.0')
    expect(result.rows[0].deps['npm:hapi'].latest).toBe('22.0.0')
  })

  it('marks a package as not drifted when pinned === latest', async () => {
    mockFetchAllPages.mockResolvedValueOnce([{ name: 'forms-api' }])
    mockNpmAdapter.fetchLatestVersion.mockResolvedValueOnce('21.3.0')
    mockFetchFile.mockResolvedValueOnce(JSON.stringify({ dependencies: { hapi: '21.3.0' } }))
    mockNpmAdapter.extractVersion.mockReturnValueOnce('21.3.0')

    const result = await getDependencies()
    expect(result.driftCount).toBe(0)
    expect(result.rows[0].deps['npm:hapi'].isDrift).toBe(false)
  })

  it('sets pinned to null when manifest is absent (404)', async () => {
    mockFetchAllPages.mockResolvedValueOnce([{ name: 'forms-api' }])
    mockNpmAdapter.fetchLatestVersion.mockResolvedValueOnce('21.3.0')
    mockFetchFile.mockResolvedValueOnce(null)
    mockNpmAdapter.extractVersion.mockReturnValueOnce(null)

    const result = await getDependencies()
    expect(result.rows[0].deps['npm:hapi'].pinned).toBeNull()
    expect(result.rows[0].deps['npm:hapi'].isDrift).toBe(false)
  })

  it('sets latest to null when registry fetch fails', async () => {
    mockFetchAllPages.mockResolvedValueOnce([{ name: 'forms-api' }])
    mockNpmAdapter.fetchLatestVersion.mockRejectedValueOnce(new Error('network error'))
    mockFetchFile.mockResolvedValueOnce(JSON.stringify({ dependencies: { hapi: '21.3.0' } }))
    mockNpmAdapter.extractVersion.mockReturnValueOnce('21.3.0')

    const result = await getDependencies()
    expect(result.rows[0].deps['npm:hapi'].latest).toBeNull()
    expect(result.rows[0].deps['npm:hapi'].isDrift).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --experimental-vm-modules node_modules/.bin/jest test/services/dependencies/index.test.js --no-coverage
```

Expected: all tests fail with module not found.

- [ ] **Step 3: Create `src/services/dependencies/index.js`**

```js
import { config } from '../../config.js'
import * as depCache from '../dep-cache.js'
import { fetchAllPages, fetchFile } from '../github.js'
import * as npmAdapter from './adapters/npm.js'
import * as pypiAdapter from './adapters/pypi.js'

const ADAPTERS = { npm: npmAdapter, pypi: pypiAdapter }

async function getLatestVersion(ecosystem, packageName) {
  const cacheKey = `dep:latest:${ecosystem}:${packageName}`
  if (!depCache.isExpired(cacheKey, config.cacheTtlMs)) {
    return depCache.get(cacheKey)
  }
  const adapter = ADAPTERS[ecosystem]
  if (!adapter) return null
  try {
    const version = await adapter.fetchLatestVersion(packageName)
    depCache.set(cacheKey, version)
    return version
  } catch (err) {
    console.warn(`Failed to fetch latest version for ${ecosystem}:${packageName}: ${err.message}`)
    depCache.set(cacheKey, null)
    return null
  }
}

async function getManifestContent(org, repoName, manifestFile) {
  const cacheKey = `dep:manifest:${org}/${repoName}/${manifestFile}`
  if (!depCache.isExpired(cacheKey, config.cacheTtlMs)) {
    return depCache.get(cacheKey)
  }
  const content = await fetchFile(
    `/repos/${org}/${repoName}/contents/${manifestFile}`,
    config.githubToken
  ).catch((err) => {
    console.warn(`Failed to fetch manifest ${manifestFile} for ${repoName}: ${err.message}`)
    return null
  })
  depCache.set(cacheKey, content)
  return content
}

export async function getDependencies() {
  const { org, team, githubToken, trackedDependencies } = config

  if (!trackedDependencies.length) {
    return { rows: [], trackedDependencies: [], driftCount: 0, fetchedAt: new Date() }
  }

  const repos = await fetchAllPages(`/orgs/${org}/teams/${team}/repos?per_page=100`, githubToken)

  const latestMap = {}
  await Promise.all(
    trackedDependencies.map(async ({ ecosystem, packageName }) => {
      latestMap[`${ecosystem}:${packageName}`] = await getLatestVersion(ecosystem, packageName)
    })
  )

  const depsByEcosystem = {}
  for (const { ecosystem, packageName } of trackedDependencies) {
    if (!depsByEcosystem[ecosystem]) depsByEcosystem[ecosystem] = []
    depsByEcosystem[ecosystem].push(packageName)
  }

  const rows = await Promise.all(
    repos.map(async (repo) => {
      const deps = {}
      for (const [ecosystem, packageNames] of Object.entries(depsByEcosystem)) {
        const adapter = ADAPTERS[ecosystem]
        if (!adapter) continue
        const content = await getManifestContent(org, repo.name, adapter.manifestFile)
        for (const packageName of packageNames) {
          const key = `${ecosystem}:${packageName}`
          const pinned = content ? adapter.extractVersion(content, packageName) : null
          const latest = latestMap[key]
          deps[key] = {
            pinned,
            latest,
            isDrift: pinned !== null && latest !== null && pinned !== latest,
          }
        }
      }
      return { repo: repo.name, deps }
    })
  )

  const driftCount = rows.filter((row) =>
    Object.values(row.deps).some((d) => d.isDrift)
  ).length

  return { rows, trackedDependencies, driftCount, fetchedAt: new Date() }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
node --experimental-vm-modules node_modules/.bin/jest test/services/dependencies/index.test.js --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/dependencies/index.js test/services/dependencies/index.test.js
git commit -m "feat: add dependencies orchestrator"
```

---

## Task 7: Update refresh route to clear dep cache

**Files:**
- Modify: `src/routes/refresh.js`

- [ ] **Step 1: Update `src/routes/refresh.js`**

Replace the full file content with:

```js
import * as cache from '../services/cache.js'
import * as depCache from '../services/dep-cache.js'
import { warmCache } from '../services/prs.js'

const ALLOWED = ['/', '/all', '/stale', '/unreviewed', '/needs-re-review', '/dependencies']

function safeRedirect(referrer) {
  try {
    const path = new URL(referrer, 'http://localhost').pathname
    return ALLOWED.includes(path) ? path : '/'
  } catch { return '/' }
}

export default {
  method: 'POST', path: '/refresh',
  handler(request, h) {
    const path = safeRedirect(request.headers.referer || '/')
    if (cache.isCooldown()) return h.redirect(`${path}?cooldown=1`)
    depCache.clear()
    warmCache().catch((err) => console.error('Manual refresh failed:', err.message))
    return h.redirect(path)
  },
}
```

- [ ] **Step 2: Run existing refresh tests to confirm nothing is broken**

```bash
node --experimental-vm-modules node_modules/.bin/jest test/routes/refresh.test.js --no-coverage
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/routes/refresh.js
git commit -m "feat: clear dep cache on /refresh and allow /dependencies referrer"
```

---

## Task 8: Create dependencies route, register it, and add nav entry

**Files:**
- Create: `src/routes/dependencies.js`
- Modify: `src/plugins/router.js`
- Modify: `src/views/layout.html`

- [ ] **Step 1: Create `src/routes/dependencies.js`**

```js
import { getPRs } from '../services/prs.js'
import { getDependencies } from '../services/dependencies/index.js'
import { buildNavCounts, formatAge } from './helpers.js'
import { config } from '../config.js'

export default {
  method: 'GET',
  path: '/dependencies',
  async handler(request, h) {
    const prData = getPRs()
    const depData = await getDependencies()
    return h.view('dependencies', {
      title: 'Dependency Drift',
      currentPath: '/dependencies',
      navCounts: buildNavCounts(prData),
      org: config.org,
      team: config.team,
      fetchedAtFormatted: formatAge(depData.fetchedAt),
      ...depData,
    })
  },
}
```

- [ ] **Step 2: Register the route in `src/plugins/router.js`**

Add the import and include in the route array:

```js
import inert from '@hapi/inert'
import { fileURLToPath } from 'url'
import { join } from 'path'

import indexRoute from '../routes/index.js'
import allRoute from '../routes/all.js'
import staleRoute from '../routes/stale.js'
import unreviewedRoute from '../routes/unreviewed.js'
import needsReReviewRoute from '../routes/needs-re-review.js'
import needsMergingRoute from '../routes/needs-merging.js'
import dependenciesRoute from '../routes/dependencies.js'
import refreshRoute from '../routes/refresh.js'
import slackSummaryRoute from '../routes/slack-summary.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const publicPath = join(__dirname, '../public')

export default {
  name: 'router',
  async register(server) {
    await server.register(inert)

    server.route({
      method: 'GET',
      path: '/assets/{param*}',
      handler: { directory: { path: publicPath } },
    })

    server.route([indexRoute, allRoute, staleRoute, unreviewedRoute, needsReReviewRoute, needsMergingRoute, dependenciesRoute, refreshRoute, slackSummaryRoute])
  },
}
```

- [ ] **Step 3: Add Dependencies nav entry to `src/views/layout.html`**

Add this `<li>` block just before the closing `</ul>` of the nav list (after the stale entry):

```html
            <li>
              <a href="/dependencies" class="app-nav__link{% if currentPath == '/dependencies' %} is-active{% endif %}">
                <svg class="app-nav__icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
                  <path d="M6.122.392a1.75 1.75 0 0 1 1.756 0l5.25 3.045c.54.313.872.89.872 1.514V11.05c0 .624-.332 1.2-.872 1.514l-5.25 3.045a1.75 1.75 0 0 1-1.756 0L.872 12.564C.332 12.25 0 11.674 0 11.05V4.951c0-.624.332-1.2.872-1.514Zm1.003 1.3a.25.25 0 0 0-.25 0l-5.25 3.044a.25.25 0 0 0-.125.217v6.1c0 .09.048.172.125.216l5.25 3.045a.25.25 0 0 0 .25 0l5.25-3.045a.25.25 0 0 0 .125-.216v-6.1a.25.25 0 0 0-.125-.217Z"/>
                </svg>
                <span class="app-nav__label">Dependencies</span>
                {% if driftCount %}<span class="app-badge app-badge--red">{{ driftCount }}</span>{% endif %}
              </a>
            </li>
```

- [ ] **Step 4: Start the dev server and verify the nav entry appears and `/dependencies` loads**

```bash
GITHUB_TOKEN=x GITHUB_ORG=test GITHUB_TEAM=test node src/index.js
```

Visit `http://localhost:3000/dependencies` — expect the page to load (may show a GitHub API error since the token is fake, but it should not crash).

Stop the server with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add src/routes/dependencies.js src/plugins/router.js src/views/layout.html
git commit -m "feat: add /dependencies route and nav entry"
```

---

## Task 9: Create dependencies view and CSS

**Files:**
- Create: `src/views/dependencies.html`
- Modify: `src/public/application.css`

- [ ] **Step 1: Add CSS for dep table cells at the end of `src/public/application.css`**

```css
/* ============================================================
   DEPENDENCY DRIFT TABLE
   ============================================================ */
.app-dep-ecosystem {
  display: block;
  font-size: 10px;
  font-weight: 400;
  color: var(--text-subtle);
  text-transform: none;
  letter-spacing: 0;
  margin-top: 2px;
}

.app-dep--absent {
  color: var(--text-subtle);
  font-family: var(--mono);
  font-size: 13px;
}

.app-dep-latest {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--green);
  margin-top: 4px;
}
```

- [ ] **Step 2: Create `src/views/dependencies.html`**

```html
{% extends "layout.html" %}

{% block content %}
  <div class="app-page-header">
    <p class="app-page-header__caption">{{ org }} / {{ team }} team</p>
    <h1 class="app-page-header__title">{{ title }}</h1>
    <p class="app-page-header__desc">Dependency versions across all team repos, compared to the latest published release.</p>
    <p class="app-page-header__meta">
      Last updated {{ fetchedAtFormatted }} —
      <form method="POST" action="/refresh" style="display:inline">
        <button class="app-refresh-btn">Refresh</button>
      </form>
    </p>
  </div>

  {% if not trackedDependencies.length %}
    <div class="app-alert app-alert--info">
      No dependencies configured — set <code>TRACKED_DEPENDENCIES</code> in your environment (e.g. <code>npm:govuk-frontend,npm:hapi</code>).
    </div>
  {% else %}

    {% if driftCount > 0 %}
      <div class="app-alert app-alert--warning">
        <strong>{{ driftCount }} repo{{ "s" if driftCount != 1 }}</strong> {{ "has" if driftCount == 1 else "have" }} dependency drift.
      </div>
    {% else %}
      <div class="app-alert app-alert--success">
        All tracked dependencies are up to date.
      </div>
    {% endif %}

    <div class="app-table-wrap">
      <table class="app-table">
        <thead>
          <tr>
            <th>Repository</th>
            {% for dep in trackedDependencies %}
              <th>
                {{ dep.packageName }}
                <span class="app-dep-ecosystem">{{ dep.ecosystem }}</span>
              </th>
            {% endfor %}
          </tr>
        </thead>
        <tbody>
          {% for row in rows %}
            <tr>
              <td><span class="app-mono">{{ row.repo }}</span></td>
              {% for dep in trackedDependencies %}
                {% set key = dep.ecosystem + ":" + dep.packageName %}
                {% set cell = row.deps[key] %}
                <td>
                  {% if cell.pinned is null %}
                    <span class="app-dep--absent">—</span>
                  {% elif cell.isDrift %}
                    <span class="app-pill app-pill--red" title="Latest: {{ cell.latest }}">{{ cell.pinned }}</span>
                    {% if cell.latest %}
                      <div class="app-dep-latest">→ {{ cell.latest }}</div>
                    {% endif %}
                  {% else %}
                    <span class="app-pill app-pill--green">{{ cell.pinned }}</span>
                  {% endif %}
                </td>
              {% endfor %}
            </tr>
          {% endfor %}
        </tbody>
      </table>
    </div>

  {% endif %}
{% endblock %}
```

- [ ] **Step 3: Commit**

```bash
git add src/views/dependencies.html src/public/application.css
git commit -m "feat: add dependency drift view and CSS"
```

---

## Task 10: Route integration test

**Files:**
- Create: `test/routes/dependencies.test.js`

- [ ] **Step 1: Write the tests**

Create `test/routes/dependencies.test.js`:

```js
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'

jest.unstable_mockModule('../../src/config.js', () => ({
  config: {
    port: 3000,
    githubToken: 'test',
    cacheTtlMs: 300000,
    isDevelopment: false,
    org: 'test-org',
    team: 'test-team',
    trackedDependencies: [{ ecosystem: 'npm', packageName: 'hapi' }],
  },
}))

const mockGetPRs = jest.fn()
jest.unstable_mockModule('../../src/services/prs.js', () => ({
  getPRs: mockGetPRs,
  warmCache: jest.fn().mockResolvedValue({}),
  isBot: jest.fn(),
}))

const mockGetDependencies = jest.fn()
jest.unstable_mockModule('../../src/services/dependencies/index.js', () => ({
  getDependencies: mockGetDependencies,
}))

const { createServer } = await import('../../src/server.js')

const emptyPrData = { fetchedAt: new Date(), teamMembers: new Set(), prs: [] }

const makeDepData = (overrides = {}) => ({
  rows: [],
  trackedDependencies: [{ ecosystem: 'npm', packageName: 'hapi' }],
  driftCount: 0,
  fetchedAt: new Date(),
  ...overrides,
})

describe('GET /dependencies', () => {
  let server

  beforeEach(async () => {
    server = await createServer()
    mockGetPRs.mockReturnValue(emptyPrData)
  })

  afterEach(async () => {
    await server.stop()
  })

  it('returns 200', async () => {
    mockGetDependencies.mockResolvedValueOnce(makeDepData())
    const res = await server.inject({ method: 'GET', url: '/dependencies' })
    expect(res.statusCode).toBe(200)
  })

  it('shows the unconfigured message when trackedDependencies is empty', async () => {
    mockGetDependencies.mockResolvedValueOnce(makeDepData({ trackedDependencies: [] }))
    const res = await server.inject({ method: 'GET', url: '/dependencies' })
    expect(res.payload).toContain('TRACKED_DEPENDENCIES')
  })

  it('shows a drift warning when driftCount > 0', async () => {
    mockGetDependencies.mockResolvedValueOnce(makeDepData({
      driftCount: 2,
      rows: [
        {
          repo: 'forms-api',
          deps: { 'npm:hapi': { pinned: '20.0.0', latest: '21.3.0', isDrift: true } },
        },
      ],
    }))
    const res = await server.inject({ method: 'GET', url: '/dependencies' })
    expect(res.payload).toContain('dependency drift')
    expect(res.payload).toContain('forms-api')
  })

  it('shows a success banner when driftCount is 0', async () => {
    mockGetDependencies.mockResolvedValueOnce(makeDepData({
      driftCount: 0,
      rows: [
        {
          repo: 'forms-api',
          deps: { 'npm:hapi': { pinned: '21.3.0', latest: '21.3.0', isDrift: false } },
        },
      ],
    }))
    const res = await server.inject({ method: 'GET', url: '/dependencies' })
    expect(res.payload).toContain('up to date')
  })

  it('renders — for absent packages', async () => {
    mockGetDependencies.mockResolvedValueOnce(makeDepData({
      rows: [
        {
          repo: 'forms-api',
          deps: { 'npm:hapi': { pinned: null, latest: '21.3.0', isDrift: false } },
        },
      ],
    }))
    const res = await server.inject({ method: 'GET', url: '/dependencies' })
    expect(res.payload).toContain('—')
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
node --experimental-vm-modules node_modules/.bin/jest test/routes/dependencies.test.js --no-coverage
```

Expected: all tests pass.

- [ ] **Step 3: Run the full test suite**

```bash
node --experimental-vm-modules node_modules/.bin/jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add test/routes/dependencies.test.js
git commit -m "test: add /dependencies route integration tests"
```
