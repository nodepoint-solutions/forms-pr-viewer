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
  warmPrCache: jest.fn().mockResolvedValue({}),
  isBot: jest.fn(),
}))

const mockGetDependencies = jest.fn()
jest.unstable_mockModule('../../src/services/dependencies/index.js', () => ({
  getDependencies: mockGetDependencies,
  getSecurityAlerts: jest.fn().mockReturnValue({ alerts: [], alertCount: 0, fetchedAt: new Date() }),
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
    mockGetDependencies.mockReturnValueOnce(makeDepData())
    const res = await server.inject({ method: 'GET', url: '/dependencies' })
    expect(res.statusCode).toBe(200)
  })

  it('shows the unconfigured message when trackedDependencies is empty', async () => {
    mockGetDependencies.mockReturnValueOnce(makeDepData({ trackedDependencies: [] }))
    const res = await server.inject({ method: 'GET', url: '/dependencies' })
    expect(res.payload).toContain('TRACKED_DEPENDENCIES')
  })

  it('shows a drift warning when driftCount > 0', async () => {
    mockGetDependencies.mockReturnValueOnce(makeDepData({
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
    mockGetDependencies.mockReturnValueOnce(makeDepData({
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

  it('does not render repos where the dependency is absent', async () => {
    mockGetDependencies.mockReturnValueOnce(makeDepData({
      rows: [
        {
          repo: 'forms-api',
          deps: { 'npm:hapi': { pinned: null, latest: '21.3.0', isDrift: false } },
        },
      ],
    }))
    const res = await server.inject({ method: 'GET', url: '/dependencies' })
    expect(res.payload).not.toContain('forms-api')
  })
})
