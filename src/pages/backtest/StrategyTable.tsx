import { useMemo } from 'react'
import { Badge, Panel } from '@/components/ui/Panel'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { fmtINR, fmtNum, fmtPct, pnlTone, prettyStrategy } from '@/lib/format'
import { clsx } from '@/lib/clsx'
import { strategyRows, type StrategyBacktestResponse, type StrategyRow } from '@/lib/strategyBacktest'

const metric = (row: StrategyRow, key: string) => row.run.metrics[key] ?? null

function Detail({ row }: { row: StrategyRow }) {
  const { run } = row
  const cell = (label: string, value: string) => (
    <div>
      <div className="metric__label">{label}</div>
      <div className="metric__value num">{value}</div>
    </div>
  )
  return (
    <div className="stack" style={{ gap: 10 }}>
      {run.error && <p className="neg" role="alert"><strong>Backtest failed.</strong> {run.error}</p>}
      {run.reason && (
        <p className="sb-note" style={{ fontSize: 12.5 }}>
          <strong>Approval gate:</strong> {run.reason}
        </p>
      )}
      <div className="sb-detail">
        {cell('Profit factor', fmtNum(metric(row, 'profit_factor')))}
        {cell('Avg P&L / trade', fmtINR(metric(row, 'avg_pnl_per_trade'), { decimals: true }))}
        {cell('ROI', fmtPct(metric(row, 'roi_pct'), 2))}
        {cell('Engine win rate (gross)', fmtPct(metric(row, 'win_rate'), 1))}
        {cell('Slippage', fmtINR(metric(row, 'total_slippage'), { decimals: true }))}
        {cell('Brokerage', fmtINR(metric(row, 'total_brokerage'), { decimals: true }))}
        {cell('Data coverage', fmtPct(metric(row, 'min_data_coverage_pct'), 0))}
        {cell('Symbols', `${run.symbols_with_data} of ${run.symbols.length} with data`)}
      </div>
    </div>
  )
}

export function StrategyTable({ report }: { report: StrategyBacktestResponse }) {
  const rows = useMemo(() => strategyRows(report.strategies, report.trades), [report.strategies, report.trades])

  const columns: Column<StrategyRow>[] = [
    {
      key: 'name',
      header: 'Strategy',
      sort: (r) => prettyStrategy(r.id),
      cell: (r) => (
        <div>
          <strong>{prettyStrategy(r.id)}</strong>
          <div className="mono muted" style={{ fontSize: 11 }}>
            {[r.run.class_name, r.run.segment, r.run.timeframe].filter(Boolean).join(' · ')}
          </div>
        </div>
      ),
    },
    { key: 'trades', header: 'Trades', align: 'r', sort: (r) => r.trades, cell: (r) => <span className="num">{r.trades}</span> },
    { key: 'win', header: 'Win %', align: 'r', sort: (r) => r.winPct, cell: (r) => <span className="num">{fmtPct(r.winPct, 1)}</span> },
    { key: 'net', header: 'Net P&L', align: 'r', sort: (r) => r.net, cell: (r) => <strong className={clsx('num', pnlTone(r.net))}>{fmtINR(r.net, { sign: true, decimals: true })}</strong> },
    { key: 'sharpe', header: 'Sharpe', align: 'r', sort: (r) => metric(r, 'sharpe_ratio'), cell: (r) => <span className="num">{fmtNum(metric(r, 'sharpe_ratio'))}</span> },
    { key: 'dd', header: 'Max DD', align: 'r', sort: (r) => metric(r, 'max_drawdown_abs'), cell: (r) => <span className="num">{fmtINR(metric(r, 'max_drawdown_abs'))}</span> },
    {
      key: 'gate',
      header: 'Approval gate',
      sort: (r) => (r.run.approved == null ? null : r.run.approved ? 1 : 0),
      cell: (r) => {
        if (r.run.error) return <Badge tone="neg" dot>failed</Badge>
        if (r.run.symbols_with_data === 0) return <Badge tone="warn" dot>no data</Badge>
        if (r.run.approved == null) return <span className="muted">—</span>
        return <Badge tone={r.run.approved ? 'pos' : 'neg'} dot>{r.run.approved ? 'would pass' : 'would fail'}</Badge>
      },
    },
  ]

  return (
    <Panel title="Strategies" sub="Each strategy’s own contribution. Click a row for its engine metrics." flush>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} dense expand={(r) => <Detail row={r} />} emptyTitle="No strategies" />
      <p className="sb-note sb-table-note">
        Win % counts trades that made money after slippage and brokerage. Max DD is each strategy’s own peak-to-trough fall. Approval gate shows whether the run would pass the engine’s check; nothing is saved, so no strategy status changes.
      </p>
    </Panel>
  )
}
