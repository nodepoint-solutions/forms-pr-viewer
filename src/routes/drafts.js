import { config } from '../config.js'
import { getPRs } from '../services/prs.js'
import { applyFilters, applySort, buildViewContext } from './helpers.js'

export default {
  method: 'GET',
  path: '/drafts',
  options: { validate: { options: { allowUnknown: true }, failAction: 'ignore' } },
  async handler(request, h) {
    const { repo = '', author = '', sort = 'updated', dir = 'desc', groupBy = 'jira', cooldown } = request.query
    const cooldownFlag = cooldown === '1'
    const data = await getPRs()
    const basePRs = data.prs.filter((pr) => pr.draft)
    const prs = applySort(applyFilters(basePRs, { repo, author }), sort, dir)
    return h.view('drafts', buildViewContext(data, prs, prs, { repo, author, sort, dir, groupBy }, '/drafts', 'Drafts', `Draft pull requests across ${config.org}/${config.team} team repositories.`, cooldownFlag))
  },
}
