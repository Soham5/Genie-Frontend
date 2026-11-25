import type { ClosedTrade } from './trades'

export interface TradeStats {
  count: number
  wins: number
  losses: number
  winRate: number | null
  gross: number
  net: number
  costs: number
  avgWin: number | null
  avgLoss: number | null
  payoff: number | null
  profitFactor: number | null
  expectancy: number | null
  avgR: number | null
  maxDrawdown: number
  best: ClosedTrade | null
  worst: ClosedTrade | null
  maxLossStreak: number
}

export const tradeCosts = (t: ClosedTrade) => t.brokerage + t.stt + t.exchCharges + t.gst + t.other

/** R-multiple = net P&L over the risk budgeted at entry. Null when the entry had no recorded risk. */
export const rMultiple = (t: ClosedTrade): number | null => (t.initialRisk && t.initialRisk > 0 ? t.net / t.initialRisk : null)

export interface CurvePoint {
  i: number
  label: string
  equity: number
  drawdown: number
  pnl: number
  strategy: string
}

/** Cumulative net P&L in exit order, with running drawdown measured from the high-water mark (starting at 0). */
export function equityCurve(trades: ClosedTrade[], field: 'net' | 'gross' = 'net'): CurvePoint[] {
  let equity = 0
  let peak = 0
  return trades.map((t, i) => {
    equity += t[field]
    peak = Math.max(peak, equity)
    return { i: i + 1, label: `${t.exitDate} ${(t.exitT ?? '').slice(0, 5)}`, equity: round(equity), drawdown: round(equity - peak), pnl: t[field], strategy: t.strategy }
  })
}

export function maxDrawdown(trades: ClosedTrade[]): number {
  const curve = equityCurve(trades)
  return curve.reduce((m, p) => Math.min(m, p.drawdown), 0)
}

export function computeStats(trades: ClosedTrade[]): TradeStats {
  const wins = trades.filter((t) => t.net > 0)
  const losses = trades.filter((t) => t.net < 0)
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const grossWin = sum(wins.map((t) => t.net))
  const grossLoss = Math.abs(sum(losses.map((t) => t.net)))
  const avgWin = wins.length ? grossWin / wins.length : null
  const avgLoss = losses.length ? -grossLoss / losses.length : null
  const rs = trades.map(rMultiple).filter((r): r is number => r != null)

  let streak = 0
  let maxLossStreak = 0
  for (const t of trades) {
    streak = t.net < 0 ? streak + 1 : 0
    maxLossStreak = Math.max(maxLossStreak, streak)
  }

  const sorted = [...trades].sort((a, b) => a.net - b.net)
  return {
    count: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : null,
    gross: sum(trades.map((t) => t.gross)),
    net: sum(trades.map((t) => t.net)),
    costs: sum(trades.map(tradeCosts)),
    avgWin,
    avgLoss,
    payoff: avgWin != null && avgLoss != null && avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    expectancy: trades.length ? sum(trades.map((t) => t.net)) / trades.length : null,
    avgR: rs.length ? sum(rs) / rs.length : null,
    maxDrawdown: maxDrawdown(trades),
    best: sorted.at(-1) ?? null,
    worst: sorted[0] ?? null,
    maxLossStreak,
  }
}

export function dailyPnl(trades: ClosedTrade[]): { date: string; net: number; gross: number; count: number }[] {
  const m = new Map<string, { date: string; net: number; gross: number; count: number }>()
  for (const t of trades) {
    const d = m.get(t.exitDate) ?? { date: t.exitDate, net: 0, gross: 0, count: 0 }
    d.net += t.net
    d.gross += t.gross
    d.count++
    m.set(t.exitDate, d)
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Annualised Sharpe from per-session P&L (√252 scaling). Returns null below `minSessions` — too few to be meaningful. */
export function sharpeFromDaily(daily: number[], minSessions = 5): number | null {
  if (daily.length < minSessions) return null
  const mean = daily.reduce((a, b) => a + b, 0) / daily.length
  const variance = daily.reduce((a, b) => a + (b - mean) ** 2, 0) / (daily.length - 1)
  const sd = Math.sqrt(variance)
  return sd === 0 ? null : (mean / sd) * Math.sqrt(252)
}

export function groupBy<T, K extends string>(xs: T[], key: (x: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>
  for (const x of xs) (out[key(x)] ??= []).push(x)
  return out
}

export function histogram(values: number[], binWidth: number, min?: number, max?: number): { x: number; label: string; count: number }[] {
  if (!values.length) return []
  const lo = Math.floor((min ?? Math.min(...values)) / binWidth) * binWidth
  const hi = Math.ceil((max ?? Math.max(...values)) / binWidth) * binWidth
  const bins = new Map<number, number>()
  for (let x = lo; x < hi || bins.size === 0; x += binWidth) bins.set(round(x), 0)
  for (const v of values) {
    const clamped = Math.min(Math.max(v, lo), hi - binWidth)
    const key = round(Math.floor(clamped / binWidth) * binWidth)
    bins.set(key, (bins.get(key) ?? 0) + 1)
  }
  return [...bins.entries()].map(([x, count]) => ({ x, label: `${x}R`, count }))
}

const round = (n: number) => Math.round(n * 1e4) / 1e4
