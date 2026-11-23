import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore } from '@/data/store'
import { CATALOG } from '@/data/catalog'
import { Badge, Callout, Empty, PageHead, Panel } from '@/components/ui/Panel'
import { Stat } from '@/components/ui/Stat'
import { DataTable } from '@/components/ui/DataTable'
import { AXIS, COLORS, ChartTooltip, GRID, Legend } from '@/components/charts/chartKit'
import { backtestFlags } from '@/lib/quality'
import { fmtINR, fmtNum, fmtPct, pnlTone } from '@/lib/format'
import type { BacktestRow } from '@/types'
import { clsx } from '@/lib/clsx'

const nameOf = (id: string) => CATALOG.find((c) => c.id === id)?.name ?? id

export default function Backtests() {
  const { backtest } = useStore()
  const { summary, rows, walkForward } = backtest

  const tested = rows.filter((r) => r.trades)
  const credible = tested.filter((r) => backtestFlags(r).every((f) => f.severity !== 'neg') && (r.trades ?? 0) >= 30)
  const wf = useMemo(() => walkForward.map((w) => ({ name: nameOf(w.id), inSample: w.inSample, outOfSample: w.outOfSample, implausible: w.inSample > 20 })), [walkForward])

  return (
    <>
      <PageHead title="Backtest Lab" sub={summary ? `${summary.period} · ${summary.data_type}` : 'Strategy research results'} />
      <div className="stack">
        <Callout tone="warn" title="Synthetic data — do not treat as expected performance.">
          This report was generated on synthetic price series with injected regime changes. Several results (Sharpe &gt; 100, 100% win rate, infinite profit factor) are artefacts of
          the generator, not evidence of edge. Only strategies that pass the sample-size and plausibility checks below are marked <Badge tone="pos">usable</Badge>. Validate on real historical data before allocating capital.
        </Callout>

        {summary && (
          <div className="grid cols-4">
            <Stat label="Strategies tested" value={summary.strategies_tested} foot={`${tested.length} produced trades · ${rows.length - tested.length} silent`} />
            <Stat label="Approved by gate" value={summary.strategies_approved} foot={summary.approved_strategy.name} help="The report's own approval — note it rests on the implausible metrics flagged here." />
            <Stat label="Total trades" value={summary.total_trades} foot={`win rate ${fmtPct(summary.portfolio_win_rate, 1)}`} />
            <Stat label="Credible rows" value={`${credible.length} / ${tested.length}`} foot="≥30 trades and no implausibility flags" tone={credible.length ? 'pos' : 'warn'} />
          </div>
        )}

        <Panel title="Leaderboard" sub="Sorted by net P&L · hover flags for the reason" flush>
          <DataTable<BacktestRow>
            rows={rows}
            rowKey={(r) => r.id}
            initialSort={{ key: 'net', dir: 'desc' }}
            columns={[
              { key: 'name', header: 'Strategy', sort: (r) => nameOf(r.id), cell: (r) => <><strong>{nameOf(r.id)}</strong> <Badge tone="outline">{r.type}</Badge></> },
              { key: 'trades', header: 'Trades', align: 'r', sort: (r) => r.trades ?? 0, cell: (r) => <span className="num">{r.trades ?? 0}</span> },
              { key: 'win', header: 'Win %', align: 'r', sort: (r) => r.winRate, cell: (r) => <span className="num">{fmtPct(r.winRate, 1)}</span> },
              { key: 'pf', header: 'Profit factor', align: 'r', sort: (r) => r.profitFactor, cell: (r) => <span className="num">{r.profitFactor == null ? '—' : r.profitFactor >= 100 ? '∞' : fmtNum(r.profitFactor)}</span> },
              { key: 'sharpe', header: 'Sharpe', align: 'r', sort: (r) => r.sharpe, cell: (r) => <span className="num">{fmtNum(r.sharpe, 1)}</span> },
              { key: 'dd', header: 'Max DD', align: 'r', sort: (r) => r.maxDrawdownPct, cell: (r) => <span className="num">{fmtPct(r.maxDrawdownPct, 1)}</span> },
              { key: 'net', header: 'Net P&L', align: 'r', sort: (r) => r.netPnl, cell: (r) => <strong className={clsx('num', pnlTone(r.netPnl))}>{fmtINR(r.netPnl, { sign: true })}</strong> },
              {
                key: 'q',
                header: 'Quality',
                cell: (r) => {
                  const flags = backtestFlags(r)
                  if (!flags.length) return <Badge tone="pos">usable</Badge>
                  return <span className="row row--wrap" style={{ gap: 4 }}>{flags.map((f) => <Badge key={f.key} tone={f.severity} title={f.detail}>{f.label}</Badge>)}</span>
                },
              },
            ]}
          />
        </Panel>

        <div className="grid cols-2">
          <Panel title="Walk-forward Sharpe" sub="In-sample vs out-of-sample for the strategies the report stress-tested" actions={<Legend items={[{ label: 'In-sample', color: COLORS.accent }, { label: 'Out-of-sample', color: COLORS.violet }]} />}>
            {wf.length === 0 ? <Empty title="No walk-forward data" /> : (
              <div className="chart" style={{ height: 260 }} role="img" aria-label="Walk-forward Sharpe">
                <ResponsiveContainer>
                  <BarChart data={wf.filter((w) => !w.implausible)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="name" {...AXIS} interval={0} tick={{ ...AXIS.tick, fontSize: 10 }} />
                    <YAxis {...AXIS} width={32} />
                    <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip format={(v) => fmtNum(v, 2)} />} />
                    <Bar dataKey="inSample" name="In-sample" fill="var(--accent)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="outOfSample" name="Out-of-sample" fill="var(--violet)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {wf.some((w) => w.implausible) && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Omitted from the chart: {wf.filter((w) => w.implausible).map((w) => w.name).join(', ')} (Sharpe {'>'} 20, implausible).</p>}
          </Panel>

          <Panel title="Stress-test notes" sub="From the report summary">
            {summary ? (
              <dl className="kv" style={{ gridTemplateColumns: '1fr', gap: 10 }}>
                <div><dt>Monte Carlo</dt><dd style={{ textAlign: 'left' }}>{summary.stress_testing_results.monte_carlo}</dd></div>
                <div><dt>Walk-forward</dt><dd style={{ textAlign: 'left' }}>{summary.stress_testing_results.walk_forward}</dd></div>
                <div><dt>Parameter sensitivity</dt><dd style={{ textAlign: 'left' }}>{summary.stress_testing_results.parameter_sensitivity}</dd></div>
              </dl>
            ) : <Empty title="No summary available" />}
          </Panel>
        </div>
      </div>
    </>
  )
}
