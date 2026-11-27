import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { FlaskConical, X } from 'lucide-react'
import { useApi } from '@/api/useApi'
import { Badge, Empty, Skeleton } from '@/components/ui/Panel'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { ApiErrorNote } from '@/components/ui/ApiErrorNote'
import { SideChip } from '@/components/ui/bits'
import { AXIS, COLORS, ChartTooltip, GRID } from '@/components/charts/chartKit'
import { dailyPnl, equityCurve, type TradeStats } from '@/lib/stats'
import type { ClosedTrade } from '@/lib/trades'
import type { Position } from '@/lib/positions'
import { fmtDate, fmtINR, fmtNum, fmtPct, pnlTone, prettyStrategy } from '@/lib/format'
import { fmtStamp } from '@/lib/stamp'
import { clsx } from '@/lib/clsx'
import './Strategies.css'

export interface StrategyCfg {
  class_name: string
  segment: string
  timeframe: string
  status: string
  params: Record<string, unknown>
}

interface StatusPayload { strategy_id: string; status: string; segment: string }
interface Deployment {
  deployment_id: string
  mode: string
  status: string
  risk_policy: unknown
  capital_budget_inr: number | null
  parent_deployment_id: string | null
  created_at: string | null
}
interface Evaluation {
  evaluation_id: string
  from_mode: string
  to_mode: string
  verdict: string
  reasons: unknown
  gate_policy_version: string
  evaluated_at: string | null
}
interface KpiSnapshot {
  total_trades: number
  net_pnl: number
  win_rate: number
  sharpe_ratio: number
  sortino_ratio: number
  max_drawdown: number
  profit_factor: number
  expectancy: number
  roi_pct: number
  approved: boolean | null
  rejection_reasons: unknown
  computed_at: string | null
  session_date?: string | null
}
interface ComparePayload { backtest: KpiSnapshot | null; paper: KpiSnapshot | null; live: KpiSnapshot | null }

export const STATUS_TONE: Record<string, 'pos' | 'info' | 'warn' | 'violet' | 'muted' | 'accent'> = {
  live: 'pos',
  shadow_live: 'violet',
  paper_approved: 'info',
  approved: 'accent',
  pending: 'warn',
  deactivated: 'muted',
}
export const prettyStatus = (s: string) => s.replaceAll('_', ' ')

const VERDICT_TONE: Record<string, 'pos' | 'neg' | 'warn'> = { approved: 'pos', rejected: 'neg', inconclusive: 'warn' }

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))) : v ? [typeof v === 'string' ? v : JSON.stringify(v)] : [])
const asText = (v: unknown) => (v != null && typeof v === 'object' ? JSON.stringify(v) : String(v))

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="sdrawer__section-title">{title}</h4>
      {children}
    </section>
  )
}

function Metric({ label, value, tone }: { label: string; value: ReactNode; tone?: 'pos' | 'neg' | 'flat' }) {
  return (
    <div>
      <div className="metric__label">{label}</div>
      <div className={clsx('metric__value num', tone)}>{value}</div>
    </div>
  )
}

export function StrategyDrawer({ id, cfg, trades, positions, stats, onClose }: {
  id: string
  cfg: StrategyCfg | null
  trades: ClosedTrade[]
  positions: Position[]
  stats: TradeStats
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const { search } = useLocation()
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [onClose])

  const registered = cfg != null
  const status = useApi<StatusPayload>(`/strategies/${encodeURIComponent(id)}/status`, { enabled: registered })
  const deployments = useApi<{ deployments: Deployment[] }>(`/strategies/${encodeURIComponent(id)}/deployments`, { enabled: registered })
  const evals = useApi<{ evaluations: Evaluation[] }>(`/strategies/${encodeURIComponent(id)}/promotion-evaluations`, { enabled: registered })
  const compare = useApi<ComparePayload>(`/kpi/compare/${encodeURIComponent(id)}`)

  const curve = useMemo(() => equityCurve(trades), [trades])
  const daily = useMemo(() => dailyPnl(trades), [trades])
  const recent = useMemo(() => [...trades].reverse().slice(0, 40), [trades])
  const liveStatus = status.data?.status ?? cfg?.status ?? null
  const up = (curve.at(-1)?.equity ?? 0) >= 0
  const stroke = up ? COLORS.pos : COLORS.neg
  const openPnl = positions.reduce((s, p) => s + (p.pnl ?? 0), 0)

  const tradeCols: Column<ClosedTrade>[] = [
    { key: 'd', header: 'Exit', sort: (t) => `${t.exitDate}${t.exitT ?? ''}`, cell: (t) => <span className="num">{fmtDate(t.exitDate)} {t.exitT?.slice(0, 5) ?? ''}</span> },
    { key: 'sym', header: 'Instrument', cell: (t) => <span>{t.symbol}</span> },
    { key: 'side', header: 'Side', cell: (t) => <SideChip side={t.side} /> },
    { key: 'qty', header: 'Qty', align: 'r', cell: (t) => <span className="num">{t.qty}</span> },
    { key: 'why', header: 'Exit reason', cell: (t) => <span className="muted">{t.reason ?? '—'}</span> },
    { key: 'net', header: 'Net', align: 'r', sort: (t) => t.net, cell: (t) => <strong className={clsx('num', pnlTone(t.net))}>{fmtINR(t.net, { sign: true })}</strong> },
  ]

  const deploymentCols: Column<Deployment>[] = [
    { key: 'mode', header: 'Mode', cell: (d) => <Badge tone="outline">{prettyStatus(d.mode)}</Badge> },
    { key: 'st', header: 'Status', cell: (d) => <Badge tone={d.status === 'active' ? 'pos' : 'muted'} dot>{d.status}</Badge> },
    { key: 'cap', header: 'Capital', align: 'r', cell: (d) => <span className="num">{fmtINR(d.capital_budget_inr)}</span> },
    { key: 'at', header: 'Created', cell: (d) => <span className="num">{fmtStamp(d.created_at)}</span> },
  ]

  return (
    <>
      <div className="sdrawer__scrim" onClick={onClose} aria-hidden />
      <aside className="sdrawer" role="dialog" aria-modal="true" aria-label={`${prettyStrategy(id)} details`}>
        <header className="sdrawer__head">
          <div>
            <h3 className="sdrawer__title">{prettyStrategy(id)}</h3>
            <div className="row row--wrap" style={{ marginTop: 6, gap: 6 }}>
              <span className="mono muted" style={{ fontSize: 11.5 }}>{id}</span>
              {liveStatus && <Badge tone={STATUS_TONE[liveStatus] ?? 'muted'} dot>{prettyStatus(liveStatus)}</Badge>}
              {cfg && <Badge tone="outline">{cfg.segment}</Badge>}
              {cfg && <Badge tone="outline">{cfg.timeframe}</Badge>}
              {!registered && <Badge tone="warn" title="Trades exist for this id but the API's strategy registry doesn't list it.">not in registry</Badge>}
            </div>
            {cfg && <div className="muted mono" style={{ fontSize: 11, marginTop: 6 }}>{cfg.class_name}</div>}
            {registered && (
              <Link className="btn btn--sm" style={{ marginTop: 10 }} to={{ pathname: '/backtests', search }} state={{ strategies: [id] }}>
                <FlaskConical size={13} /> Backtest this strategy
              </Link>
            )}
          </div>
          <button ref={closeRef} type="button" className="sdrawer__close" onClick={onClose} aria-label="Close details">
            <X size={16} />
          </button>
        </header>

        <div className="sdrawer__body">
          <Section title="Performance (closed trades)">
            {stats.count === 0 ? (
              <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>No closed trades from the API for this strategy yet.</p>
            ) : (
              <div className="sdrawer__metrics">
                <Metric label="Net P&L" value={fmtINR(stats.net, { sign: true })} tone={pnlTone(stats.net)} />
                <Metric label="Trades" value={stats.count} />
                <Metric label="Win rate" value={fmtPct(stats.winRate, 0)} />
                <Metric label="Profit factor" value={fmtNum(stats.profitFactor)} />
                <Metric label="Expectancy" value={fmtINR(stats.expectancy, { sign: true })} tone={pnlTone(stats.expectancy)} />
                <Metric label="Max drawdown" value={fmtINR(stats.maxDrawdown)} tone={stats.maxDrawdown < 0 ? 'neg' : 'flat'} />
                <Metric label="Avg R" value={stats.avgR == null ? '—' : `${fmtNum(stats.avgR)}R`} />
                <Metric label="Costs" value={fmtINR(stats.costs)} />
                <Metric label="Avg win" value={fmtINR(stats.avgWin)} tone="pos" />
                <Metric label="Avg loss" value={fmtINR(stats.avgLoss)} tone="neg" />
                <Metric label="Payoff" value={fmtNum(stats.payoff)} />
                <Metric label="Loss streak" value={stats.maxLossStreak} />
              </div>
            )}
          </Section>

          {curve.length > 1 && (
            <Section title="Equity curve (cumulative net P&L)">
              <div className="chart" style={{ height: 190 }} role="img" aria-label={`Cumulative net P&L over ${curve.length} trades`}>
                <ResponsiveContainer>
                  <AreaChart data={curve} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="sdEq" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="i" {...AXIS} minTickGap={28} />
                    <YAxis {...AXIS} width={52} tickFormatter={(v: number) => fmtINR(v, { compact: true })} />
                    <ReferenceLine y={0} stroke="var(--border-strong)" />
                    <Tooltip
                      content={<ChartTooltip format={(v) => fmtINR(v, { sign: true })} title={(_l, p) => `Trade ${String(p[0]?.payload?.i ?? '')} · ${String(p[0]?.payload?.label ?? '')}`} />}
                    />
                    <Area type="monotone" dataKey="equity" name="Equity" stroke={stroke} strokeWidth={1.8} fill="url(#sdEq)" isAnimationActive={false} />
                    <Area type="monotone" dataKey="drawdown" name="Drawdown" stroke={COLORS.neg} strokeWidth={1} strokeOpacity={0.6} fill="none" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Section>
          )}

          {daily.length > 1 && (
            <Section title="Daily net P&L">
              <div className="chart" style={{ height: 110 }} role="img" aria-label="Daily net P&L">
                <ResponsiveContainer>
                  <BarChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="date" {...AXIS} tickFormatter={(d: string) => fmtDate(d)} minTickGap={24} />
                    <YAxis {...AXIS} width={52} tickFormatter={(v: number) => fmtINR(v, { compact: true })} />
                    <ReferenceLine y={0} stroke="var(--border-strong)" />
                    <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip format={(v) => fmtINR(v, { sign: true })} />} />
                    <Bar dataKey="net" name="Net" isAnimationActive={false}>
                      {daily.map((d) => (
                        <Cell key={d.date} fill={d.net >= 0 ? COLORS.pos : COLORS.neg} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
          )}

          <Section title={`Open positions (${positions.length})`}>
            {positions.length === 0 ? (
              <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>No open positions in the live book.</p>
            ) : (
              <>
                <div className="tbl-wrap">
                  <table className="tbl tbl--dense">
                    <thead>
                      <tr><th>Instrument</th><th>Lane</th><th>Side</th><th className="r">Qty</th><th className="r">MTM</th></tr>
                    </thead>
                    <tbody>
                      {positions.map((p) => (
                        <tr key={p.id}>
                          <td>{p.instrument}</td>
                          <td><Badge tone="outline">{p.lane}</Badge></td>
                          <td><SideChip side={p.side} /></td>
                          <td className="r num">{p.qty}</td>
                          <td className={clsx('r num', pnlTone(p.pnl))}>{fmtINR(p.pnl, { sign: true })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Total MTM <strong className={clsx('num', pnlTone(openPnl))}>{fmtINR(openPnl, { sign: true })}</strong></p>
              </>
            )}
          </Section>

          <Section title="Backtest vs paper vs live (KPI engine)">
            {compare.loading ? (
              <Skeleton height={110} />
            ) : compare.error ? (
              <ApiErrorNote error={compare.error} what="KPI comparison" compact />
            ) : !compare.data || (!compare.data.backtest && !compare.data.paper && !compare.data.live) ? (
              <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>The KPI engine has no stored snapshot for this strategy.</p>
            ) : (
              <KpiCompare data={compare.data} />
            )}
          </Section>

          <Section title="Deployment history">
            {!registered ? (
              <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Not in the registry — no deployments.</p>
            ) : deployments.loading ? (
              <Skeleton height={70} />
            ) : deployments.error ? (
              <ApiErrorNote error={deployments.error} what="deployments" compact />
            ) : (
              <DataTable<Deployment> dense rows={deployments.data?.deployments ?? []} rowKey={(d) => d.deployment_id} columns={deploymentCols} emptyTitle="No deployments recorded" emptyHint="Stage history appears once the strategy enters a deployment stage." />
            )}
          </Section>

          <Section title="Promotion evaluations">
            {!registered ? (
              <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Not in the registry — no evaluations.</p>
            ) : evals.loading ? (
              <Skeleton height={70} />
            ) : evals.error ? (
              <ApiErrorNote error={evals.error} what="promotion evaluations" compact />
            ) : !evals.data?.evaluations.length ? (
              <Empty title="No promotion evaluations yet">Stage-gate checks are recorded here when run.</Empty>
            ) : (
              <div>
                {evals.data.evaluations.map((e) => (
                  <div className="sdrawer__eval" key={e.evaluation_id}>
                    <div className="row row--between">
                      <span className="row" style={{ gap: 6 }}>
                        <Badge tone={VERDICT_TONE[e.verdict] ?? 'muted'} dot>{e.verdict}</Badge>
                        <span style={{ fontSize: 12.5 }}>{prettyStatus(e.from_mode)} → {prettyStatus(e.to_mode)}</span>
                      </span>
                      <span className="muted num" style={{ fontSize: 11.5 }}>{fmtStamp(e.evaluated_at)} · policy {e.gate_policy_version}</span>
                    </div>
                    {asList(e.reasons).length > 0 && <ul>{asList(e.reasons).map((r, i) => <li key={i}>{r}</li>)}</ul>}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {cfg && Object.keys(cfg.params ?? {}).length > 0 && (
            <Section title="Parameters (registry)">
              <dl className="kv sdrawer__params">
                {Object.entries(cfg.params).map(([k, v]) => (
                  <div key={k} style={{ display: 'contents' }}>
                    <dt className="mono" style={{ fontSize: 12 }}>{k}</dt>
                    <dd>{asText(v)}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          {recent.length > 0 && (
            <Section title={`Recent closed trades (${recent.length} of ${trades.length})`}>
              <DataTable<ClosedTrade> dense maxHeight={260} rows={recent} rowKey={(t) => t.id} columns={tradeCols} />
            </Section>
          )}
        </div>
      </aside>
    </>
  )
}

function KpiCompare({ data }: { data: ComparePayload }) {
  const cols = [['Backtest', data.backtest], ['Paper', data.paper], ['Live', data.live]] as const
  const rows: { label: string; get: (k: KpiSnapshot) => ReactNode }[] = [
    { label: 'Trades', get: (k) => k.total_trades },
    { label: 'Net P&L', get: (k) => <span className={pnlTone(k.net_pnl)}>{fmtINR(k.net_pnl, { sign: true })}</span> },
    { label: 'Win rate', get: (k) => fmtPct(k.win_rate, 1) },
    { label: 'Sharpe', get: (k) => fmtNum(k.sharpe_ratio) },
    { label: 'Profit factor', get: (k) => fmtNum(k.profit_factor) },
    { label: 'Max DD', get: (k) => fmtPct(k.max_drawdown, 1) },
    { label: 'ROI', get: (k) => fmtPct(k.roi_pct, 1, true) },
    { label: 'Gate', get: (k) => (k.approved == null ? '—' : <Badge tone={k.approved ? 'pos' : 'neg'} title={asList(k.rejection_reasons).join('; ')}>{k.approved ? 'approved' : 'rejected'}</Badge>) },
    { label: 'Computed', get: (k) => <span className="muted">{fmtStamp(k.computed_at)}</span> },
  ]
  return (
    <div className="tbl-wrap">
      <table className="tbl tbl--dense">
        <thead>
          <tr>
            <th />
            {cols.map(([n]) => <th key={n} className="r">{n}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="muted">{r.label}</td>
              {cols.map(([n, k]) => <td key={n} className="r num">{k ? r.get(k) : '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
