import { warmPrCache } from './prs.js'
import { warmDependencyCache } from './dependencies/index.js'
import { config } from '../config.js'

const MAX_ATTEMPTS = 8
const DAY_NAMES = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function startScheduler({ skipInitial = false } = {}) {
  let running = false

  const warm = async () => {
    if (running) return
    running = true
    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          await Promise.all([warmPrCache(), warmDependencyCache()])
          break
        } catch (err) {
          if (attempt === MAX_ATTEMPTS) {
            console.error(`Cache warm failed after ${MAX_ATTEMPTS} attempts:`, err.message)
            break
          }
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 60_000)
          console.error(`Cache warm attempt ${attempt} failed, retrying in ${delayMs / 1000}s:`, err.message)
          await new Promise((resolve) => setTimeout(resolve, delayMs))
        }
      }
    } finally {
      running = false
    }
  }

  if (!skipInitial) warm()

  const id = setInterval(warm, config.cacheTtlMs)

  return () => clearInterval(id)
}

// Returns ms until the next 9am in Europe/London, DST-safe.
function msUntilNext9amUK() {
  const now = new Date()
  const londonDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now)

  // Probe 9am UTC on the London calendar date, then correct for the London offset
  const correct9am = (dateStr) => {
    const probe = new Date(`${dateStr}T09:00:00Z`)
    const londonHour = parseInt(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(probe)
    )
    return new Date(probe.getTime() - (londonHour - 9) * 3_600_000)
  }

  let target = correct9am(londonDateStr)

  if (target <= now) {
    const tomorrow = new Date(now.getTime() + 86_400_000)
    const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(tomorrow)
    target = correct9am(tomorrowStr)
  }

  return target.getTime() - now.getTime()
}

export function startSlackScheduler(fn) {
  function schedule() {
    const ms = msUntilNext9amUK()
    setTimeout(async () => {
      try {
        await fn()
      } catch (err) {
        console.error('Slack scheduler: send failed —', err.message)
      }
      schedule()
    }, ms)
  }
  schedule()
}

export function isTodayInDaysUK(days) {
  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London',
    weekday: 'short',
  }).format(new Date())
  return days.has(DAY_NAMES[dayName])
}
