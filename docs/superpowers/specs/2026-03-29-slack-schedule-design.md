# Configurable Slack Schedule

**Date:** 2026-03-29

## Overview

Add two environment variables that control which days of the week each Slack summary fires. The PR digest defaults to Monday–Friday; the security summary defaults to Monday only. Both continue to fire at 09:00 Europe/London.

## Problem

The current scheduler sends the PR digest every day of the week (including weekends) and hardcodes the security summary to Mondays via an `isMondayUK()` check in `index.js`. Neither is configurable without changing code.

## Design

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SLACK_PR_DAYS` | `1,2,3,4,5` | Days to send the PR digest (0 = Sun, 1 = Mon … 6 = Sat) |
| `SLACK_SECURITY_DAYS` | `1` | Days to send the security summary |

Values are comma-separated integers. Invalid entries are silently ignored. An empty string disables the summary entirely.

**Examples:**

```
# Mon–Fri PRs, Monday security (defaults)
SLACK_PR_DAYS=1,2,3,4,5
SLACK_SECURITY_DAYS=1

# PRs every day including weekends
SLACK_PR_DAYS=0,1,2,3,4,5,6

# Security on Monday and Thursday
SLACK_SECURITY_DAYS=1,4

# Disable PR digest
SLACK_PR_DAYS=
```

### Changes

**`src/config.js`**

Parse each env var into a `Set<number>`. Invalid tokens are dropped; values outside 0–6 are dropped.

```js
function parseDays(raw, defaults) {
  if (raw === undefined) return new Set(defaults)
  return new Set(
    raw.split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  )
}

slackPrDays: parseDays(SLACK_PR_DAYS, [1, 2, 3, 4, 5]),
slackSecurityDays: parseDays(SLACK_SECURITY_DAYS, [1]),
```

**`src/services/scheduler.js`**

Replace `isMondayUK()` with a general utility and export it:

```js
export function isTodayInDaysUK(days) {
  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London',
    weekday: 'short',
  }).format(new Date())
  const dayNum = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[dayName]
  return days.has(dayNum)
}
```

Day numbers follow the JS convention: 0 = Sunday, 1 = Monday … 6 = Saturday.

**`src/index.js`**

Replace the hardcoded `isMondayUK()` call with `isTodayInDaysUK`:

```js
startSlackScheduler(async () => {
  if (isTodayInDaysUK(config.slackPrDays)) {
    await sendSlackSummary()
  }
  if (isTodayInDaysUK(config.slackSecurityDays)) {
    await sendSecuritySlackSummary()
  }
})
```

Security always runs after PRs on days they share (e.g. Monday), because they are awaited sequentially.

### Documentation

Update `README.md` to document `SLACK_PR_DAYS` and `SLACK_SECURITY_DAYS` alongside the existing Slack variables. The README must list the day-number mapping explicitly (don't assume readers know Sunday = 0):

```
0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday
```

## Testing

- Unit-test `parseDays` for: defaults when undefined, empty string → empty set, invalid tokens dropped, out-of-range dropped, valid range 0–6.
- Unit-test `isTodayInDaysUK` by mocking `Date` to a known weekday and asserting membership.
- Existing scheduler tests are unaffected (they don't touch Slack scheduling).

## Non-goals

- No support for hour-level overrides (time is always 09:00 Europe/London).
- No separate Slack channels per summary type.
- No cron-syntax env vars — simple day lists are sufficient.
