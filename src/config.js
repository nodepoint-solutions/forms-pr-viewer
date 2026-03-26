const {
  PORT = '3000',
  GITHUB_TOKEN,
  CACHE_TTL_MS = '1200000',
  NODE_ENV = 'production',
  SLACK_BOT_TOKEN,
  SLACK_CHANNEL_ID,
} = process.env

if (!GITHUB_TOKEN) {
  throw new Error('GITHUB_TOKEN environment variable is required')
}

export const config = {
  port: parseInt(PORT, 10),
  githubToken: GITHUB_TOKEN,
  cacheTtlMs: parseInt(CACHE_TTL_MS, 10),
  isDevelopment: NODE_ENV === 'development',
  slackBotToken: SLACK_BOT_TOKEN ?? null,
  slackChannelId: SLACK_CHANNEL_ID ?? null,
}
