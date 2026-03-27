# GitHub Team Pull Viewer

[![CI](https://github.com/nodepoint-solutions/github-team-pr-viewer/actions/workflows/ci.yml/badge.svg)](https://github.com/nodepoint-solutions/github-team-pr-viewer/actions/workflows/ci.yml)
[![Publish Docker image](https://github.com/nodepoint-solutions/github-team-pr-viewer/actions/workflows/publish.yml/badge.svg)](https://github.com/nodepoint-solutions/github-team-pr-viewer/actions/workflows/publish.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)

A self-hosted dashboard that shows open pull requests for a GitHub team. It surfaces PRs that need review, PRs that have been reviewed but have new commits since, and stale PRs — filtered to repos where the team has admin ownership.

![Dashboard screenshot](docs/screenshot.png)

## Features

- **Needs re-review** — PRs that were reviewed but have new commits pushed since
- **Team PRs** — open PRs authored by team members awaiting first review
- **All PRs** — every open PR across team-owned repos
- **Stale PRs** — PRs with no activity in the last 14 days
- **Grouped by Jira ticket** — optionally links back to your Jira instance
- **Slack summary** — post a formatted PR digest to a Slack channel on demand
- Background cache warming every 20 minutes (configurable)

## Requirements

- Node.js 22+
- A GitHub Personal Access Token with `read:org` and `repo` scopes, authorised for SSO if your org uses it

## Getting started

```bash
cp .env.example .env
# edit .env with your values
npm install
npm start
```

The app will be available at `http://localhost:3000`.

## Configuration

All configuration is via environment variables. Copy `.env.example` to `.env` and fill in the values.

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | Yes | Personal access token with `read:org` and `repo` scopes |
| `GITHUB_ORG` | Yes | GitHub organisation name |
| `GITHUB_TEAM` | Yes | Team slug within the org |
| `JIRA_TICKET_PATTERN` | No | Regex pattern to extract ticket refs from PR titles/branches (e.g. `ABC-\d+`). Must be set together with `JIRA_BASE_URL` |
| `JIRA_BASE_URL` | No | Base URL for Jira links, no trailing slash (e.g. `https://yourorg.atlassian.net/browse`). Must be set together with `JIRA_TICKET_PATTERN` |
| `APP_URL` | No | Public URL of this app. Used in Slack message footers |
| `PORT` | No | Server port. Default: `3000` |
| `CACHE_TTL_MS` | No | Cache TTL in milliseconds. Default: `1200000` (20 minutes) |
| `SLACK_BOT_TOKEN` | No | Slack bot token (`xoxb-…`) to enable Slack summaries |
| `SLACK_CHANNEL_ID` | No | Slack channel ID to post summaries to |

### Repo filtering

Only repositories where the configured team has **admin** permissions are included. Repos where the team has write-only access are excluded.

## Docker

```bash
docker build -t pr-viewer .
docker run -p 3000:3000 --env-file .env pr-viewer
```

A pre-built image is published to GitHub Container Registry on every push to `main`:

```bash
docker pull ghcr.io/nodepoint-solutions/github-team-pr-viewer:latest
```

## Tech stack

This was originally built for a development team within [@defra](https://github.com/defra), so it reflects their standard stack:

- **[Hapi](https://hapi.dev/)** — Node.js web framework
- **[Nunjucks](https://mozilla.github.io/nunjucks/)** — server-side HTML templating
- **[hapi-pino](https://github.com/pinojs/hapi-pino)** — structured request logging

## Development

```bash
npm run dev   # starts with file watching
npm test      # run tests
```
