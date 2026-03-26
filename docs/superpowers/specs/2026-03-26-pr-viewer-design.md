# PR Viewer — Design Spec

**Date:** 2026-03-26
**Status:** Approved

## Overview

A server-side rendered internal tool for DEFRA forms developers to understand where they can help with code reviews. Built with Hapi.js + Nunjucks + GOV.UK Frontend. Scoped to the `DEFRA/forms` GitHub team. Authenticated via a single shared service PAT (env var `GITHUB_TOKEN`).

---

## Architecture

### Stack

- **Runtime:** Node.js (ES modules, plain JavaScript — no TypeScript)
- **Framework:** `@hapi/hapi` ^21
- **Templating:** `nunjucks` + `@hapi/vision`
- **Static assets:** `@hapi/inert`
- **Design system:** `govuk-frontend` ^5 (macros, components, layout)
- **HTTP client:** native `fetch` (Node 22)
- **Logging:** `hapi-pino`
- **No client-side JavaScript** unless progressive enhancement

### Directory Structure

```
src/
  server.js                — Hapi server, registers all plugins
  config.js                — env vars: PORT, GITHUB_TOKEN, CACHE_TTL_MS
  plugins/
    views.js               — @hapi/vision + Nunjucks, GOV.UK Frontend paths
    router.js              — registers all route modules
    errors.js              — GOV.UK-styled 404 and 500 error pages
  services/
    github.js              — GitHub REST API client (fetch-based)
    cache.js               — single in-memory TTL cache
    prs.js                 — fetches, enriches, and classifies all PR data
  routes/
    index.js               — GET /                (team PRs, no bots)
    all.js                 — GET /all             (all PRs including bots)
    stale.js               — GET /stale           (open > 14 days)
    unreviewed.js          — GET /unreviewed      (zero human reviews)
    needs-re-review.js     — GET /needs-re-review (reviewed, commits since)
    refresh.js             — POST /refresh        (manual cache bust)
  views/
    layout.html            — GOV.UK base layout, service name, side nav
    macros/
      pr-table.html        — reusable PR table macro
      filters.html         — filter/sort form macro
    index.html
    all.html
    stale.html
    unreviewed.html
    needs-re-review.html
    error.html
```

---

## GitHub Data Model & Caching

### PAT Scopes Required

- `read:org` — to read team membership and team repos
- `repo` — to read pull requests and reviews

### Cache Refresh Sequence

On each cache miss (or manual refresh), `prs.js` executes:

1. `GET /orgs/DEFRA/teams/forms/members` — team member logins (used for team filter and bot exclusion)
2. `GET /orgs/DEFRA/teams/forms/repos` — paginated list of team repos
3. For each repo in parallel: `GET /repos/DEFRA/{repo}/pulls?state=open&per_page=100`
4. For each open PR in parallel (rate-limit-aware batching):
   - `GET /repos/DEFRA/{repo}/pulls/{n}/reviews`
   - `GET /repos/DEFRA/{repo}/pulls/{n}/commits`

### Bot Detection

A user is a bot if `user.type === 'Bot'` OR `user.login` ends with `[bot]`.

### Cached Data Shape

```js
{
  fetchedAt: Date,
  teamMembers: Set,        // Set of login strings from DEFRA/forms team
  prs: [
    {
      // From GitHub API
      number, title, url, repo, author, authorType,
      createdAt, updatedAt, draft,

      // Enriched
      reviews,             // non-bot reviews only, chronological
      commits,             // all commits, chronological

      // Computed
      isStale,             // createdAt > 14 days ago
      isReviewed,          // reviews.length > 0
      latestReviewAt,      // Date of most recent non-bot review, or null
      hasUnreviewedCommits // commits exist after latestReviewAt (merge commits excluded)
    }
  ]
}
```

**Cache TTL:** `CACHE_TTL_MS` env var, defaults to 5 minutes.

**Merge commit exclusion:** A commit is a merge commit if `commit.parents.length > 1`. These are excluded when computing `hasUnreviewedCommits`.

**Review state per reviewer:** The most recent review state per reviewer is used (matching GitHub's own behaviour).

---

## Routes & Views

### Side Navigation

Rendered on every page with live counts from cached data. Order reflects priority:

```
Needs re-review     (N)   →  /needs-re-review   [highlighted]
Unreviewed          (N)   →  /unreviewed
Team PRs            (N)   →  /
All PRs             (N)   →  /all
Stale               (N)   →  /stale
```

### Shared Page Structure

Every list page includes:

- GOV.UK page heading with caption "DEFRA/forms team"
- Filter form (plain GET, no JS required):
  - **Repository** select — populated from repos with open PRs in current view
  - **Author** select — populated from authors in current view
  - **Sort by** select: Age | Last updated | Title | Author
  - **Direction** select: Newest first | Oldest first
- "Showing X pull requests" row count
- "Last updated X minutes ago — Refresh" above the table
- PR table
- Empty state: GOV.UK inset text "No pull requests match the current filters." + "Clear filters" link

### PR Table Columns

| Column | Notes |
|---|---|
| Title | Links to GitHub PR |
| Repository | Repo short name |
| Author | GitHub login |
| Age | Human-readable (e.g. "3 days") |
| Last updated | Human-readable |
| Reviews | Count + latest state |
| Status | GOV.UK tags: Draft, Stale, Changes requested, Approved |

### Column Sort Links

Column headers are `<a>` links that carry existing filter params and toggle sort direction. No JS required.

---

## PR Classification Logic

### Team PRs (`/`)

Author login is present in `teamMembers` (fetched from `/orgs/DEFRA/teams/forms/members`). Independent of PAT ownership.

### All PRs (`/all`)

No author filter. Includes bots and external contributors.

### Stale (`/stale`)

`Date.now() - pr.createdAt > 14 * 24 * 60 * 60 * 1000`

Also displayed as a status tag on all other views.

### Unreviewed (`/unreviewed`)

`pr.reviews.filter(non-bot).length === 0` — no review of any kind from a human developer. Draft PRs excluded.

### Needs Re-review (`/needs-re-review`) — highest priority

```
isEligible = pr.isReviewed
          && pr.hasUnreviewedCommits
          && !pr.draft
```

Where `hasUnreviewedCommits` means at least one non-merge commit was pushed after `latestReviewAt`.

---

## Filtering & Sorting

All state in query params. Plain GET form. Browser back/forward works natively.

### Params

| Param | Values |
|---|---|
| `repo` | repo short name, or empty for all |
| `author` | GitHub login, or empty for all |
| `sort` | `age` \| `updated` \| `title` \| `author` |
| `dir` | `asc` \| `desc` |

### Defaults Per View

| View | Default sort | Default direction |
|---|---|---|
| `/needs-re-review` | `age` | `desc` (oldest unaddressed first) |
| All others | `updated` | `desc` (most recently active first) |

### Select Population

Filter selects are populated from the PRs visible in the current view (before filtering), so they never show options that would yield zero results from the base dataset.
