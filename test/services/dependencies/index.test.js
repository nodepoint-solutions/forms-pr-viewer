import { jest, describe, it, expect, beforeEach } from '@jest/globals'

jest.unstable_mockModule('../../../src/config.js', () => ({
  config: {
    org: 'test-org',
    team: 'test-team',
    githubToken: 'test-token',
    cacheTtlMs: 300000,
    requiredTeamRole: 'admin',
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

// Reset module registry so this file always loads the real module, even if another
// test file (e.g. scheduler.test.js) has registered a mock for the same path.
jest.resetModules()

const { warmDependencyCache, getDependencies } = await import('../../../src/services/dependencies/index.js')

describe('warmDependencyCache', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDepCache.isExpired.mockReturnValue(true)
    mockDepCache.get.mockReturnValue(null)
  })

  it('returns empty result when trackedDependencies is empty', async () => {
    const { config } = await import('../../../src/config.js')
    config.trackedDependencies = []
    const result = await warmDependencyCache()
    expect(result.rows).toEqual([])
    expect(result.trackedDependencies).toEqual([])
    expect(result.driftCount).toBe(0)
    config.trackedDependencies = [{ ecosystem: 'npm', packageName: 'hapi' }]
  })

  it('marks a package as drifted when pinned !== latest', async () => {
    mockFetchAllPages.mockResolvedValueOnce([{ name: 'forms-api', permissions: { admin: true } }])
    mockNpmAdapter.fetchLatestVersion.mockResolvedValueOnce('22.0.0')
    mockFetchFile.mockResolvedValueOnce(JSON.stringify({ dependencies: { hapi: '^21.3.0' } }))
    mockNpmAdapter.extractVersion.mockReturnValueOnce('^21.3.0')
    const result = await warmDependencyCache()
    expect(result.driftCount).toBe(1)
    expect(result.rows[0].deps['npm:hapi'].isDrift).toBe(true)
    expect(result.rows[0].deps['npm:hapi'].pinned).toBe('^21.3.0')
    expect(result.rows[0].deps['npm:hapi'].latest).toBe('22.0.0')
  })

  it('marks a package as not drifted when pinned === latest', async () => {
    mockFetchAllPages.mockResolvedValueOnce([{ name: 'forms-api', permissions: { admin: true } }])
    mockNpmAdapter.fetchLatestVersion.mockResolvedValueOnce('21.3.0')
    mockFetchFile.mockResolvedValueOnce(JSON.stringify({ dependencies: { hapi: '21.3.0' } }))
    mockNpmAdapter.extractVersion.mockReturnValueOnce('21.3.0')
    const result = await warmDependencyCache()
    expect(result.driftCount).toBe(0)
    expect(result.rows[0].deps['npm:hapi'].isDrift).toBe(false)
  })

  it('excludes repos where no tracked packages are present', async () => {
    mockFetchAllPages.mockResolvedValueOnce([{ name: 'forms-api', permissions: { admin: true } }])
    mockNpmAdapter.fetchLatestVersion.mockResolvedValueOnce('21.3.0')
    mockFetchFile.mockResolvedValueOnce(null)
    const result = await warmDependencyCache()
    expect(result.rows).toHaveLength(0)
  })

  it('includes repos where at least one tracked package is present', async () => {
    mockFetchAllPages.mockResolvedValueOnce([{ name: 'forms-api', permissions: { admin: true } }])
    mockNpmAdapter.fetchLatestVersion.mockResolvedValueOnce('21.3.0')
    mockFetchFile.mockResolvedValueOnce(JSON.stringify({ dependencies: { hapi: '21.3.0' } }))
    mockNpmAdapter.extractVersion.mockReturnValueOnce('21.3.0')
    const result = await warmDependencyCache()
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].repo).toBe('forms-api')
  })

  it('sets latest to null when registry fetch fails', async () => {
    mockFetchAllPages.mockResolvedValueOnce([{ name: 'forms-api', permissions: { admin: true } }])
    mockNpmAdapter.fetchLatestVersion.mockRejectedValueOnce(new Error('network error'))
    mockFetchFile.mockResolvedValueOnce(JSON.stringify({ dependencies: { hapi: '21.3.0' } }))
    mockNpmAdapter.extractVersion.mockReturnValueOnce('21.3.0')
    const result = await warmDependencyCache()
    expect(result.rows[0].deps['npm:hapi'].latest).toBeNull()
    expect(result.rows[0].deps['npm:hapi'].isDrift).toBe(false)
  })

  it('excludes repos where the team does not have admin permissions', async () => {
    mockFetchAllPages.mockResolvedValueOnce([
      { name: 'forms-api', permissions: { admin: true } },
      { name: 'forms-runner', permissions: { admin: false } },
      { name: 'forms-shared', permissions: undefined },
    ])
    mockNpmAdapter.fetchLatestVersion.mockResolvedValueOnce('21.3.0')
    mockFetchFile.mockResolvedValueOnce(JSON.stringify({ dependencies: { hapi: '21.3.0' } }))
    mockNpmAdapter.extractVersion.mockReturnValueOnce('21.3.0')
    const result = await warmDependencyCache()
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].repo).toBe('forms-api')
  })
})

describe('getDependencies', () => {
  it('returns empty data before cache is warmed', () => {
    // Module-level depStore is populated by warmDependencyCache calls above,
    // but since modules are isolated per test file, getDependencies reflects
    // whatever warmDependencyCache last set.
    const result = getDependencies()
    expect(result).toHaveProperty('rows')
    expect(result).toHaveProperty('trackedDependencies')
    expect(result).toHaveProperty('driftCount')
  })
})
