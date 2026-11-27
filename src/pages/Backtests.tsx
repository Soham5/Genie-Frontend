import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { RefreshCw } from 'lucide-react'
import { useApi } from '@/api/useApi'
import { useApiState } from '@/api/ApiProvider'
import { Badge, Callout, Empty, Panel, Seg, Skeleton } from '@/components/ui/Panel'
import { Stat } from '@/components/ui/Stat'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { ApiErrorNote } from '@/components/ui/ApiErrorNote'
import { AXIS, COLORS, ChartTooltip, GRID, Legend } from '@/components/charts/chartKit'
import { backtestFlags } from '@/lib/quality'
import { fmtINR, fmtNum, fmtPct, pnlTone, prettyStrategy } from '@/lib/format'
import { fmtDay, fmtStamp } from '@/lib/stamp'
import { clsx } from '@/lib/clsx'
import { useBacktestDetails, type RunDetail, type RunSummary } from './backtestData'

interface Run {
  id: string
  strategy: string
  runAt: string | null
  approved: boolean
  net: number
  sharpe: number
  detail: RunDetail | null
}

type View = 'latest' | 'all'
type Gate = 'all' | 'approved' | 'rejected'

const flagsOf = (r: Run) =>
  r.detail
    ? backtestFlags({ trades: r.detail.total_trades, sharpe: r.detail.sharpe_ratio, winRate: r.detail.win_rate, profitFactor: r.detail.profit_factor, maxDrawdownPct: r.detail.max_drawdown })
    : []

const isImplausible = (r: Run) => flagsOf(r).some((f) => f.key === 'implausible')

/** The "Stored Results" tab of Backtest Lab: runs the API has saved, with their gate verdicts and run history. */
export default function StoredBacktests() {
  const api = useApiState()
  const list = useApi<{ count: number; results: RunSummary[] }>('/backtest/results', { enabled: api.status !== 'unconfigured' })
  const [view, setView] = useState<View>('latest')
  const [gate, setGate] = useState<Gate>('all')

  const strategyIds = useMemo(() => [...new Set((list.data?.results ?? []).map((r) => r.strategy_id))], [list.data])
  const details = useBacktestDetails(strategyIds)

  const allRuns = useMemo<Run[]>(() => {
    const byId = new Map<string, RunDetail>()
    for (const runs of details.runs.values()) for (const d of runs) byId.set(d.id, d)
    return (list.data?.results ?? []).map((r) => ({
      id: r.id,
      strategy: r.strategy_id,
      runAt: r.run_at,
      approved: r.approved,
      net: r.net_pnl,
      sharpe: r.sharpe_ratio,
      detail: byId.get(r.id) ?? null,
    }))
  }, [list.data, details.runs])

  const latest = useMemo(() => {
    const m = new Map<string, Run>()
    for (const r of allRuns) {
      const cur = m.get(r.strategy)
      if (!cur || (r.runAt ?? '') > (cur.runAt ?? '')) m.set(r.strategy, r)
    }
    return [...m.values()]
  }, [allRuns])

  const base = view === 'latest' ? latest : allRuns
  const rows = useMemo(() => base.filter((r) => gate === 'all' || (gate === 'approved') === r.approved), [base, gate])

  const tested = latest.filter((r) => (r.detail?.total_trades ?? 0) > 0)
  const credible = tested.filter((r) => flagsOf(r).every((f) => f.severity !== 'neg') && (r.detail?.total_trades ?? 0) >= 30)
  const approved = latest.filter((r) => r.approved)
  const lastRun = allRuns.reduce<string | null>((m, r) => (r.runAt && (!m || r.runAt > m) ? r.runAt : m), null)
  const detailLoading = details.pending > 0

  const scatter = useMemo(
    () =>
      latest
        .filter((r) => r.detail && r.detail.total_trades > 0)
        .map((r) => ({ name: prettyStrategy(r.strategy), dd: r.detail!.max_drawdown, net: r.net, trades: r.detail!.total_trades, approved: r.approved, implausible: isImplausible(r) })),
    [latest],
  )
  const sharpeBars = useMemo(
    () =>
      latest
        .filter((r) => r.detail && r.detail.total_trades > 0 && !isImplausible(r))
        .map((r) => ({ name: prettyStrategy(r.strategy), sharpe: r.sharpe, approved: r.approved }))
        .sort((a, b) => b.sharpe - a.sharpe),
    [latest],
  )
  const omitted = latest.filter((r) => r.detail && r.detail.total_trades > 0 && isImplausible(r)).map((r) => prettyStrategy(r.strategy))

  const columns: Column<Run>[] = [
    {
      key: 'name',
      header: 'Strategy',
      sort: (r) => prettyStrategy(r.strategy),
      cell: (r) => (
        <div>
          <strong>{prettyStrategy(r.strategy)}</strong>
          <div className="mono muted" style={{ fontSize: 11 }}>{r.strategy}</div>
        </div>
      ),
    },
    { key: 'seg', header: 'Segment', sort: (r) => r.detail?.segment ?? null, cell: (r) => (r.detail ? <Badge tone="outline">{r.detail.segment}</Badge> : <Dash loading={detailLoading} />) },
    { key: 'run', header: 'Run', sort: (r) => r.runAt, cell: (r) => <span className="num muted">{fmtStamp(r.runAt)}</span> },
    { key: 'trades', header: 'Trades', align: 'r', sort: (r) => r.detail?.total_trades ?? null, cell: (r) => (r.detail ? <span className="num">{r.detail.total_trades}</span> : <Dash loading={detailLoading} />) },
    { key: 'win', header: 'Win %', align: 'r', sort: (r) => (r.detail?.total_trades ? r.detail.win_rate : null), cell: (r) => (r.detail ? <span className="num">{fmtPct(r.detail.win_rate, 1)}</span> : <Dash loading={detailLoading} />) },
    { key: 'pf', header: 'Profit factor', align: 'r', sort: (r) => (r.detail?.total_trades ? r.detail.profit_factor : null), cell: (r) => (r.detail ? <span className="num">{r.detail.profit_factor >= 100 ? '∞' : fmtNum(r.detail.profit_factor)}</span> : <Dash loading={detailLoading} />) },
    { key: 'sharpe', header: 'Sharpe', align: 'r', sort: (r) => r.sharpe, cell: (r) => <span className="num">{fmtNum(r.sharpe, 2)}</span> },
    { key: 'dd', header: 'Max DD', align: 'r', tip: 'Max drawdown as % of the run’s capital base', sort: (r) => (r.detail?.total_trades ? r.detail.max_drawdown : null), cell: (r) => (r.detail ? <span className="num">{fmtPct(r.detail.max_drawdown, 1)}</span> : <Dash loading={detailLoading} />) },
    { key: 'net', header: 'Net P&L', align: 'r', sort: (r) => r.net, cell: (r) => <strong className={clsx('num', pnlTone(r.net))}>{fmtINR(r.net, { sign: true })}</strong> },
    { key: 'gate', header: 'Gate', sort: (r) => (r.approved ? 1 : 0), cell: (r) => <Badge tone={r.approved ? 'pos' : 'neg'} dot>{r.approved ? 'approved' : 'rejected'}</Badge> },
    {
      key: 'q',
      header: 'Checks',
      tip: 'Heuristic sanity checks on the run’s metrics',
      cell: (r) => {
        if (!r.detail) return <Dash loading={detailLoading} />
        const flags = flagsOf(r)
        if (!flags.length) return <Badge tone="pos">ok</Badge>
        return <span className="row row--wrap" style={{ gap: 4 }}>{flags.map((f) => <Badge key={f.key} tone={f.severity} title={f.detail}>{f.label}</Badge>)}</span>
      },
    },
  ]

  const refresh = () => {
    list.refresh()
    details.refresh()
  }

  return (
    <>
      <div className="row row--between row--wrap">
        <p className="muted">
          {list.data ? `${list.data.count} stored runs · ${strategyIds.length} strategies${lastRun ? ` · latest ${fmtDay(lastRun)}` : ''}` : 'Stored backtest results from the Genie API'}
        </p>
        <div className="page__actions">
          <Seg<View> label="Runs" value={view} onChange={setView} options={[{ value: 'latest', label: 'Latest per strategy' }, { value: 'all', label: 'All runs' }]} />
          <Seg<Gate> label="Approval gate" value={gate} onChange={setGate} options={[{ value: 'all', label: 'Any' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }]} />
          <button type="button" className="chip" onClick={refresh} aria-label="Reload backtest results"><RefreshCw size={12} /> Reload</button>
        </div>
      </div>
      <div className="stack">
        {list.loading ? (
          <div className="stack" aria-busy="true">
            <Skeleton height={92} />
            <Skeleton height={320} />
          </div>
        ) : list.error && !list.data ? (
          <ApiErrorNote error={list.error} what="backtest results" />
        ) : !list.data || list.data.count === 0 ? (
          <Panel><Empty title="No backtest results stored">Runs triggered through the API's backtest endpoints are saved and listed here.</Empty></Panel>
        ) : (
          <>
            <div className="grid cols-4">
              <Stat label="Strategies tested" value={latest.length} foot={detailLoading ? 'loading run details…' : `${tested.length} produced trades · ${latest.length - tested.length} without`} />
              <Stat label="Approved by gate" value={`${approved.length} / ${latest.length}`} tone={approved.length ? 'pos' : 'warn'} foot="latest run per strategy" help="The backtest engine's own approval flag on each strategy's latest run." />
              <Stat label="Stored runs" value={list.data.count} foot={lastRun ? `last ${fmtStamp(lastRun)}` : undefined} />
              <Stat
                label="Credible results"
                value={detailLoading ? '…' : `${credible.length} / ${tested.length}`}
                tone={credible.length ? 'pos' : 'warn'}
                foot="≥30 trades and no implausibility flags"
                help="Heuristic: runs with fewer than 30 trades, a Sharpe above 20, a ~100% win rate or drawdown above 100% are not treated as credible."
              />
            </div>

            {details.failed.size > 0 && (
              <Callout tone="warn" title={`${details.failed.size} strategy detail request${details.failed.size > 1 ? 's' : ''} failed.`}>
                {[...details.failed.entries()].slice(0, 3).map(([id, e]) => `${prettyStrategy(id)}: ${e.message}`).join(' · ')} — those rows show only the summary fields the list endpoint provides.
              </Callout>
            )}

            <Panel
              title="Results"
              sub={view === 'latest' ? 'Latest stored run per strategy · click a row for run history and the gate’s reason' : 'Every stored run, newest first by default'}
              flush
            >
              <DataTable<Run>
                rows={rows}
                rowKey={(r) => r.id}
                columns={columns}
                initialSort={{ key: 'net', dir: 'desc' }}
                expand={(r) => <RunHistory run={r} history={details.runs.get(r.strategy)} error={details.failed.get(r.strategy)?.message} />}
                emptyTitle="No runs match this filter"
                emptyHint="Switch the approval gate back to Any."
              />
            </Panel>

            <div className="grid cols-2">
              <Panel
                title="Return vs drawdown"
                sub="Latest run per strategy · bubble size = trades"
                actions={<Legend items={[{ label: 'Approved', color: COLORS.pos }, { label: 'Rejected', color: COLORS.neg }]} />}
              >
                {detailLoading && !scatter.length ? (
                  <Skeleton height={260} />
                ) : scatter.length === 0 ? (
                  <Empty title="Nothing to plot">No strategy has a run with trades yet.</Empty>
                ) : (
                  <div className="chart" style={{ height: 270 }} role="img" aria-label="Net P&L against maximum drawdown for each strategy's latest backtest">
                    <ResponsiveContainer>
                      <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                        <CartesianGrid {...GRID} vertical />
                        <XAxis type="number" dataKey="dd" name="Max drawdown" {...AXIS} tickFormatter={(v: number) => `${v}%`} />
                        <YAxis type="number" dataKey="net" name="Net P&L" {...AXIS} width={56} tickFormatter={(v: number) => fmtINR(v, { compact: true })} />
                        <ZAxis type="number" dataKey="trades" range={[40, 260]} />
                        <ReferenceLine y={0} stroke="var(--border-strong)" />
                        <Tooltip
                          cursor={{ strokeDasharray: '3 3' }}
                          content={
                            <ChartTooltip
                              title={(_l, p) => String(p[0]?.payload?.name ?? '')}
                              format={(v, name) => (name === 'Net P&L' ? fmtINR(v, { sign: true }) : name === 'Max drawdown' ? fmtPct(v, 1) : fmtNum(v, 0))}
                            />
                          }
                        />
                        <Scatter data={scatter} isAnimationActive={false}>
                          {scatter.map((p) => (
                            <Cell key={p.name} fill={p.approved ? COLORS.pos : COLORS.neg} fillOpacity={p.implausible ? 0.35 : 0.8} />
                          ))}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {scatter.some((p) => p.implausible) && <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Faded points failed the plausibility check (see the Checks column).</p>}
              </Panel>

              <Panel title="Sharpe by strategy" sub="Latest run per strategy, implausible values excluded">
                {detailLoading && !sharpeBars.length ? (
                  <Skeleton height={260} />
                ) : sharpeBars.length === 0 ? (
                  <Empty title="Nothing to plot" />
                ) : (
                  <div className="chart" style={{ height: Math.max(220, sharpeBars.length * 24 + 40) }} role="img" aria-label="Sharpe ratio per strategy">
                    <ResponsiveContainer>
                      <BarChart data={sharpeBars} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid {...GRID} vertical horizontal={false} />
                        <XAxis type="number" {...AXIS} />
                        <YAxis type="category" dataKey="name" {...AXIS} width={150} interval={0} tick={{ ...AXIS.tick, fontSize: 10.5 }} />
                        <ReferenceLine x={0} stroke="var(--border-strong)" />
                        <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip format={(v) => fmtNum(v, 2)} />} />
                        <Bar dataKey="sharpe" name="Sharpe" isAnimationActive={false} radius={[0, 2, 2, 0]}>
                          {sharpeBars.map((b) => (
                            <Cell key={b.name} fill={b.approved ? COLORS.pos : COLORS.accent} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {omitted.length > 0 && <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Omitted (implausible): {omitted.join(', ')}.</p>}
              </Panel>
            </div>

            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              The API reports each run's metrics but not whether the price history was real or simulated, so treat results as research output and validate before allocating capital.
              Walk-forward and Monte-Carlo runs are POST-only endpoints; their output isn't stored for retrieval, so it isn't shown here.
            </p>
          </>
        )}
      </div>
    </>
  )
}

function Dash({ loading }: { loading: boolean }) {
  return <span className="muted" aria-label={loading ? 'loading' : 'not available'}>{loading ? '…' : '—'}</span>
}

function RunHistory({ run, history, error }: { run: Run; history: RunDetail[] | undefined; error?: string }) {
  const reason = run.detail?.rejection_reason
  const cols: Column<RunDetail>[] = [
    { key: 'at', header: 'Run', cell: (d) => <span className="num">{fmtStamp(d.run_at)}</span> },
    { key: 'tr', header: 'Trades', align: 'r', cell: (d) => <span className="num">{d.total_trades}</span> },
    { key: 'wr', header: 'Win %', align: 'r', cell: (d) => <span className="num">{fmtPct(d.win_rate, 1)}</span> },
    { key: 'wl', header: 'Win/loss', align: 'r', tip: 'Average win ÷ average loss', cell: (d) => <span className="num">{fmtNum(d.win_loss_ratio)}</span> },
    { key: 'sh', header: 'Sharpe', align: 'r', cell: (d) => <span className="num">{fmtNum(d.sharpe_ratio)}</span> },
    { key: 'dd', header: 'Max DD', align: 'r', cell: (d) => <span className="num">{fmtPct(d.max_drawdown, 1)}</span> },
    { key: 'np', header: 'Net P&L', align: 'r', cell: (d) => <span className={clsx('num', pnlTone(d.net_pnl))}>{fmtINR(d.net_pnl, { sign: true })}</span> },
    { key: 'ok', header: 'Gate', cell: (d) => <Badge tone={d.approved ? 'pos' : 'neg'}>{d.approved ? 'approved' : 'rejected'}</Badge> },
  ]
  return (
    <div className="stack" style={{ gap: 10 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ fontSize: 12.5 }}>
        <span className="muted">Gate: </span>
        {run.approved ? 'approved' : 'rejected'}
        {reason ? <> — <span style={{ color: 'var(--text-2)' }}>{reason}</span></> : !run.approved && <span className="muted"> (no reason recorded)</span>}
      </div>
      {error ? (
        <p className="neg" style={{ fontSize: 12.5, margin: 0 }}>Run history unavailable: {error}</p>
      ) : history ? (
        <DataTable<RunDetail> dense rows={history} rowKey={(d) => d.id} columns={cols} maxHeight={220} />
      ) : (
        <Skeleton height={60} />
      )}
    </div>
  )
}
