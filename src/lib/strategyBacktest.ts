/**
 * Types and pure helpers behind the Strategy Backtest page: request building/validation and every
 * derived view of the report (top-N days, month calendars, per-day grouping, CSV). No React, no network.
 */

export const MAX_STRATEGIES = 10

export type RangePreset = '1M' | '3M' | '6M' | '1Y' | '2Y' | 'custom'

export const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: '1M', label: '1 Month' },
  { value: '3M', label: '3 Months' },
  { value: '6M', label: '6 Months' },
  { value: '1Y', label: '1 Year' },
  { value: '2Y', label: '2 Years' },
  { value: 'custom', label: 'Custom Range' },
]

export type SlippageMode = 'default' | 'none' | 'percent' | 'points'

export const SLIPPAGE_OPTIONS: { value: SlippageMode; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'none', label: 'None' },
  { value: 'percent', label: 'Percent (%)' },
  { value: 'points', label: 'Points (Pt)' },
]

export interface BacktestForm {
  strategyIds: string[]
  range: RangePreset
  /** `YYYY-MM-DD`, used only when `range` is `custom`. */
  startDate: string
  endDate: string
  slippage: SlippageMode
  /** Raw input text; only read for the percent and points modes. */
  slippageValue: string
  /** Raw input text; empty means 0 (fixed-size simulation, no risk stack). */
  initialCapital: string
  riskStack: boolean
}

export const DEFAULT_FORM: BacktestForm = {
  strategyIds: [],
  range: '1Y',
  startDate: '',
  endDate: '',
  slippage: 'default',
  slippageValue: '',
  initialCapital: '',
  riskStack: true,
}

export interface StrategyBacktestRequest {
  strategy_ids: string[]
  period: RangePreset
  start_date?: string
  end_date?: string
  slippage: { mode: SlippageMode; value: number }
  initial_capital: number
  risk_stack_enabled: boolean
}

export type BuildResult = { ok: true; request: StrategyBacktestRequest } | { ok: false; errors: string[] }

/** Local calendar date as `YYYY-MM-DD`. */
export function localIsoDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Parses user-typed numbers, tolerating Indian digit grouping and a leading ₹. Null when not a finite number. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[,\s₹]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Validates the form (mirroring the API's rules so mistakes surface before the request) and builds the request body. */
export function buildRequest(form: BacktestForm, today: string): BuildResult {
  const errors: string[] = []

  if (form.strategyIds.length === 0) errors.push('Select at least one strategy.')
  if (form.strategyIds.length > MAX_STRATEGIES) errors.push(`Select at most ${MAX_STRATEGIES} strategies per run.`)

  let slippageValue = 0
  if (form.slippage === 'percent' || form.slippage === 'points') {
    const v = parseAmount(form.slippageValue)
    if (v == null || v < 0) errors.push('Enter a slippage value of 0 or more.')
    else if (form.slippage === 'percent' && v > 100) errors.push('Percent slippage cannot exceed 100.')
    else slippageValue = v
  }

  let capital = 0
  if (form.initialCapital.trim()) {
    const v = parseAmount(form.initialCapital)
    if (v == null || v < 0) errors.push('Initial capital must be a number of 0 or more.')
    else capital = v
  }

  if (form.range === 'custom') {
    if (!form.startDate || !form.endDate) errors.push('Pick both a start and an end date.')
    else if (form.startDate > form.endDate) errors.push('The start date must be on or before the end date.')
    else if (form.endDate > today) errors.push('The end date cannot be in the future.')
  }

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    request: {
      strategy_ids: form.strategyIds,
      period: form.range,
      ...(form.range === 'custom' ? { start_date: form.startDate, end_date: form.endDate } : {}),
      slippage: { mode: form.slippage, value: slippageValue },
      initial_capital: capital,
      risk_stack_enabled: form.riskStack,
    },
  }
}

// ── Response ────────────────────────────────────────────────────────────

export interface StrategyRun {
  strategy_id: string
  class_name: string | null
  segment: string | null
  timeframe: string | null
  symbols: string[]
  approved: boolean | null
  reason: string | null
  metrics: Record<string, number | null>
  symbols_with_data: number
  error: string | null
}

export interface ReportSummary {
  net_pnl: number
  gross_pnl: number
  total_slippage: number
  total_brokerage: number
  trading_days: number
  win_days: number
  loss_days: number
  flat_days: number
  win_days_pct: number
  loss_days_pct: number
  total_trades: number
  win_trades: number
  loss_trades: number
  flat_trades: number
  win_trades_pct: number
  loss_trades_pct: number
  max_win_streak: number
  max_loss_streak: number
  max_profit: number
  max_profit_date: string | null
  max_loss: number
  max_loss_date: string | null
  avg_profit_per_day: number
  avg_loss_per_day: number
  max_drawdown: number
  max_drawdown_pct_of_peak: number | null
  max_drawdown_peak_date: string | null
  max_drawdown_trough_date: string | null
}

export interface DayRow {
  date: string
  pnl: number
  cumulative_pnl: number
  drawdown: number
  trades: number
  win_trades: number
  loss_trades: number
}

export interface MonthRow {
  month: string
  pnl: number
  trades: number
  trading_days: number
  win_days: number
  loss_days: number
}

export interface TradeRow {
  date: string
  strategy_id: string
  symbol: string
  action: string
  quantity: number
  entry_time: string
  exit_time: string
  entry_price: number
  exit_price: number
  gross_pnl: number
  net_pnl: number
  slippage_cost: number
  brokerage_cost: number
  exit_reason: string
}

export interface StrategyBacktestResponse {
  request: {
    period: string
    start_date: string
    end_date: string
    slippage: { mode: SlippageMode; value: number }
    initial_capital: number
    risk_stack_enabled: boolean
  }
  strategies: StrategyRun[]
  summary: ReportSummary
  daily: DayRow[]
  monthly: MonthRow[]
  trades: TradeRow[]
  warnings: string[]
  elapsed_seconds: number
}

// ── Formatting ──────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "20 May 2025" for `2025-05-20`, without going through `Date` (no timezone shifts). */
export function fmtIsoDay(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '—'
}

/** "20 May" for `2025-05-20`. */
export function fmtIsoShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]}` : iso
}

/** "20 May 25" for `2025-05-20`: compact enough for chart axes that span more than a year. */
export function fmtIsoTick(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1].slice(2)}` : iso
}

/** Prefill for the custom range: the calendar month ending yesterday, as `YYYY-MM-DD` strings. */
export function defaultCustomRange(today: string): { startDate: string; endDate: string } {
  const [y, m, d] = today.split('-').map(Number)
  const end = new Date(Date.UTC(y, m - 1, d - 1))
  const month = end.getUTCMonth() - 1
  // A 31st has no counterpart in a shorter month, so clamp instead of rolling into the next one.
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), month + 1, 0)).getUTCDate()
  const start = new Date(Date.UTC(end.getUTCFullYear(), month, Math.min(end.getUTCDate(), lastDay)))
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }
}

const COMPACT = new Intl.NumberFormat('en-IN', { notation: 'compact', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Magnitude for the drawdown ring: "32.90K", "1.23L" (lakh) or "2.50Cr". */
export function ringAmount(n: number): string {
  const abs = Math.abs(n)
  return abs < 1000 ? String(Math.round(abs)) : COMPACT.format(abs)
}

export function describeSlippage(s: { mode: SlippageMode; value: number }): string {
  switch (s.mode) {
    case 'none':
      return 'No slippage'
    case 'percent':
      return `${s.value}% of price per fill`
    case 'points':
      return `${s.value} pt per unit per fill`
    default:
      return 'Default slippage model'
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

const NICE_STEPS = [1, 2, 2.5, 5]

/**
 * Axis bounds and ticks on 1 / 2 / 2.5 / 5 × 10ⁿ steps. Zero is always inside the range, so charts of P&L
 * read in round amounts instead of the arbitrary steps a free-form domain produces.
 */
export function niceAxis(values: readonly number[], maxIntervals = 6): { domain: [number, number]; ticks: number[] } {
  let lo = 0
  let hi = 0
  for (const v of values) {
    if (!Number.isFinite(v)) continue
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (lo === hi) return { domain: [-1, 1], ticks: [-1, 0, 1] }

  const base = 10 ** Math.floor(Math.log10((hi - lo) / maxIntervals))
  for (let i = 0; ; i++) {
    const step = NICE_STEPS[i % NICE_STEPS.length] * base * 10 ** Math.floor(i / NICE_STEPS.length)
    const first = Math.floor(lo / step)
    const last = Math.ceil(hi / step)
    if (last - first <= maxIntervals) {
      // Multiples of the step are computed from integers so the zero tick is exactly 0.
      const at = (m: number) => Number((m * step).toPrecision(12))
      return { domain: [at(first), at(last)], ticks: Array.from({ length: last - first + 1 }, (_, k) => at(first + k)) }
    }
  }
}

// ── Derived views ───────────────────────────────────────────────────────

export type DayKind = 'win' | 'loss' | 'flat'

export const dayKind = (pnl: number): DayKind => (pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'flat')

export type TopN = '10' | '20' | '30' | 'all'

export const TOP_OPTIONS: { value: TopN; label: string }[] = [
  { value: '10', label: 'Top 10' },
  { value: '20', label: 'Top 20' },
  { value: '30', label: 'Top 30' },
  { value: 'all', label: 'All' },
]

export const topLimit = (t: TopN): number | 'all' => (t === 'all' ? 'all' : Number(t))

export interface ExtremeDays {
  /** The best and worst days in the selection, in date order. Flat days are never included. */
  days: DayRow[]
  avgProfit: number | null
  avgLoss: number | null
}

const byDate = (a: DayRow, b: DayRow) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)

/** The `n` most profitable and the `n` most losing days (or every non-flat day for `all`). */
export function extremeDays(daily: DayRow[], n: number | 'all'): ExtremeDays {
  const limit = n === 'all' ? Infinity : n
  const wins = daily.filter((d) => d.pnl > 0).sort((a, b) => b.pnl - a.pnl || byDate(a, b)).slice(0, limit)
  const losses = daily.filter((d) => d.pnl < 0).sort((a, b) => a.pnl - b.pnl || byDate(a, b)).slice(0, limit)
  const mean = (rows: DayRow[]) => (rows.length ? round2(rows.reduce((s, d) => s + d.pnl, 0) / rows.length) : null)
  return { days: [...wins, ...losses].sort(byDate), avgProfit: mean(wins), avgLoss: mean(losses) }
}

export interface CalendarCell {
  date: string
  day: number
  pnl: number | null
  /** `none` = no trades closed that day (weekends, holidays, no signal). */
  kind: DayKind | 'none'
}

export interface MonthCalendar {
  key: string
  label: string
  pnl: number
  tradingDays: number
  /** Blank cells before the 1st so weeks line up under Sun..Sat headers. */
  leading: number
  cells: CalendarCell[]
}

/** One calendar per month from the first to the last trading day, including months in between that had no trades. */
export function monthCalendars(daily: DayRow[]): MonthCalendar[] {
  if (!daily.length) return []
  const byDay = new Map(daily.map((d) => [d.date, d]))
  const dates = daily.map((d) => d.date).sort()
  let [year, month] = dates[0].slice(0, 7).split('-').map(Number)
  const [lastYear, lastMonth] = dates[dates.length - 1].slice(0, 7).split('-').map(Number)
  const pad = (n: number) => String(n).padStart(2, '0')

  const out: MonthCalendar[] = []
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    const length = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const cells: CalendarCell[] = []
    let pnl = 0
    let tradingDays = 0
    for (let day = 1; day <= length; day++) {
      const date = `${year}-${pad(month)}-${pad(day)}`
      const row = byDay.get(date)
      if (row) {
        pnl += row.pnl
        tradingDays += 1
      }
      cells.push({ date, day, pnl: row?.pnl ?? null, kind: row ? dayKind(row.pnl) : 'none' })
    }
    out.push({
      key: `${year}-${pad(month)}`,
      label: `${MONTHS[month - 1]} ${year}`,
      pnl: round2(pnl),
      tradingDays,
      leading: new Date(Date.UTC(year, month - 1, 1)).getUTCDay(),
      cells,
    })
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return out
}

export interface DayGroup {
  date: string
  pnl: number
  trades: TradeRow[]
}

/** Trades grouped under the day they exited, in the order of `daily`. */
export function groupTrades(daily: DayRow[], trades: TradeRow[]): DayGroup[] {
  const byDay = new Map<string, TradeRow[]>()
  for (const t of trades) {
    const list = byDay.get(t.date)
    if (list) list.push(t)
    else byDay.set(t.date, [t])
  }
  return daily.map((d) => ({ date: d.date, pnl: d.pnl, trades: byDay.get(d.date) ?? [] }))
}

export interface StrategyRow {
  id: string
  run: StrategyRun
  trades: number
  net: number
  wins: number
  losses: number
  /** Share of trades that made money after costs; null with no trades. */
  winPct: number | null
}

/** Per-strategy contribution, computed from the same net-of-cost trades as the headline numbers. */
export function strategyRows(strategies: StrategyRun[], trades: TradeRow[]): StrategyRow[] {
  const acc = new Map<string, { trades: number; net: number; wins: number; losses: number }>()
  for (const t of trades) {
    const a = acc.get(t.strategy_id) ?? { trades: 0, net: 0, wins: 0, losses: 0 }
    a.trades += 1
    a.net += t.net_pnl
    if (t.net_pnl > 0) a.wins += 1
    else if (t.net_pnl < 0) a.losses += 1
    acc.set(t.strategy_id, a)
  }
  return strategies.map((run) => {
    const a = acc.get(run.strategy_id) ?? { trades: 0, net: 0, wins: 0, losses: 0 }
    return { id: run.strategy_id, run, ...a, net: round2(a.net), winPct: a.trades ? round2((a.wins / a.trades) * 100) : null }
  })
}

// ── CSV ─────────────────────────────────────────────────────────────────

/** One CSV field: quotes when needed and defuses spreadsheet formulas in text cells. */
export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function toCsv(header: string[], rows: (string | number | null)[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

const stamp = (iso: string) => iso.replace('T', ' ')

export function tradesToCsv(trades: TradeRow[]): string {
  return toCsv(
    ['Date', 'Strategy', 'Symbol', 'Side', 'Quantity', 'Entry time', 'Exit time', 'Entry price', 'Exit price', 'Gross P&L', 'Slippage', 'Brokerage', 'Net P&L', 'Exit reason'],
    trades.map((t) => [t.date, t.strategy_id, t.symbol, t.action, t.quantity, stamp(t.entry_time), stamp(t.exit_time), t.entry_price, t.exit_price, t.gross_pnl, t.slippage_cost, t.brokerage_cost, t.net_pnl, t.exit_reason]),
  )
}

export function dailyToCsv(daily: DayRow[]): string {
  return toCsv(
    ['Date', 'Net P&L', 'Cumulative P&L', 'Drawdown', 'Trades', 'Winning trades', 'Losing trades'],
    daily.map((d) => [d.date, d.pnl, d.cumulative_pnl, d.drawdown, d.trades, d.win_trades, d.loss_trades]),
  )
}

export function csvFilename(kind: 'trades' | 'daily-pnl', range: { start_date: string; end_date: string }): string {
  return `strategy-backtest-${kind}_${range.start_date}_${range.end_date}.csv`
}
