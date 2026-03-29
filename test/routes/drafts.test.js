import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'

const mockGetPRs = jest.fn()
const mockIsBot = jest.fn()

jest.unstable_mockModule('../../src/config.js', () => ({
  config: {
    port: 3000,
    githubToken: 'test',
    cacheTtlMs: 300000,
    isDevelopment: false,
    org: 'test-org',
    team: 'test-team',
  },
}))

jest.unstable_mockModule('../../src/services/prs.js', () => ({
  getPRs: mockGetPRs,
  warmPrCache: jest.fn().mockResolvedValue({}),
  isBot: mockIsBot,
}))

const { createServer } = await import('../../src/server.js')

const teamMembers = new Set(['alice'])

const makePR = (overrides = {}) => ({
  number: 1,
  title: 'Draft PR',
  url: 'https://github.com/test-org/repo/pull/1',
  repo: 'repo',
  author: 'alice',
  authorType: 'User',
  createdAt: new Date('2026-03-01'),
  updatedAt: new Date('2026-03-20'),
  draft: true,
  reviews: [],
  commits: [],
  reviewCount: 0,
  reviewState: null,
  isStale: false,
  isReviewed: false,
  latestReviewAt: null,
  hasUnreviewedCommits: false,
  additions: 10,
  deletions: 5,
  ciStatus: 'unknown',
  ...overrides,
})

const mockData = {
  fetchedAt: new Date(),
  teamMembers,
  prs: [
    makePR({ number: 1, draft: true }),
    makePR({ number: 2, draft: false, title: 'Non-draft PR' }),
  ],
}

describe('GET /drafts', () => {
  let server

  beforeEach(async () => {
    server = await createServer()
    mockGetPRs.mockReturnValue(mockData)
    mockIsBot.mockImplementation(({ type, login }) => type === 'Bot' || login.endsWith('[bot]'))
  })

  afterEach(async () => {
    await server.stop()
  })

  it('returns 200', async () => {
    const res = await server.inject({ method: 'GET', url: '/drafts' })
    expect(res.statusCode).toBe(200)
  })

  it('shows only draft PRs', async () => {
    const res = await server.inject({ method: 'GET', url: '/drafts' })
    expect(res.payload).toContain('Draft PR')
    expect(res.payload).not.toContain('Non-draft PR')
  })

  it('filters by repo query param', async () => {
    const prs = [
      makePR({ number: 1, draft: true, repo: 'repo-a', title: 'Draft A' }),
      makePR({ number: 2, draft: true, repo: 'repo-b', title: 'Draft B' }),
    ]
    mockGetPRs.mockReturnValue({ ...mockData, prs })
    const res = await server.inject({ method: 'GET', url: '/drafts?repo=repo-a' })
    expect(res.payload).toContain('Draft A')
    expect(res.payload).not.toContain('Draft B')
  })
})
