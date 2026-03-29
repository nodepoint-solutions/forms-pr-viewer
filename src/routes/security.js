import { getPRs } from '../services/prs.js'
import { getSecurityAlerts } from '../services/dependencies/index.js'
import { buildNavCounts, formatAge } from './helpers.js'
import { config } from '../config.js'

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low']
const SEVERITY_LABELS = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }

export default {
  method: 'GET',
  path: '/security',
  handler(request, h) {
    const prData = getPRs()
    const { alerts, alertCount, fetchedAt } = getSecurityAlerts()
    const groupBy = request.query.groupBy === 'repo' ? 'repo' : 'severity'
    const slackEnabled = !!(config.slackBotToken && config.slackChannelId)
    const slackStatus = request.query.slack ?? null

    let alertGroups

    if (groupBy === 'severity') {
      const bySeverity = new Map()
      for (const sev of SEVERITY_ORDER) bySeverity.set(sev, [])
      for (const alert of alerts) {
        const key = SEVERITY_ORDER.includes(alert.severity) ? alert.severity : 'low'
        bySeverity.get(key).push(alert)
      }
      alertGroups = SEVERITY_ORDER
        .filter((sev) => bySeverity.get(sev).length > 0)
        .map((sev) => ({
          label: SEVERITY_LABELS[sev],
          severity: sev,
          alerts: [...bySeverity.get(sev)].sort((a, b) => a.repo.localeCompare(b.repo) || a.package.localeCompare(b.package)),
        }))
    } else {
      const byRepo = new Map()
      for (const alert of alerts) {
        if (!byRepo.has(alert.repo)) byRepo.set(alert.repo, [])
        byRepo.get(alert.repo).push(alert)
      }
      alertGroups = [...byRepo.entries()]
        .map(([repo, repoAlerts]) => ({
          label: repo,
          alerts: [...repoAlerts].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)),
        }))
        .sort((a, b) => a.label.localeCompare(b.label))
    }

    return h.view('security', {
      title: 'Security',
      currentPath: '/security',
      navCounts: buildNavCounts(prData),
      alertCount,
      fetchedAt: prData.fetchedAt,
      fetchedAtFormatted: fetchedAt ? formatAge(fetchedAt) : '—',
      alertGroups,
      groupBy,
      slackEnabled,
      slackStatus,
      slackAction: '/security-slack-summary',
      org: config.org,
      team: config.team,
    })
  },
}
