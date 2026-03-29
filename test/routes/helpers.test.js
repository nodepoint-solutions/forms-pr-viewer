import { describe, it, expect } from '@jest/globals'
import {
  formatAge,
  applyFilters,
  applySort,
  buildSelectOptions,
  buildNavCounts,
} from '../../src/routes/helpers.js'

describe('formatAge', () => {
  const now = Date.now()

  it('formats as minutes for < 1 hour', () => {
    expect(formatAge(new Date(now - 30 * 60_000))).toBe('30 minutes ago')
  })

  it('formats as 1 minute singular', () => {
    expect(formatAge(new Date(now - 1 * 60_000))).toBe('1 minute ago')
  })

  it('formats as hours for < 24 hours', () => {
    expect(formatAge(new Date(now - 5 * 3_600_000))).toBe('5 hours ago')
  })

  it('formats as days for < 14 days', () => {
    expect(formatAge(new Date(now - 3 * 86_400_000))).toBe('3 days ago')
  })

  it('formats as weeks for >= 14 days', () => {
    expect(formatAge(new Date(now - 21 * 86_400_000))).toBe('3 weeks ago')
  })
})

describe('applyFilters', () => {
  const prs = [
    { repo: 'forms-runner', author: 'alice' },
    { repo: 'forms-designer', author: 'bob' },
    { repo: 'forms-runner', author: 'carol' },
  ]

  it('returns all PRs when no filters applied', () => {
    expect(applyFilters(prs, {})).toHaveLength(3)
  })

  it('filters by repo', () => {
    const result = applyFilters(prs, { repo: 'forms-runner' })
    expect(result).toHaveLength(2)
    expect(result.every((pr) => pr.repo === 'forms-runner')).toBe(true)
  })

  it('filters by author', () => {
    const result = applyFilters(prs, { author: 'alice' })
    expect(result).toHaveLength(1)
    expect(result[0].author).toBe('alice')
  })

  it('combines repo and author filters', () => {
    const result = applyFilters(prs, { repo: 'forms-runner', author: 'alice' })
    expect(result).toHaveLength(1)
  })
})

describe('applySort', () => {
  const now = Date.now()
  const prs = [
    { title: 'C', author: 'carol', createdAt: new Date(now - 3000), updatedAt: new Date(now - 1000) },
    { title: 'A', author: 'alice', createdAt: new Date(now - 1000), updatedAt: new Date(now - 3000) },
    { title: 'B', author: 'bob', createdAt: new Date(now - 2000), updatedAt: new Date(now - 2000) },
  ]

  it('sorts by age desc (oldest first)', () => {
    const sorted = applySort(prs, 'age', 'desc')
    expect(sorted[0].title).toBe('C')
  })

  it('sorts by age asc (newest first)', () => {
    const sorted = applySort(prs, 'age', 'asc')
    expect(sorted[0].title).toBe('A')
  })

  it('sorts by title asc', () => {
    const sorted = applySort(prs, 'title', 'asc')
    expect(sorted.map((p) => p.title)).toEqual(['A', 'B', 'C'])
  })

  it('sorts by author asc', () => {
    const sorted = applySort(prs, 'author', 'asc')
    expect(sorted[0].author).toBe('alice')
  })

  it('sorts by updated desc', () => {
    const sorted = applySort(prs, 'updated', 'desc')
    expect(sorted[0].title).toBe('C')
  })

  it('does not mutate the original array', () => {
    const original = [...prs]
    applySort(prs, 'title', 'asc')
    expect(prs).toEqual(original)
  })
})

describe('buildSelectOptions', () => {
  const prs = [
    { repo: 'forms-runner' },
    { repo: 'forms-designer' },
    { repo: 'forms-runner' },
  ]

  it('returns unique sorted values', () => {
    expect(buildSelectOptions(prs, 'repo')).toEqual(['forms-designer', 'forms-runner'])
  })
})

describe('buildNavCounts', () => {
  const teamMembers = new Set(['alice', 'bob'])

  const prs = [
    // needs-re-review
    {
      author: 'alice', authorType: 'User',
      isReviewed: true, hasUnreviewedCommits: true, draft: false, isStale: false,
      reviewState: 'APPROVED',
      reviews: [{ user: { login: 'bob' }, state: 'APPROVED' }],
    },
    // unreviewed
    {
      author: 'bob', authorType: 'User',
      isReviewed: false, hasUnreviewedCommits: false, draft: false, isStale: true,
      reviewState: null,
      reviews: [],
    },
    // draft — excluded from unreviewed + needs-re-review + needs-merging
    {
      author: 'carol', authorType: 'User',
      isReviewed: false, hasUnreviewedCommits: false, draft: true, isStale: false,
      reviewState: null,
      reviews: [],
    },
    // bot — excluded from all counts
    {
      author: 'dependabot[bot]', authorType: 'Bot',
      isReviewed: false, hasUnreviewedCommits: false, draft: false, isStale: false,
      reviewState: null,
      reviews: [],
    },
    // needs-merging: approved by a team member (alice), no unreviewed commits, not draft
    {
      author: 'external-user', authorType: 'User',
      isReviewed: true, hasUnreviewedCommits: false, draft: false, isStale: false,
      reviewState: 'APPROVED',
      reviews: [{ user: { login: 'alice' }, state: 'APPROVED' }],
    },
    // NOT needs-merging: approved but by a non-team-member only
    {
      author: 'external-user', authorType: 'User',
      isReviewed: true, hasUnreviewedCommits: false, draft: false, isStale: false,
      reviewState: 'APPROVED',
      reviews: [{ user: { login: 'outsider' }, state: 'APPROVED' }],
    },
  ]

  it('counts correctly', () => {
    const counts = buildNavCounts({ prs, teamMembers })
    expect(counts.needsReReview).toBe(1)
    expect(counts.unreviewed).toBe(1)   // bob only; draft excluded
    expect(counts.team).toBe(2)         // alice + bob (carol is draft, not team; bot excluded)
    expect(counts.all).toBe(4)          // bots excluded, draft excluded (was 5)
    expect(counts.stale).toBe(1)        // bob only
    expect(counts.needsMerging).toBe(1) // external-user PR approved by alice (team member)
    expect(counts.drafts).toBe(1)       // carol
  })
})

import { groupByJira } from '../../src/routes/helpers.js'

describe('groupByJira', () => {
  const make = (jiraTicket) => ({ jiraTicket, title: 'PR', number: 1 })

  it('groups PRs by ticket', () => {
    const prs = [make('DF-1'), make('DF-2'), make('DF-1')]
    const groups = groupByJira(prs)
    expect(groups).toHaveLength(2)
    expect(groups[0].label).toBe('DF-1')
    expect(groups[0].prs).toHaveLength(2)
    expect(groups[1].label).toBe('DF-2')
  })

  it('puts null-ticket PRs last with null label', () => {
    const prs = [make('DF-1'), make(null)]
    const groups = groupByJira(prs)
    expect(groups[groups.length - 1].label).toBeNull()
  })

  it('sorts ticket groups alphabetically', () => {
    const prs = [make('DF-20'), make('DF-3'), make('DF-10')]
    const labels = groupByJira(prs).map((g) => g.label)
    expect(labels).toEqual(['DF-10', 'DF-20', 'DF-3'])
  })

  it('returns empty array for empty input', () => {
    expect(groupByJira([])).toEqual([])
  })
})
