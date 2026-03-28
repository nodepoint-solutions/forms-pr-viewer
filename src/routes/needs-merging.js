import { getPRs, isBot } from '../services/prs.js'
import { applyFilters, applySort, buildViewContext } from './helpers.js'

export default {
  method: 'GET',
  path: '/needs-merging',
  options: { validate: { options: { allowUnknown: true }, failAction: 'ignore' } },
  async handler(request, h) {
    const { repo = '', author = '', sort = 'updated', dir = 'desc', groupBy = 'jira', cooldown } = request.query
    const cooldownFlag = cooldown === '1'
    const data = await getPRs()

    const teamApproved = (pr) => {
      const latest = {}
      for (const r of pr.reviews) latest[r.user.login] = r.state
      return Object.entries(latest).some(([login, state]) => state === 'APPROVED' && data.teamMembers.has(login))
    }

    const basePRs = data.prs.filter(
      (pr) =>
        pr.reviewState === 'APPROVED' &&
        !pr.hasUnreviewedCommits &&
        !pr.draft &&
        !isBot({ type: pr.authorType, login: pr.author }) &&
        teamApproved(pr)
    )
    const prs = applySort(applyFilters(basePRs, { repo, author }), sort, dir)
    return h.view('needs-merging', buildViewContext(data, prs, prs, { repo, author, sort, dir, groupBy }, '/needs-merging', 'Needs merging', 'Pull requests that have been approved by a team member and are ready to merge.', cooldownFlag))
  },
}
