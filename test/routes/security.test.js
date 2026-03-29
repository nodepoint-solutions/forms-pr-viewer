import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'

const mockGetPRs = jest.fn()

jest.unstable_mockModule('../../src/config.js', () => ({
  config: { port: 3000, githubToken: 'test', cacheTtlMs: 300000, isDevelopment: false, org: 'test-org', team: 'test-team' },
}))

jest.unstable_mockModule('../../src/services/prs.js', () => ({
  getPRs: mockGetPRs,
  warmPrCache: jest.fn().mockResolvedValue({}),
  isBot: jest.fn(),
}))

const mockGetSecurityAlerts = jest.fn()
jest.unstable_mockModule('../../src/services/dependencies/index.js', () => ({
  getDependencies: jest.fn().mockReturnValue({ rows: [], trackedDependencies: [], driftCount: 0, fetchedAt: new Date() }),
  getSecurityAlerts: mockGetSecurityAlerts,
}))

const { createServer } = await import('../../src/server.js')
const emptyPrData = { fetchedAt: new Date(), teamMembers: new Set(), prs: [] }

describe('GET /security', () => {
  let server

  beforeEach(async () => {
    server = await createServer()
    mockGetPRs.mockReturnValue(emptyPrData)
  })

  afterEach(async () => { await server.stop() })

  it('returns 200 with no alerts', async () => {
    mockGetSecurityAlerts.mockReturnValue({ alerts: [], alertCount: 0, fetchedAt: new Date() })
    const res = await server.inject({ method: 'GET', url: '/security' })
    expect(res.statusCode).toBe(200)
    expect(res.payload).toContain('No open vulnerability alerts')
  })

  it('shows alert count in the banner when alerts exist', async () => {
    mockGetSecurityAlerts.mockReturnValue({
      alertCount: 2, fetchedAt: new Date(),
      alerts: [
        { repo: 'forms-runner', package: 'lodash', ecosystem: 'npm', severity: 'high', title: 'Prototype Pollution', ghsaId: 'GHSA-jf85-cpcp-j695', cveId: 'CVE-2020-8203', fixedIn: '4.17.21' },
        { repo: 'forms-runner', package: 'express', ecosystem: 'npm', severity: 'critical', title: 'RCE in express', ghsaId: 'GHSA-xxxx-yyyy-zzzz', cveId: null, fixedIn: null },
      ],
    })
    const res = await server.inject({ method: 'GET', url: '/security' })
    expect(res.statusCode).toBe(200)
    expect(res.payload).toContain('2 open vulnerability alerts')
    expect(res.payload).toContain('forms-runner')
    expect(res.payload).toContain('lodash')
    expect(res.payload).toContain('GHSA-jf85-cpcp-j695')
  })

  it('groups alerts by repo', async () => {
    mockGetSecurityAlerts.mockReturnValue({
      alertCount: 2, fetchedAt: new Date(),
      alerts: [
        { repo: 'repo-a', package: 'pkg-a', ecosystem: 'npm', severity: 'low', title: 'Alert A', ghsaId: 'GHSA-aaaa', cveId: null, fixedIn: null },
        { repo: 'repo-b', package: 'pkg-b', ecosystem: 'npm', severity: 'high', title: 'Alert B', ghsaId: 'GHSA-bbbb', cveId: null, fixedIn: null },
      ],
    })
    const res = await server.inject({ method: 'GET', url: '/security' })
    expect(res.payload).toContain('repo-a')
    expect(res.payload).toContain('repo-b')
    expect(res.payload).toContain('pkg-a')
    expect(res.payload).toContain('pkg-b')
  })
})
