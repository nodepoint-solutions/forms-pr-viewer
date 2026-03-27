const {
  PORT = '3000',
  GITHUB_TOKEN,
  GITHUB_ORG,
  GITHUB_TEAM,
  JIRA_TICKET_PATTERN = 'DF-\\d+',
  JIRA_BASE_URL,
  APP_URL,
  CACHE_TTL_MS = '1200000',
  NODE_ENV = 'production',
  SLACK_BOT_TOKEN,
  SLACK_CHANNEL_ID,
} = process.env

if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN environment variable is required')
if (!GITHUB_ORG) throw new Error('GITHUB_ORG environment variable is required')
if (!GITHUB_TEAM) throw new Error('GITHUB_TEAM environment variable is required')

export const config = {
  port: parseInt(PORT, 10),
  githubToken: GITHUB_TOKEN,
  org: GITHUB_ORG,
  team: GITHUB_TEAM,
  jiraTicketPattern: JIRA_TICKET_PATTERN,
  jiraBaseUrl: JIRA_BASE_URL ?? null,
  appUrl: APP_URL ?? null,
  cacheTtlMs: parseInt(CACHE_TTL_MS, 10),
  isDevelopment: NODE_ENV === 'development',
  slackBotToken: SLACK_BOT_TOKEN ?? null,
  slackChannelId: SLACK_CHANNEL_ID ?? null,
}
