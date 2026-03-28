import { getPRs } from '../services/prs.js'
import { getDependencies } from '../services/dependencies/index.js'
import { buildNavCounts, formatAge } from './helpers.js'
import { config } from '../config.js'

export default {
  method: 'GET',
  path: '/dependencies',
  handler(request, h) {
    const prData = getPRs()
    const depData = getDependencies()

    const depsView = depData.trackedDependencies.map(({ ecosystem, packageName }) => {
      const key = `${ecosystem}:${packageName}`
      const drifting = []
      const current = []
      let latest = null
      for (const row of depData.rows) {
        const cell = row.deps[key]
        if (!cell || cell.pinned === null) continue
        if (!latest && cell.latest) latest = cell.latest
        if (cell.isDrift) {
          drifting.push({ repo: row.repo, pinned: cell.pinned, latest: cell.latest })
        } else {
          current.push({ repo: row.repo, pinned: cell.pinned })
        }
      }
      return { key, ecosystem, packageName, latest, drifting, current, driftCount: drifting.length }
    })

    const activeKey = request.query.dep ?? depsView[0]?.key ?? null
    const activePanel = depsView.find((d) => d.key === activeKey) ?? depsView[0] ?? null

    return h.view('dependencies', {
      title: 'Dependency Drift',
      currentPath: '/dependencies',
      navCounts: buildNavCounts(prData),
      fetchedAt: prData.fetchedAt,
      org: config.org,
      team: config.team,
      fetchedAtFormatted: formatAge(depData.fetchedAt),
      trackedDependencies: depData.trackedDependencies,
      driftCount: depData.driftCount,
      depsView,
      activeKey,
      activePanel,
    })
  },
}
