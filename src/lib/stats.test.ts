import { describe, expect, it } from 'vitest'
import type { ClosedTrade } from '@/types'
import { computeStats, dailyPnl, equityCurve, histogram, rMultiple, sharpeFromDaily } from './stats'

const trade = (net: number, over: Partial<ClosedTrade> = {}): ClosedTrade => ({
  id: String(Math.random()), strategy: 's', lane: 'research', symbol: 'X', exchange: 'NSE', action: 'BUY', qty: 1,
  entryDate: '2026-01-01', entryT: '09:30:00', exitDate: '2026-01-01', exitT: '10:00:00', entryPrice: 100, exitPrice: 101,
  stopLoss: null, target: null, initialRisk: 100, reason: 'TARGET_HIT', gross: net + 10, brokerage: 4, stt: 3, exchCharges: 2, gst: 1,
  slippage: 0, net, circuitState: 'NORMAL', status: 'closed', ...over,
})

describe('computeStats', () => {
  it('derives win rate, payoff, profit factor and expectancy', () => {
    const s = computeStats([trade(300), trade(-100), trade(-100), trade(200)])
    expect(s.winRate).toBe(50)
    expect(s.payoff).toBeCloseTo(2.5)
    expect(s.profitFactor).toBeCloseTo(2.5)
    expect(s.expectancy).toBe(75)
    expect(s.costs).toBe(40)
    expect(s.maxLossStreak).toBe(2)
  })

  it('leaves ratios null instead of dividing by zero', () => {
    const s = computeStats([trade(50), trade(70)])
    expect(s.profitFactor).toBeNull()
    expect(s.avgLoss).toBeNull()
    expect(s.payoff).toBeNull()
  })
})

describe('equityCurve', () => {
  it('tracks drawdown from the running high-water mark', () => {
    const c = equityCurve([trade(100), trade(-40), trade(-30), trade(90)])
    expect(c.map((p) => p.equity)).toEqual([100, 60, 30, 120])
    expect(c.map((p) => p.drawdown)).toEqual([0, -40, -70, 0])
  })
})

describe('rMultiple', () => {
  it('is null when no entry risk was recorded', () => {
    expect(rMultiple(trade(50, { initialRisk: null }))).toBeNull()
    expect(rMultiple(trade(150))).toBe(1.5)
  })
})

describe('sharpeFromDaily', () => {
  it('refuses to report on tiny samples', () => {
    expect(sharpeFromDaily([1, 2, 3])).toBeNull()
  })
  it('annualises mean/stdev with sqrt(252)', () => {
    const v = sharpeFromDaily([10, 20, 10, 20, 15, 15])!
    const mean = 15
    const sd = Math.sqrt((25 * 4 + 0 * 2) / 5)
    expect(v).toBeCloseTo((mean / sd) * Math.sqrt(252))
  })
})

describe('dailyPnl', () => {
  it('buckets by exit date', () => {
    const d = dailyPnl([trade(10), trade(5), trade(-3, { exitDate: '2026-01-02' })])
    expect(d).toEqual([
      { date: '2026-01-01', net: 15, gross: 35, count: 2 },
      { date: '2026-01-02', net: -3, gross: 7, count: 1 },
    ])
  })
})

describe('histogram', () => {
  it('includes the right edge in the last bin', () => {
    const h = histogram([-1, -0.5, 0.2, 1], 0.5)
    expect(h.reduce((s, b) => s + b.count, 0)).toBe(4)
  })
})
