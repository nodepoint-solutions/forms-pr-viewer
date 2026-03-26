import { getPRs, isBot } from '../services/prs.js'
import { applyFilters, applySort, buildViewContext } from './helpers.js'

export default {
  method: 'GET',
  path: '/unreviewed',
  options: { validate: { options: { allowUnknown: true }, failAction: 'ignore' } },
  async handler(request, h) {
    const { repo = '', author = '', sort = 'updated', dir = 'desc', cooldown } = request.query
    const cooldownFlag = cooldown === '1'
    const data = await getPRs()
    const basePRs = data.prs.filter((pr) => !pr.isReviewed && !pr.draft && !isBot({ type: pr.authorType, login: pr.author }))
    const prs = applySort(applyFilters(basePRs, { repo, author }), sort, dir)
    return h.view('unreviewed', buildViewContext(data, prs, prs, { repo, author, sort, dir }, '/unreviewed', 'Needs review - All PRs', 'All pull requests across the org that have not received any review.', cooldownFlag))
  },
}
