import inert from '@hapi/inert'
import { fileURLToPath } from 'url'
import { join } from 'path'

import indexRoute from '../routes/index.js'
import allRoute from '../routes/all.js'
import staleRoute from '../routes/stale.js'
import unreviewedRoute from '../routes/unreviewed.js'
import needsReReviewRoute from '../routes/needs-re-review.js'
import refreshRoute from '../routes/refresh.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const govukDistPath = join(__dirname, '../../node_modules/govuk-frontend/dist/govuk')
const publicPath = join(__dirname, '../public')

export default {
  name: 'router',
  async register(server) {
    await server.register(inert)

    // GOV.UK Frontend assets (CSS, JS, fonts, images)
    server.route({
      method: 'GET',
      path: '/public/{param*}',
      handler: { directory: { path: govukDistPath } },
    })

    // App-specific CSS
    server.route({
      method: 'GET',
      path: '/assets/{param*}',
      handler: { directory: { path: publicPath } },
    })

    // App routes
    server.route([indexRoute, allRoute, staleRoute, unreviewedRoute, needsReReviewRoute, refreshRoute])
  },
}
