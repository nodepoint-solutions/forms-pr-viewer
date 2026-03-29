import { getPRs } from '../services/prs.js'
import { getSecurityAlerts } from '../services/dependencies/index.js'
import { buildNavCounts, formatAge } from './helpers.js'
import { config } from '../config.js'

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low']

export default {
  method: 'GET',
  path: '/security',
  handler(request, h) {
    const prData = getPRs()
    const { alerts, alertCount, fetchedAt } = getSecurityAlerts()

    const byRepo = new Map()
    for (const alert of alerts) {
      if (!byRepo.has(alert.repo)) byRepo.set(alert.repo, [])
      byRepo.get(alert.repo).push(alert)
    }

    const repoAlerts = [...byRepo.entries()]
      .map(([repo, repoAlerts]) => ({
        repo,
        alerts: [...repoAlerts].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)),
      }))
      .sort((a, b) => a.repo.localeCompare(b.repo))

    return h.view('security', {
      title: 'Security',
      currentPath: '/security',
      navCounts: buildNavCounts(prData),
      alertCount,
      fetchedAt: prData.fetchedAt,
      fetchedAtFormatted: fetchedAt ? formatAge(fetchedAt) : '—',
      repoAlerts,
      org: config.org,
      team: config.team,
    })
  },
}
