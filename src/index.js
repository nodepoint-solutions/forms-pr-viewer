import { createServer } from './server.js'
import { warmCache } from './services/prs.js'
import { startScheduler, startSlackScheduler } from './services/scheduler.js'
import { sendSlackSummary } from './services/slack.js'
import { config } from './config.js'

// Warm cache before accepting any requests — start anyway if it fails so users see an error
try {
  await warmCache()
} catch (err) {
  console.error('Startup cache warm failed:', err.message)
}

const server = await createServer()
await server.start()

server.logger.info(`Server running at ${server.info.uri}`)

// Interval refresh — skip immediate warm since we just did one above
startScheduler({ skipInitial: true })

// Daily Slack summary at 9am UK time
if (config.slackBotToken && config.slackChannelId) {
  startSlackScheduler(sendSlackSummary)
  server.logger.info('Slack daily summary scheduled at 09:00 Europe/London')
}
