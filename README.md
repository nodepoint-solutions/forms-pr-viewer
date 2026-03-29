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
- **Needs merging** — approved PRs that are ready to land
- **Dependency drift** — tracks whether key packages are on their latest version across all team repos
- **Grouped by Jira ticket** — optionally links back to your Jira instance
- **Slack summary** — post a formatted PR digest to a Slack channel on demand or on a schedule (9am UK time, Monday–Friday); security alert summary posts automatically every Monday after the PR digest and can also be triggered manually from the Security tab
- Background cache warming every 20 minutes (configurable)

## Requirements

- Node.js 22+
- A GitHub Personal Access Token with `read:org` and `repo` scopes, authorised for SSO if your org uses it

> **Security tab:** The Security tab (Dependabot alerts) requires the `security_events` scope on the token (or `repo` scope for private repositories). Without it the tab shows no alerts and logs a warning. All other features work without this scope.

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
| `SLACK_CHANNEL_ID` | No | Slack channel ID to post summaries to. Both token and channel ID must be set to enable Slack |
| `SLACK_PR_DAYS` | No | Days to send the PR digest. Comma-separated day numbers (0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday). Default: `1,2,3,4,5` |
| `SLACK_SECURITY_DAYS` | No | Days to send the security alert summary. Same format as `SLACK_PR_DAYS`. Default: `1` |
| `TRACKED_DEPENDENCIES` | No | Comma-separated list of `ecosystem:package` pairs to track on the Dependencies page (e.g. `npm:express,npm:lodash,pypi:requests`) |
| `REQUIRED_TEAM_ROLE` | No | Minimum GitHub team role a repo must have to appear in any view. One of `pull`, `triage`, `push`, `maintain`, `admin`. Default: `admin` |

### Slack summaries

When `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID` are set, two types of summary are available:

**PR digest** — sent Monday–Friday at 9am UK time (Europe/London, DST-aware). Lists PRs that need re-review and PRs awaiting first review, grouped by Jira ticket. Can also be triggered manually from the sidebar.

**Security alert summary** — sent every Monday at 9am UK time, immediately after the PR digest. Shows a count of open Dependabot alerts grouped by severity (Critical / High / Medium / Low) with a link to the Security tab. Can also be triggered manually from the Security tab.

The days each summary fires can be changed with `SLACK_PR_DAYS` and `SLACK_SECURITY_DAYS`. An empty value disables that summary's scheduled sends entirely.

Both summaries include a link back to the dashboard if `APP_URL` is set, and respect a one-hour cooldown when triggered manually.

### Dependency drift tracking

The `/dependencies` page shows whether each tracked package is on its latest published version across all team repos. It supports npm (`package.json`) and PyPI (`requirements.txt`).

Set `TRACKED_DEPENDENCIES` to a comma-separated list of `ecosystem:package` pairs:

```bash
TRACKED_DEPENDENCIES=npm:express,npm:lodash,pypi:requests,pypi:boto3
```

Each cell in the matrix shows the pinned version in that repo. Cells highlighted in amber are behind the latest version; a `—` means the package isn't present in that repo at all.

Results are cached alongside the PR data and cleared when you hit **Refresh**.

### Repo filtering

Only repositories where the configured team has the required role are included. The role is controlled by `REQUIRED_TEAM_ROLE` (default: `admin`). Valid values mirror GitHub's team permission levels: `pull`, `triage`, `push`, `maintain`, `admin`. Repos below the configured threshold are excluded from all views.

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
