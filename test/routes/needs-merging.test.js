import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'

const mockGetPRs = jest.fn()
const mockIsBot = jest.fn()

jest.unstable_mockModule('../../src/config.js', () => ({
  config: {
    port: 3000,
    githubToken: 'test',
    cacheTtlMs: 300000,
    isDevelopment: false,
  },
}))

jest.unstable_mockModule('../../src/services/prs.js', () => ({
  getPRs: mockGetPRs,
  warmCache: jest.fn().mockResolvedValue({}),
  isBot: mockIsBot,
}))

const { createServer } = await import('../../src/server.js')

const teamMembers = new Set(['alice', 'bob'])

const makePR = (overrides = {}) => ({
  number: 1,
  title: 'Test PR',
  url: 'https://github.com/DEFRA/forms-runner/pull/1',
  repo: 'forms-runner',
  author: 'external-user',
  authorType: 'User',
  createdAt: new Date('2026-03-01'),
  updatedAt: new Date('2026-03-20'),
  draft: false,
  reviews: [],
  commits: [],
  reviewCount: 1,
  reviewState: 'APPROVED',
  isStale: false,
  isReviewed: true,
  latestReviewAt: new Date('2026-03-15'),
  hasUnreviewedCommits: false,
  jiraTicket: null,
  ...overrides,
})

describe('GET /needs-merging', () => {
  let server

  beforeEach(async () => {
    server = await createServer()
    mockIsBot.mockImplementation(({ type, login }) => type === 'Bot' || login.endsWith('[bot]'))
  })

  afterEach(async () => {
    await server.stop()
  })

  it('returns 200', async () => {
    mockGetPRs.mockResolvedValue({
      fetchedAt: new Date(),
      teamMembers,
      prs: [makePR({ reviews: [{ user: { login: 'alice' }, state: 'APPROVED' }] })],
    })
    const res = await server.inject({ method: 'GET', url: '/needs-merging' })
    expect(res.statusCode).toBe(200)
  })

  it('shows a PR approved by a team member', async () => {
    mockGetPRs.mockResolvedValue({
      fetchedAt: new Date(),
      teamMembers,
      prs: [
        makePR({
          author: 'external-user',
          reviews: [{ user: { login: 'alice' }, state: 'APPROVED' }],
        }),
      ],
    })
    const res = await server.inject({ method: 'GET', url: '/needs-merging' })
    expect(res.payload).toContain('external-user')
  })

  it('excludes a PR approved only by a non-team member', async () => {
    mockGetPRs.mockResolvedValue({
      fetchedAt: new Date(),
      teamMembers,
      prs: [
        makePR({
          author: 'external-user',
          reviews: [{ user: { login: 'outsider' }, state: 'APPROVED' }],
        }),
      ],
    })
    const res = await server.inject({ method: 'GET', url: '/needs-merging' })
    expect(res.payload).not.toContain('external-user')
  })

  it('excludes PRs with unreviewed commits', async () => {
    mockGetPRs.mockResolvedValue({
      fetchedAt: new Date(),
      teamMembers,
      prs: [
        makePR({
          hasUnreviewedCommits: true,
          reviews: [{ user: { login: 'alice' }, state: 'APPROVED' }],
        }),
      ],
    })
    const res = await server.inject({ method: 'GET', url: '/needs-merging' })
    expect(res.payload).toContain('Showing <strong>0</strong>')
  })

  it('excludes draft PRs', async () => {
    mockGetPRs.mockResolvedValue({
      fetchedAt: new Date(),
      teamMembers,
      prs: [
        makePR({
          draft: true,
          reviews: [{ user: { login: 'alice' }, state: 'APPROVED' }],
        }),
      ],
    })
    const res = await server.inject({ method: 'GET', url: '/needs-merging' })
    expect(res.payload).toContain('Showing <strong>0</strong>')
  })

  it('excludes bot-authored PRs', async () => {
    mockGetPRs.mockResolvedValue({
      fetchedAt: new Date(),
      teamMembers,
      prs: [
        makePR({
          author: 'dependabot[bot]',
          authorType: 'Bot',
          reviews: [{ user: { login: 'alice' }, state: 'APPROVED' }],
        }),
      ],
    })
    const res = await server.inject({ method: 'GET', url: '/needs-merging' })
    expect(res.payload).not.toContain('dependabot')
  })
})
