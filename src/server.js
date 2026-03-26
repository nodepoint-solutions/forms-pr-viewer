import hapi from '@hapi/hapi'
import hapiPino from 'hapi-pino'
import vision from '@hapi/vision'
import nunjucks from 'nunjucks'
import { fileURLToPath } from 'url'
import { join } from 'path'
import { config } from './config.js'
import routerPlugin from './plugins/router.js'
import errorsPlugin from './plugins/errors.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const viewsPath = join(__dirname, 'views')
const govukPath = join(__dirname, '../node_modules/govuk-frontend/dist')

export async function createServer() {
  const server = hapi.server({
    port: config.port,
    host: '0.0.0.0',
    router: { stripTrailingSlash: true },
    routes: {
      security: { xss: 'enabled', noSniff: true, xframe: true },
    },
  })

  await server.register({
    plugin: hapiPino,
    options: {
      logEvents: config.isDevelopment ? ['response', 'request-error'] : ['request-error'],
      redact: ['req.headers.authorization'],
    },
  })

  // Register vision at root level — all plugin realms can walk up and find it
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

  await server.register(routerPlugin)
  await server.register(errorsPlugin)

  return server
}
