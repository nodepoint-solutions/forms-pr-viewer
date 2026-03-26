import { getPRs, isBot } from '../services/prs.js'
import { applyFilters, applySort, buildViewContext } from './helpers.js'

export default {
  method: 'GET',
  path: '/needs-re-review',
  options: { validate: { options: { allowUnknown: true }, failAction: 'ignore' } },
  async handler(request, h) {
    const { repo = '', author = '', sort = 'age', dir = 'desc', cooldown } = request.query
    const cooldownFlag = cooldown === '1'
    const data = await getPRs()
    const basePRs = data.prs.filter((pr) => pr.isReviewed && pr.hasUnreviewedCommits && !pr.draft && !isBot({ type: pr.authorType, login: pr.author }))
    const prs = applySort(applyFilters(basePRs, { repo, author }), sort, dir)
    return h.view('needs-re-review', buildViewContext(data, prs, prs, { repo, author, sort, dir }, '/needs-re-review', 'Needs re-review', 'Pull requests that were reviewed but have had new commits pushed since.', cooldownFlag))
  },
}
