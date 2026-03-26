import vision from '@hapi/vision'
import nunjucks from 'nunjucks'
import { fileURLToPath } from 'url'
import { join } from 'path'
import { config } from '../config.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const viewsPath = join(__dirname, '../views')
const govukPath = join(__dirname, '../../node_modules/govuk-frontend/dist')

export default {
  name: 'views',
  async register(server) {
    await server.register(vision)

    const env = nunjucks.configure([viewsPath, govukPath], {
      autoescape: true,
      watch: config.isDevelopment,
      noCache: config.isDevelopment,
    })

    server.views({
      engines: {
        html: {
          compile(src) {
            const template = nunjucks.compile(src, env)
            return (context) => template.render(context)
          },
        },
      },
      path: viewsPath,
      isCached: !config.isDevelopment,
    })
  },
}
