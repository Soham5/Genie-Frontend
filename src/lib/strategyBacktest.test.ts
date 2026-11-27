import { describe, expect, it } from 'vitest'
import {
  buildRequest,
  csvCell,
  csvFilename,
  dailyToCsv,
  DEFAULT_FORM,
  describeSlippage,
  defaultCustomRange,
  dayKind,
  extremeDays,
  fmtIsoDay,
  fmtIsoShort,
  fmtIsoTick,
  groupTrades,
  MAX_STRATEGIES,
  monthCalendars,
  niceAxis,
  parseAmount,
  ringAmount,
  strategyRows,
  tradesToCsv,
  type BacktestForm,
  type DayRow,
  type StrategyRun,
  type TradeRow,
} from './strategyBacktest'

const TODAY = '2025-06-15'
const form = (patch: Partial<BacktestForm> = {}): BacktestForm => ({ ...DEFAULT_FORM, strategyIds: ['alpha'], ...patch })

const day = (date: string, pnl: number): DayRow => ({ date, pnl, cumulative_pnl: pnl, drawdown: 0, trades: 1, win_trades: pnl > 0 ? 1 : 0, loss_trades: pnl < 0 ? 1 : 0 })

const trade = (patch: Partial<TradeRow> = {}): TradeRow => ({
  date: '2025-05-20',
  strategy_id: 'alpha',
  symbol: 'NIFTY',
  action: 'BUY',
  quantity: 50,
  entry_time: '2025-05-20T09:20:00',
  exit_time: '2025-05-20T10:05:00',
  entry_price: 100,
  exit_price: 110,
  gross_pnl: 500,
  net_pnl: 450,
  slippage_cost: 30,
  brokerage_cost: 20,
  exit_reason: 'target',
  ...patch,
})

describe('parseAmount', () => {
  it('accepts plain, grouped and rupee-prefixed numbers', () => {
    expect(parseAmount('1,00,000')).toBe(100000)
    expect(parseAmount('₹ 2500.5')).toBe(2500.5)
    expect(parseAmount('0')).toBe(0)
  })

  it('rejects empty and non-numeric text', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('Infinity')).toBeNull()
  })
})

describe('buildRequest', () => {
  it('builds a preset request with the default slippage and no capital', () => {
    expect(buildRequest(form(), TODAY)).toEqual({
      ok: true,
      request: {
        strategy_ids: ['alpha'],
        period: '1Y',
        slippage: { mode: 'default', value: 0 },
        initial_capital: 0,
        risk_stack_enabled: true,
      },
    })
  })

  it('requires a strategy and caps the selection', () => {
    expect(buildRequest(form({ strategyIds: [] }), TODAY)).toMatchObject({ ok: false, errors: ['Select at least one strategy.'] })
    const many = Array.from({ length: MAX_STRATEGIES + 1 }, (_, i) => `s${i}`)
    expect(buildRequest(form({ strategyIds: many }), TODAY)).toMatchObject({ ok: false, errors: [`Select at most ${MAX_STRATEGIES} strategies per run.`] })
  })

  it('sends dates only for the custom range and validates them', () => {
    const ok = buildRequest(form({ range: 'custom', startDate: '2025-01-01', endDate: '2025-02-01' }), TODAY)
    expect(ok).toMatchObject({ ok: true, request: { period: 'custom', start_date: '2025-01-01', end_date: '2025-02-01' } })

    expect(buildRequest(form({ range: 'custom' }), TODAY)).toMatchObject({ ok: false, errors: ['Pick both a start and an end date.'] })
    expect(buildRequest(form({ range: 'custom', startDate: '2025-03-01', endDate: '2025-02-01' }), TODAY)).toMatchObject({
      ok: false,
      errors: ['The start date must be on or before the end date.'],
    })
    expect(buildRequest(form({ range: 'custom', startDate: '2025-06-01', endDate: '2025-06-16' }), TODAY)).toMatchObject({
      ok: false,
      errors: ['The end date cannot be in the future.'],
    })
    expect(buildRequest(form({ range: 'custom', startDate: '2025-06-01', endDate: TODAY }), TODAY).ok).toBe(true)
  })

  it('ignores stale custom dates when a preset is selected', () => {
    const r = buildRequest(form({ range: '3M', startDate: '2030-01-01', endDate: '2020-01-01' }), TODAY)
    expect(r.ok && r.request).not.toHaveProperty('start_date')
    expect(r.ok).toBe(true)
  })

  it('validates slippage values per mode', () => {
    expect(buildRequest(form({ slippage: 'none', slippageValue: 'junk' }), TODAY)).toMatchObject({ ok: true, request: { slippage: { mode: 'none', value: 0 } } })
    expect(buildRequest(form({ slippage: 'percent', slippageValue: '0.25' }), TODAY)).toMatchObject({ ok: true, request: { slippage: { mode: 'percent', value: 0.25 } } })
    expect(buildRequest(form({ slippage: 'points', slippageValue: '1.5' }), TODAY)).toMatchObject({ ok: true, request: { slippage: { mode: 'points', value: 1.5 } } })
    expect(buildRequest(form({ slippage: 'percent', slippageValue: '' }), TODAY)).toMatchObject({ ok: false, errors: ['Enter a slippage value of 0 or more.'] })
    expect(buildRequest(form({ slippage: 'points', slippageValue: '-1' }), TODAY)).toMatchObject({ ok: false, errors: ['Enter a slippage value of 0 or more.'] })
    expect(buildRequest(form({ slippage: 'percent', slippageValue: '101' }), TODAY)).toMatchObject({ ok: false, errors: ['Percent slippage cannot exceed 100.'] })
    expect(buildRequest(form({ slippage: 'points', slippageValue: '101' }), TODAY).ok).toBe(true)
  })

  it('parses initial capital and rejects bad amounts', () => {
    expect(buildRequest(form({ initialCapital: '5,00,000' }), TODAY)).toMatchObject({ ok: true, request: { initial_capital: 500000 } })
    expect(buildRequest(form({ initialCapital: '-5' }), TODAY)).toMatchObject({ ok: false, errors: ['Initial capital must be a number of 0 or more.'] })
    expect(buildRequest(form({ initialCapital: 'lots' }), TODAY)).toMatchObject({ ok: false, errors: ['Initial capital must be a number of 0 or more.'] })
  })

  it('reports every problem at once', () => {
    const r = buildRequest(form({ strategyIds: [], slippage: 'percent', slippageValue: 'x', initialCapital: 'y' }), TODAY)
    expect(r.ok === false && r.errors).toHaveLength(3)
  })
})

describe('formatting', () => {
  it('formats ISO days without timezone drift', () => {
    expect(fmtIsoDay('2025-05-20')).toBe('20 May 2025')
    expect(fmtIsoDay('2025-01-01T23:59:59')).toBe('01 Jan 2025')
    expect(fmtIsoDay(null)).toBe('—')
    expect(fmtIsoShort('2025-12-31')).toBe('31 Dec')
    expect(fmtIsoTick('2025-05-20')).toBe('20 May 25')
  })

  it('prefills the custom range with the month ending yesterday', () => {
    expect(defaultCustomRange('2025-06-15')).toEqual({ startDate: '2025-05-14', endDate: '2025-06-14' })
    expect(defaultCustomRange('2025-01-01')).toEqual({ startDate: '2024-11-30', endDate: '2024-12-31' })
    expect(defaultCustomRange('2025-04-01')).toEqual({ startDate: '2025-02-28', endDate: '2025-03-31' })
    expect(defaultCustomRange('2024-03-31')).toEqual({ startDate: '2024-02-29', endDate: '2024-03-30' })
  })

  it('abbreviates ring amounts the Indian way', () => {
    expect(ringAmount(-32902.1)).toBe('32.90K')
    expect(ringAmount(123456)).toBe('1.23L')
    expect(ringAmount(25000000)).toBe('2.50Cr')
    expect(ringAmount(0)).toBe('0')
    expect(ringAmount(-999.6)).toBe('1000')
  })

  it('describes each slippage mode', () => {
    expect(describeSlippage({ mode: 'default', value: 0 })).toBe('Default slippage model')
    expect(describeSlippage({ mode: 'none', value: 0 })).toBe('No slippage')
    expect(describeSlippage({ mode: 'percent', value: 0.5 })).toBe('0.5% of price per fill')
    expect(describeSlippage({ mode: 'points', value: 2 })).toBe('2 pt per unit per fill')
  })
})

describe('dayKind', () => {
  it('classifies by sign', () => {
    expect([dayKind(1), dayKind(-1), dayKind(0)]).toEqual(['win', 'loss', 'flat'])
  })
})

describe('extremeDays', () => {
  const daily = [day('2025-01-01', 100), day('2025-01-02', -50), day('2025-01-03', 300), day('2025-01-04', 0), day('2025-01-05', -400), day('2025-01-06', 20), day('2025-01-07', -10)]

  it('keeps the best and worst N days in date order and skips flat days', () => {
    const r = extremeDays(daily, 2)
    expect(r.days.map((d) => d.date)).toEqual(['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-05'])
    expect(r.avgProfit).toBe(200)
    expect(r.avgLoss).toBe(-225)
  })

  it('returns every non-flat day for "all"', () => {
    const r = extremeDays(daily, 'all')
    expect(r.days).toHaveLength(6)
    expect(r.days.some((d) => d.pnl === 0)).toBe(false)
    expect(r.avgProfit).toBe(140)
    expect(r.avgLoss).toBe(-153.33)
  })

  it('reports null averages when a side is empty', () => {
    expect(extremeDays([day('2025-01-01', 10)], 10)).toMatchObject({ avgProfit: 10, avgLoss: null })
    expect(extremeDays([], 10)).toEqual({ days: [], avgProfit: null, avgLoss: null })
  })
})

describe('niceAxis', () => {
  it('rounds a losing equity curve outwards to round steps, ending at zero', () => {
    expect(niceAxis([-1000, -172413, -90000])).toEqual({ domain: [-200000, 0], ticks: [-200000, -150000, -100000, -50000, 0] })
  })

  it('spans both signs for a mixed series', () => {
    expect(niceAxis([-6577.46, 6113.39])).toEqual({ domain: [-7500, 7500], ticks: [-7500, -5000, -2500, 0, 2500, 5000, 7500] })
  })

  it('keeps zero in range for an all-positive series', () => {
    const { domain, ticks } = niceAxis([120, 480, 950])
    expect(domain).toEqual([0, 1000])
    expect(ticks[0]).toBe(0)
    expect(ticks.at(-1)).toBe(1000)
  })

  it('always covers the data and stays within the interval budget', () => {
    for (const span of [0.7, 13, 999, 12345, 5_400_000]) {
      const { domain, ticks } = niceAxis([-span, span * 0.4])
      expect(domain[0]).toBeLessThanOrEqual(-span)
      expect(domain[1]).toBeGreaterThanOrEqual(span * 0.4)
      expect(ticks.length - 1).toBeLessThanOrEqual(6)
      expect(ticks).toContain(0)
    }
  })

  it('falls back to a symmetric range when there is nothing to scale', () => {
    expect(niceAxis([])).toEqual({ domain: [-1, 1], ticks: [-1, 0, 1] })
    expect(niceAxis([0, 0, Number.NaN])).toEqual({ domain: [-1, 1], ticks: [-1, 0, 1] })
  })
})

describe('monthCalendars', () => {
  it('returns nothing without days', () => {
    expect(monthCalendars([])).toEqual([])
  })

  it('lays out Sunday-first months and totals only days that traded', () => {
    const [may] = monthCalendars([day('2025-05-02', 100.1), day('2025-05-20', -40.05)])
    expect(may).toMatchObject({ key: '2025-05', label: 'May 2025', pnl: 60.05, tradingDays: 2 })
    expect(may.cells).toHaveLength(31)
    // 1 May 2025 was a Thursday.
    expect(may.leading).toBe(4)
    expect(may.cells[1]).toMatchObject({ date: '2025-05-02', day: 2, pnl: 100.1, kind: 'win' })
    expect(may.cells[19]).toMatchObject({ kind: 'loss' })
    expect(may.cells[0]).toMatchObject({ pnl: null, kind: 'none' })
  })

  it('fills months without trades and rolls over the year', () => {
    const months = monthCalendars([day('2025-12-31', 5), day('2024-11-15', 5)])
    expect(months).toHaveLength(14)
    expect(months[0].key).toBe('2024-11')
    expect(months[1]).toMatchObject({ key: '2024-12', pnl: 0, tradingDays: 0 })
    expect(months[2].key).toBe('2025-01')
    expect(months[13].key).toBe('2025-12')
  })

  it('knows leap Februaries', () => {
    const [feb] = monthCalendars([day('2024-02-10', 1)])
    expect(feb.cells).toHaveLength(29)
  })

  it('marks breakeven days as flat', () => {
    const [m] = monthCalendars([day('2025-03-03', 0)])
    expect(m.cells[2].kind).toBe('flat')
  })
})

describe('groupTrades', () => {
  it('follows the order of the daily rows and tolerates days without trade rows', () => {
    const daily = [day('2025-05-20', 450), day('2025-05-21', -10), day('2025-05-22', 0)]
    const trades = [trade({ date: '2025-05-21', net_pnl: -10 }), trade({ date: '2025-05-20' }), trade({ date: '2025-05-20', symbol: 'BANKNIFTY' })]
    const groups = groupTrades(daily, trades)
    expect(groups.map((g) => [g.date, g.trades.length])).toEqual([['2025-05-20', 2], ['2025-05-21', 1], ['2025-05-22', 0]])
    expect(groups[0].trades.map((t) => t.symbol)).toEqual(['NIFTY', 'BANKNIFTY'])
  })
})

describe('strategyRows', () => {
  const run = (id: string): StrategyRun => ({ strategy_id: id, class_name: id, segment: 'EQ', timeframe: '5m', symbols: [], approved: null, reason: null, metrics: {}, symbols_with_data: 0, error: null })

  it('counts wins and losses on net P&L and keeps strategies that never traded', () => {
    const rows = strategyRows(
      [run('alpha'), run('beta')],
      [trade({ net_pnl: 100 }), trade({ net_pnl: -40.5 }), trade({ net_pnl: -9.5 }), trade({ net_pnl: 0 })],
    )
    expect(rows[0]).toMatchObject({ id: 'alpha', trades: 4, net: 50, wins: 1, losses: 2, winPct: 25 })
    expect(rows[1]).toMatchObject({ id: 'beta', trades: 0, net: 0, winPct: null })
  })
})

describe('csv', () => {
  it('quotes fields that need it', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"')
  })

  it('defuses spreadsheet formulas in text but leaves numbers alone', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('@cmd')).toBe("'@cmd")
    expect(csvCell('-x')).toBe("'-x")
    expect(csvCell(-450.25)).toBe('-450.25')
    expect(csvCell(Number.NaN)).toBe('')
    expect(csvCell(null)).toBe('')
  })

  it('writes trades with a header, CRLF rows and spaced timestamps', () => {
    const lines = tradesToCsv([trade({ exit_reason: 'stop, trailing' })]).split('\r\n')
    expect(lines[0]).toBe('Date,Strategy,Symbol,Side,Quantity,Entry time,Exit time,Entry price,Exit price,Gross P&L,Slippage,Brokerage,Net P&L,Exit reason')
    expect(lines[1]).toBe('2025-05-20,alpha,NIFTY,BUY,50,2025-05-20 09:20:00,2025-05-20 10:05:00,100,110,500,30,20,450,"stop, trailing"')
    expect(lines[2]).toBe('')
  })

  it('writes the daily series', () => {
    expect(dailyToCsv([day('2025-05-20', 450)])).toBe('Date,Net P&L,Cumulative P&L,Drawdown,Trades,Winning trades,Losing trades\r\n2025-05-20,450,450,0,1,1,0\r\n')
  })

  it('names files after the tested range', () => {
    expect(csvFilename('trades', { start_date: '2024-06-14', end_date: '2025-06-13' })).toBe('strategy-backtest-trades_2024-06-14_2025-06-13.csv')
  })
})
