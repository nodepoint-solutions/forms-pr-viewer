import { getPRs, isBot } from '../services/prs.js'
import { applyFilters, applySort, buildViewContext } from './helpers.js'
import { config } from '../config.js'

export default {
  method: 'GET',
  path: '/',
  async handler(request, h) {
    const { repo = '', author = '', sort = 'updated', dir = 'desc', groupBy = 'jira', cooldown, slack } = request.query
    const cooldownFlag = cooldown === '1'
    const slackEnabled = !!(config.slackBotToken && config.slackChannelId)
    const data = await getPRs()

    const basePRs = data.prs.filter(
      (pr) => data.teamMembers.has(pr.author) && !isBot({ type: pr.authorType, login: pr.author })
    )

    const prs = applySort(applyFilters(basePRs, { repo, author }), sort, dir)

    return h.view('index', buildViewContext(data, prs, prs, { repo, author, sort, dir, groupBy }, '/', 'Needs review - Team PRs', 'Pull requests opened by members of the DEFRA/forms team that need review.', cooldownFlag, slack ?? null, slackEnabled))
  },
}
