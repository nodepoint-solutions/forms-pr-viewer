import { getPRs } from '../services/prs.js'
import { buildNavCounts } from './helpers.js'
import { config } from '../config.js'

export default {
  method: 'GET',
  path: '/about',
  handler(request, h) {
    const prData = getPRs()
    return h.view('about', {
      title: 'About',
      currentPath: '/about',
      navCounts: buildNavCounts(prData),
      fetchedAt: prData.fetchedAt,
      slackAction: '/slack-summary',
      org: config.org,
      team: config.team,
    })
  },
}
