export interface QualityFlag {
  key: 'no-trades' | 'thin' | 'implausible' | 'dd-overflow'
  label: string
  detail: string
  severity: 'warn' | 'neg'
}

export interface BacktestMetrics {
  trades: number | null
  sharpe: number | null
  winRate: number | null
  profitFactor: number | null
  maxDrawdownPct: number | null
}

/** Heuristic sanity checks on one backtest run, so thin or too-good-to-be-true metrics aren't over-read. */
export function backtestFlags(r: BacktestMetrics): QualityFlag[] {
  const out: QualityFlag[] = []
  if (r.trades == null) return out
  if (!r.trades) {
    out.push({ key: 'no-trades', label: 'No trades', detail: 'The run produced no trades, so its ratios carry no information.', severity: 'warn' })
    return out
  }
  if (r.trades < 30) out.push({ key: 'thin', label: `n=${r.trades}`, detail: 'Fewer than 30 trades — statistically thin; ratios are unstable.', severity: 'warn' })
  if ((r.sharpe ?? 0) > 20 || (r.winRate ?? 0) >= 99 || (r.profitFactor ?? 0) >= 100)
    out.push({ key: 'implausible', label: 'Implausible', detail: 'Sharpe > 20, ~100% win rate or a near-infinite profit factor — typically look-ahead, overfitting or a degenerate sample rather than real edge.', severity: 'neg' })
  if ((r.maxDrawdownPct ?? 0) > 100) out.push({ key: 'dd-overflow', label: 'DD > 100%', detail: 'Drawdown exceeds 100% of the reference capital — the metric is not meaningful.', severity: 'neg' })
  return out
}
