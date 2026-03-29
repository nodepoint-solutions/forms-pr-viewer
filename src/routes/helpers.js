import { config } from '../config.js'

export function formatAge(date) {
  const ms = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(ms / 60_000)
  const hours = Math.floor(ms / 3_600_000)
  const days = Math.floor(ms / 86_400_000)
  const weeks = Math.floor(ms / (7 * 86_400_000))

  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  if (days < 14) return `${days} day${days !== 1 ? 's' : ''} ago`
  return `${weeks} week${weeks !== 1 ? 's' : ''} ago`
}

export function applyFilters(prs, { repo, author } = {}) {
  let result = prs
  if (repo) result = result.filter((pr) => pr.repo === repo)
  if (author) result = result.filter((pr) => pr.author === author)
  return result
}

export function applySort(prs, sort, dir) {
  const sorted = [...prs]
  const asc = dir === 'asc'

  sorted.sort((a, b) => {
    let cmp
    switch (sort) {
      case 'title':
        cmp = a.title.localeCompare(b.title)
        break
      case 'author':
        cmp = a.author.localeCompare(b.author)
        break
      case 'updated':
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
        break
      case 'age':
      default:
        cmp = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    }
    return asc ? cmp : -cmp
  })

  return sorted
}

export function buildSelectOptions(prs, field) {
  return [...new Set(prs.map((pr) => pr[field]))].sort()
}

export function buildNavCounts({ prs, teamMembers }) {
  const nonBotPRs = prs.filter((pr) => pr.authorType !== 'Bot' && !pr.author.endsWith('[bot]'))

  const teamApproved = (pr) => {
    const latest = {}
    for (const r of (pr.reviews ?? [])) latest[r.user.login] = r.state
    return Object.entries(latest).some(([login, state]) => state === 'APPROVED' && teamMembers.has(login))
  }

  return {
    needsMerging: nonBotPRs.filter((pr) => pr.reviewState === 'APPROVED' && !pr.hasUnreviewedCommits && !pr.draft && teamApproved(pr)).length,
    needsReReview: nonBotPRs.filter((pr) => pr.isReviewed && pr.hasUnreviewedCommits && !pr.draft).length,
    unreviewed: nonBotPRs.filter((pr) => !pr.isReviewed && !pr.draft).length,
    team: nonBotPRs.filter((pr) => teamMembers.has(pr.author) && !pr.draft).length,
    all: nonBotPRs.filter((pr) => !pr.draft).length,
    stale: nonBotPRs.filter((pr) => pr.isStale && !pr.draft).length,
    drafts: nonBotPRs.filter((pr) => pr.draft).length,
  }
}

export function groupByJira(prs) {
  const groups = new Map()
  for (const pr of prs) {
    const key = pr.jiraTicket ?? null
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(pr)
  }
  const result = []
  const ticketKeys = [...groups.keys()].filter((k) => k !== null).sort()
  for (const key of ticketKeys) {
    result.push({ label: key, prs: groups.get(key) })
  }
  if (groups.has(null)) {
    result.push({ label: null, prs: groups.get(null) })
  }
  return result
}

export function groupByField(prs, field) {
  const groups = new Map()
  for (const pr of prs) {
    const key = pr[field]
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(pr)
  }
  return [...groups.keys()].sort().map((key) => ({ label: key, prs: groups.get(key) }))
}

export function buildViewContext(data, basePRs, prs, query, currentPath, title, description, cooldown = false, slackStatus = null, slackEnabled = false) {
  const repos = buildSelectOptions(basePRs, 'repo')
  const authors = buildSelectOptions(basePRs, 'author')

  const formattedPRs = prs.map((pr) => ({
    ...pr,
    ageFormatted: formatAge(pr.createdAt),
    updatedFormatted: formatAge(pr.updatedAt),
  }))

  return {
    title,
    description,
    prs: formattedPRs,
    groups: (() => {
      if (query.groupBy === 'jira' && config.jiraEnabled) return groupByJira(formattedPRs)
      if (query.groupBy === 'author') return groupByField(formattedPRs, 'author')
      if (query.groupBy === 'repo') return groupByField(formattedPRs, 'repo')
      return null
    })(),
    repoItems: [
      { value: '', text: 'All repositories' },
      ...repos.map((r) => ({ value: r, text: r, selected: query.repo === r })),
    ],
    authorItems: [
      { value: '', text: 'All authors' },
      ...authors.map((a) => ({ value: a, text: a, selected: query.author === a })),
    ],
    query,
    fetchedAt: data.fetchedAt,
    fetchedAtFormatted: formatAge(data.fetchedAt),
    navCounts: buildNavCounts(data),
    currentPath,
    cooldown,
    slackStatus,
    slackEnabled,
    org: config.org,
    team: config.team,
    jiraEnabled: config.jiraEnabled,
    jiraBaseUrl: config.jiraBaseUrl,
  }
}
