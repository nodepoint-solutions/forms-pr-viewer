import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'

jest.unstable_mockModule('../../src/config.js', () => ({
  config: { port: 3000, githubToken: 'test', cacheTtlMs: 60000, isDevelopment: false },
}))

const mockWarmPrCache = jest.fn().mockResolvedValue({})
jest.unstable_mockModule('../../src/services/prs.js', () => ({
  warmPrCache: mockWarmPrCache,
  getPRs: jest.fn(),
}))

const mockWarmDependencyCache = jest.fn().mockResolvedValue({})
jest.unstable_mockModule('../../src/services/dependencies/index.js', () => ({
  warmDependencyCache: mockWarmDependencyCache,
  getDependencies: jest.fn(),
}))

const { startScheduler, isTodayInDaysUK } = await import('../../src/services/scheduler.js')

describe('startScheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockWarmPrCache.mockClear()
    mockWarmDependencyCache.mockClear()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('warms cache immediately when skipInitial is false', async () => {
    const stop = startScheduler()
    await Promise.resolve()
    expect(mockWarmPrCache).toHaveBeenCalledTimes(1)
    expect(mockWarmDependencyCache).toHaveBeenCalledTimes(1)
    stop()
  })

  it('skips initial warm when skipInitial is true', async () => {
    const stop = startScheduler({ skipInitial: true })
    await Promise.resolve()
    expect(mockWarmPrCache).toHaveBeenCalledTimes(0)
    expect(mockWarmDependencyCache).toHaveBeenCalledTimes(0)
    stop()
  })

  it('warms cache again after interval', async () => {
    const stop = startScheduler({ skipInitial: true })
    jest.advanceTimersByTime(60000)
    await Promise.resolve()
    expect(mockWarmPrCache).toHaveBeenCalledTimes(1)
    expect(mockWarmDependencyCache).toHaveBeenCalledTimes(1)
    stop()
  })

  it('returned function stops the interval', async () => {
    const stop = startScheduler({ skipInitial: true })
    stop()
    jest.advanceTimersByTime(60000)
    await Promise.resolve()
    expect(mockWarmPrCache).toHaveBeenCalledTimes(0)
    expect(mockWarmDependencyCache).toHaveBeenCalledTimes(0)
    stop()
  })
})

describe('isTodayInDaysUK', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('returns true when today (Europe/London) is in the days set', () => {
    // 2024-01-08 12:00 UTC = Monday in London (GMT, no DST offset)
    jest.setSystemTime(new Date('2024-01-08T12:00:00Z'))
    expect(isTodayInDaysUK(new Set([1]))).toBe(true)
  })

  it('returns false when today is not in the days set', () => {
    // 2024-01-07 12:00 UTC = Sunday in London
    jest.setSystemTime(new Date('2024-01-07T12:00:00Z'))
    expect(isTodayInDaysUK(new Set([1, 2, 3, 4, 5]))).toBe(false)
  })

  it('returns false for an empty set', () => {
    jest.setSystemTime(new Date('2024-01-08T12:00:00Z'))
    expect(isTodayInDaysUK(new Set())).toBe(false)
  })

  it('handles Sunday (0) correctly', () => {
    // 2024-01-07 12:00 UTC = Sunday
    jest.setSystemTime(new Date('2024-01-07T12:00:00Z'))
    expect(isTodayInDaysUK(new Set([0]))).toBe(true)
  })

  it('handles Saturday (6) correctly', () => {
    // 2024-01-06 12:00 UTC = Saturday
    jest.setSystemTime(new Date('2024-01-06T12:00:00Z'))
    expect(isTodayInDaysUK(new Set([6]))).toBe(true)
  })
})
