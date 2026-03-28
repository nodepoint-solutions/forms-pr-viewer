import inert from '@hapi/inert'
import { fileURLToPath } from 'url'
import { join } from 'path'

import indexRoute from '../routes/index.js'
import allRoute from '../routes/all.js'
import staleRoute from '../routes/stale.js'
import unreviewedRoute from '../routes/unreviewed.js'
import needsReReviewRoute from '../routes/needs-re-review.js'
import needsMergingRoute from '../routes/needs-merging.js'
import refreshRoute from '../routes/refresh.js'
import slackSummaryRoute from '../routes/slack-summary.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const publicPath = join(__dirname, '../public')

export default {
  name: 'router',
  async register(server) {
    await server.register(inert)

    // App-specific CSS
    server.route({
      method: 'GET',
      path: '/assets/{param*}',
      handler: { directory: { path: publicPath } },
    })

    // App routes
    server.route([indexRoute, allRoute, staleRoute, unreviewedRoute, needsReReviewRoute, needsMergingRoute, refreshRoute, slackSummaryRoute])
  },
}
