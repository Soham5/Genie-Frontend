import type { BacktestRow } from '@/types'

export interface QualityFlag {
  key: 'no-trades' | 'thin' | 'implausible' | 'dd-overflow'
  label: string
  detail: string
  severity: 'warn' | 'neg'
}

/** Heuristic sanity checks on a backtest row. The source report is synthetic, so these protect against over-reading its metrics. */
export function backtestFlags(r: BacktestRow): QualityFlag[] {
  const out: QualityFlag[] = []
  if (!r.trades) {
    out.push({ key: 'no-trades', label: 'No trades', detail: 'The strategy produced no signals in the test window.', severity: 'warn' })
    return out
  }
  if (r.trades < 30) out.push({ key: 'thin', label: `n=${r.trades}`, detail: 'Fewer than 30 trades — statistically thin; ratios are unstable.', severity: 'warn' })
  if ((r.sharpe ?? 0) > 20 || (r.winRate ?? 0) >= 99 || (r.profitFactor ?? 0) >= 100)
    out.push({ key: 'implausible', label: 'Implausible', detail: 'Sharpe > 20, ~100% win rate or a near-infinite profit factor — a sign of synthetic or look-ahead data, not real edge.', severity: 'neg' })
  if ((r.maxDrawdownPct ?? 0) > 100) out.push({ key: 'dd-overflow', label: 'DD > 100%', detail: 'Drawdown exceeds 100% of the reference capital — the metric is not meaningful.', severity: 'neg' })
  return out
}
