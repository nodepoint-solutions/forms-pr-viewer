import { config } from '../config.js'
import * as cache from './cache.js'
import { fetchAllPages } from './github.js'

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000
const JIRA_RE = new RegExp(`\\b${config.jiraTicketPattern}\\b`, 'gi')

export function extractJiraTicket(rawPR) {
  const text = [rawPR.title ?? '', rawPR.body ?? '', rawPR.head?.ref ?? ''].join(' ')
  const match = text.match(JIRA_RE)
  return match ? match[0].toUpperCase() : null
}

export function isBot(user) {
  return user.type === 'Bot' || user.login.endsWith('[bot]')
}

export function isMergeCommit(commit) {
  return commit.parents.length > 1
}

function computeReviewState(reviews) {
  // Get latest state per reviewer, then find highest priority state
  const latestPerReviewer = {}
  for (const review of reviews) {
    latestPerReviewer[review.user.login] = review.state
  }
  const states = Object.values(latestPerReviewer)
  if (!states.length) return null
  if (states.includes('CHANGES_REQUESTED')) return 'CHANGES_REQUESTED'
  if (states.includes('APPROVED')) return 'APPROVED'
  if (states.includes('COMMENTED')) return 'COMMENTED'
  return 'DISMISSED'
}

export function formatPR(rawPR, rawReviews, rawCommits) {
  const reviews = rawReviews
    .filter((r) => !isBot(r.user))
    .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at))

  const commits = rawCommits
    .filter((c) => !isMergeCommit(c))
    .sort((a, b) => new Date(a.commit.committer.date) - new Date(b.commit.committer.date))

  const latestReviewAt =
    reviews.length > 0
      ? new Date(Math.max(...reviews.map((r) => new Date(r.submitted_at).getTime())))
      : null

  const hasUnreviewedCommits =
    latestReviewAt !== null &&
    commits.some((c) => new Date(c.commit.committer.date) > latestReviewAt)

  return {
    number: rawPR.number,
    title: rawPR.title,
    url: rawPR.html_url,
    repo: rawPR.base.repo.name,
    author: rawPR.user.login,
    authorType: rawPR.user.type,
    createdAt: new Date(rawPR.created_at),
    updatedAt: new Date(rawPR.updated_at),
    draft: rawPR.draft,
    reviews,
    commits,
    reviewCount: reviews.length,
    reviewState: computeReviewState(reviews),
    isStale: Date.now() - new Date(rawPR.updated_at).getTime() > FOURTEEN_DAYS_MS,
    isReviewed: reviews.length > 0,
    latestReviewAt,
    hasUnreviewedCommits,
    jiraTicket: extractJiraTicket(rawPR),
  }
}

export async function runWithConcurrency(items, fn, concurrency) {
  const results = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

const EMPTY_DATA = { fetchedAt: null, teamMembers: new Set(), prs: [] }

// Read-only cache access — never triggers API calls.
// Returns EMPTY_DATA if the cache has not been warmed yet.
export function getPRs() {
  return cache.get() ?? EMPTY_DATA
}

// Fetches from GitHub and populates the cache. Called only by the scheduler.
export async function warmCache() {
  const { githubToken } = config

  const { org, team } = config
  const [teamMembers, repos] = await Promise.all([
    fetchAllPages(`/orgs/${org}/teams/${team}/members`, githubToken),
    fetchAllPages(`/orgs/${org}/teams/${team}/repos`, githubToken),
  ])

  const teamMembersSet = new Set(teamMembers.map((m) => m.login))

  // Only include repos where the team is an admin/owner — excludes repos with mere write access
  const ownedRepos = repos.filter((repo) => repo.permissions?.admin)

  // Fetch open PRs for all repos in parallel, tolerating individual failures
  const prsByRepo = await Promise.all(
    ownedRepos.map((repo) =>
      fetchAllPages(
        `/repos/${org}/${repo.name}/pulls?state=open&per_page=100`,
        githubToken
      ).catch((err) => {
        console.error(`Failed to fetch PRs for ${repo.name}:`, err.message)
        return null
      })
    )
  )

  // If every repo fetch failed, something is systemically wrong — preserve the old cache
  const allFailed = ownedRepos.length > 0 && prsByRepo.every((r) => r === null)
  if (allFailed) throw new Error('All repo PR fetches failed — preserving cached data')

  const rawPRs = prsByRepo.filter((r) => r !== null).flat()

  // Fetch reviews + commits per PR, capped at 10 concurrent
  const prs = await runWithConcurrency(
    rawPRs,
    async (rawPR) => {
      const repoName = rawPR.base.repo.name
      const [reviews, commits] = await Promise.all([
        fetchAllPages(`/repos/${org}/${repoName}/pulls/${rawPR.number}/reviews?per_page=100`, githubToken),
        fetchAllPages(`/repos/${org}/${repoName}/pulls/${rawPR.number}/commits?per_page=100`, githubToken),
      ])
      return formatPR(rawPR, reviews ?? [], commits ?? [])
    },
    10
  )

  const data = { fetchedAt: new Date(), teamMembers: teamMembersSet, prs }
  cache.set(data)
  return data
}
