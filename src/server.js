import hapi from '@hapi/hapi'
import hapiPino from 'hapi-pino'
import { config } from './config.js'
import viewsPlugin from './plugins/views.js'
import routerPlugin from './plugins/router.js'
import errorsPlugin from './plugins/errors.js'

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

  await server.register(viewsPlugin)
  await server.register(routerPlugin)
  await server.register(errorsPlugin)

  return server
}
