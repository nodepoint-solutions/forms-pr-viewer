import { config } from '../config.js'
import { getPRs, isBot } from './prs.js'

let lastSentAt = null

export function wasAlreadySentToday() {
  if (!lastSentAt) return false
  const fmt = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d)
  return fmt(new Date()) === fmt(lastSentAt)
}

function ageText(date) {
  const ms = Date.now() - new Date(date).getTime()
  const hours = Math.floor(ms / 3_600_000)
  const days = Math.floor(ms / 86_400_000)
  const weeks = Math.floor(ms / (7 * 86_400_000))
  if (hours < 24) return `${hours}h`
  if (days < 14) return `${days}d`
  return `${weeks}w`
}

function groupByJira(prs) {
  const groups = new Map()
  for (const pr of prs) {
    const key = pr.jiraTicket ?? null
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(pr)
  }
  const result = []
  for (const key of [...groups.keys()].filter((k) => k !== null).sort()) {
    result.push({ label: key, prs: groups.get(key) })
  }
  if (groups.has(null)) result.push({ label: null, prs: groups.get(null) })
  return result
}

export function buildSlackBlocks() {
  const { prs, teamMembers, fetchedAt } = getPRs()

  const needsReReview = prs.filter(
    (pr) => pr.isReviewed && pr.hasUnreviewedCommits && !pr.draft && !isBot({ type: pr.authorType, login: pr.author })
  )
  const awaitingReview = prs.filter(
    (pr) => !pr.isReviewed && !pr.draft && teamMembers.has(pr.author)
  )

  const dateStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date())

  const blocks = []

  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: `PR Review — ${dateStr}`, emoji: true },
  })

  const MAX_LINES = 20
  let linesLeft = MAX_LINES
  const totalPRs = needsReReview.length + awaitingReview.length
  const truncated = totalPRs > MAX_LINES

  if (needsReReview.length > 0) {
    const lines = [`:arrows_counterclockwise: *Needs re-review* (${needsReReview.length}) — reviewed but new commits pushed since`]
    for (const pr of needsReReview) {
      if (linesLeft === 0) break
      const ticket = pr.jiraTicket ? `${pr.jiraTicket} · ` : ''
      lines.push(`• \`${pr.repo}\` — ${pr.title} · ${ticket}@${pr.author} · ${ageText(pr.createdAt)}`)
      linesLeft--
    }
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } })
    blocks.push({ type: 'divider' })
  }

  if (awaitingReview.length > 0 && linesLeft > 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `:eyes: *Awaiting first review* (${awaitingReview.length})` },
    })

    for (const group of groupByJira(awaitingReview)) {
      if (linesLeft === 0) break
      const label = group.label ?? 'No ticket'
      const lines = [`*${label}* (${group.prs.length})`]
      for (const pr of group.prs) {
        if (linesLeft === 0) break
        lines.push(`• \`${pr.repo}\` — ${pr.title} · @${pr.author} · ${ageText(pr.createdAt)}`)
        linesLeft--
      }
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } })
    }

    blocks.push({ type: 'divider' })
  }

  if (truncated) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `_${totalPRs - MAX_LINES} more PR${totalPRs - MAX_LINES !== 1 ? 's' : ''} not shown — <https://forms-pulls.apps.nodepoint.co.uk|see app for full list>_` },
    })
  }

  const fetchedNote = fetchedAt
    ? `data from ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }).format(fetchedAt)}`
    : 'cache not warmed'

  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: `<https://forms-pulls.apps.nodepoint.co.uk|Full report> · ${fetchedNote}`,
    }],
  })

  const fallbackText = `PR Review — ${dateStr}: ${needsReReview.length} need re-review, ${awaitingReview.length} awaiting first review. https://forms-pulls.apps.nodepoint.co.uk`

  return { blocks, text: fallbackText }
}

export async function sendSlackSummary() {
  if (!config.slackBotToken || !config.slackChannelId) {
    throw new Error('SLACK_BOT_TOKEN or SLACK_CHANNEL_ID not configured')
  }

  const { blocks, text } = buildSlackBlocks()

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${config.slackBotToken}`,
    },
    body: JSON.stringify({ channel: config.slackChannelId, text, blocks }),
  })

  const result = await response.json()
  if (!result.ok) throw new Error(`Slack API error: ${result.error}`)

  lastSentAt = new Date()
  return result
}
