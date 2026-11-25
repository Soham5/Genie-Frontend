import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download } from 'lucide-react'
import { useSessionDate } from '@/api/session'
import { useTrades } from '@/api/TradesProvider'
import { Badge, Callout, PageHead, Panel, Seg, Skeleton } from '@/components/ui/Panel'
import { Stat } from '@/components/ui/Stat'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { AXIS, ChartTooltip, GRID } from '@/components/charts/chartKit'
import { computeStats, dailyPnl, equityCurve, groupBy, histogram, rMultiple, tradeCosts } from '@/lib/stats'
import { fmtDate, fmtINR, fmtNum, fmtPct, pnlTone, prettyStrategy } from '@/lib/format'
import type { ClosedTrade } from '@/lib/trades'
import { clsx } from '@/lib/clsx'

type Scope = 'session' | 'all'
type Lane = 'all' | 'managed' | 'research'

const frictionOf = (t: ClosedTrade) => tradeCosts(t) + t.slippage

export default function Trading() {
  const { trades, loading, error, unsupported, truncated } = useTrades()
  const { date } = useSessionDate()
  const { search } = useLocation()
  const [scope, setScope] = useState<Scope>('session')
  const [lane, setLane] = useState<Lane>('all')
  const [strategy, setStrategy] = useState('all')

  const strategies = useMemo(() => [...new Set(trades.map((t) => t.strategy))].sort(), [trades])
  const scoped = useMemo(
    () => trades.filter((t) => (lane === 'all' || t.lane === lane) && (strategy === 'all' || t.strategy === strategy) && (scope === 'all' || t.exitDate === date)),
    [trades, scope, date, lane, strategy],
  )
  const stats = useMemo(() => computeStats(scoped), [scoped])
  const detailed = useMemo(() => scoped.filter((t) => t.hasDetail), [scoped])
  const friction = detailed.reduce((a, t) => a + frictionOf(t), 0)

  const columns: Column<ClosedTrade>[] = [
    { key: 'exit', header: 'Exit', sort: (t) => `${t.exitDate} ${t.exitT ?? ''}`, cell: (t) => <span className="num">{fmtDate(t.exitDate)} {t.exitT?.slice(0, 5) ?? ''}</span> },
    { key: 'strategy', header: 'Strategy', sort: (t) => t.strategy, cell: (t) => <span>{prettyStrategy(t.strategy)} <Badge tone={t.lane === 'managed' ? 'accent' : 'outline'}>{t.lane}</Badge></span> },
    { key: 'symbol', header: 'Symbol', sort: (t) => t.symbol, cell: (t) => <span className="mono">{t.symbol}</span> },
    { key: 'side', header: 'Side', cell: (t) => (t.side ? <Badge tone={t.side === 'BUY' ? 'pos' : 'neg'}>{t.side}</Badge> : <span className="muted">—</span>) },
    { key: 'qty', header: 'Qty', align: 'r', sort: (t) => t.qty, cell: (t) => <span className="num">{t.qty}</span> },
    { key: 'entry', header: 'Entry', align: 'r', cell: (t) => <span className="num">{fmtNum(t.entryPrice)}</span> },
    { key: 'exitp', header: 'Exit px', align: 'r', cell: (t) => <span className="num">{fmtNum(t.exitPrice)}</span> },
    { key: 'reason', header: 'Reason', sort: (t) => t.reason ?? '', cell: (t) => <Badge tone={t.reason === 'TARGET_HIT' ? 'pos' : t.reason === 'SL_HIT' ? 'neg' : 'muted'}>{(t.reason ?? '—').replace('_HIT', '')}</Badge> },
    { key: 'r', header: 'R', align: 'r', sort: (t) => rMultiple(t), tip: 'Net P&L ÷ risk budgeted at entry', cell: (t) => { const r = rMultiple(t); return <span className={clsx('num', pnlTone(r))}>{r == null ? '—' : `${fmtNum(r)}R`}</span> } },
    { key: 'gross', header: 'Gross', align: 'r', sort: (t) => (t.hasDetail ? t.gross : null), cell: (t) => (t.hasDetail ? <span className={clsx('num', pnlTone(t.gross))}>{fmtINR(t.gross, { sign: true })}</span> : <span className="muted">n/a</span>) },
    { key: 'costs', header: 'Costs', align: 'r', sort: (t) => (t.hasDetail ? frictionOf(t) : null), cell: (t) => (t.hasDetail ? <span className="num muted">{fmtINR(frictionOf(t), { decimals: true })}</span> : <span className="muted" title="Closed before the API recorded charges">n/a</span>) },
    { key: 'net', header: 'Net', align: 'r', sort: (t) => t.net, cell: (t) => <strong className={clsx('num', pnlTone(t.net))}>{fmtINR(t.net, { sign: true, decimals: true })}</strong> },
  ]

  return (
    <>
      <PageHead
        title="P&L"
        sub="Realised trade P&L and analytics, net of modelled costs."
        actions={
          <>
            <select className="select" value={strategy} onChange={(e) => setStrategy(e.target.value)} aria-label="Strategy filter" style={{ maxWidth: 190 }}>
              <option value="all">All strategies</option>
              {strategies.map((s) => <option key={s} value={s}>{prettyStrategy(s)}</option>)}
            </select>
            <Seg<Lane> label="Lane" value={lane} onChange={setLane} options={[{ value: 'all', label: 'All lanes' }, { value: 'managed', label: 'Managed' }, { value: 'research', label: 'Research' }]} />
            <Seg<Scope> label="Scope" value={scope} onChange={setScope} options={[{ value: 'session', label: fmtDate(date) }, { value: 'all', label: 'All sessions' }]} />
          </>
        }
      />
      <div className="stack">
        <div className="grid cols-6">
          <Stat label="Net P&L" value={fmtINR(stats.net, { sign: true })} tone={pnlTone(stats.net)} foot={detailed.length ? `gross ${fmtINR(detailed.reduce((a, t) => a + t.gross, 0), { sign: true })}${detailed.length < scoped.length ? ' (detailed trades)' : ''}` : 'after costs'} accent={stats.count ? (stats.net >= 0 ? 'pos' : 'neg') : undefined} />
          <Stat label="Costs" value={detailed.length ? fmtINR(friction) : '—'} foot={detailed.length === scoped.length ? 'brokerage · STT · fees · GST · slippage' : `on ${detailed.length} of ${scoped.length} trades with cost detail`} help="Total friction. Only trades closed after the API began recording charges are included." />
          <Stat label="Win rate" value={fmtPct(stats.winRate, 0)} foot={`${stats.wins}W / ${stats.losses}L of ${stats.count}`} />
          <Stat label="Payoff ratio" value={fmtNum(stats.payoff)} foot={`avg win ${fmtINR(stats.avgWin)} · loss ${fmtINR(stats.avgLoss)}`} help="Average win ÷ average loss." />
          <Stat label="Profit factor" value={fmtNum(stats.profitFactor)} foot={`expectancy ${fmtINR(stats.expectancy, { sign: true })}`} help="Gross wins ÷ gross losses. Above 1.0 is profitable." />
          <Stat label="Avg R" value={stats.avgR == null ? '—' : `${fmtNum(stats.avgR)}R`} tone={pnlTone(stats.avgR)} foot={`max DD ${fmtINR(stats.maxDrawdown)}`} help="Mean R-multiple over trades with recorded entry risk." />
        </div>

        {unsupported && <Callout tone="warn" title="Closed trades unavailable.">The API has no <code>/console/trades</code> endpoint — update the Genie backend.</Callout>}
        {error && !unsupported && <Callout tone="warn" title="Closed trades unavailable.">{error.message}</Callout>}
        {truncated && <Callout tone="info">The API returned its row limit, so the oldest trades are not included.</Callout>}
        <Callout tone="info">
          Realised P&amp;L only. Open positions, F&amp;O legs and mark-to-market live on the <Link className="link-btn" to={{ pathname: '/positions', search }}>Positions</Link> page.
          {scoped.length > detailed.length && <> {scoped.length - detailed.length} trade{scoped.length - detailed.length === 1 ? '' : 's'} closed before the API recorded charges, so gross and cost figures cover only the rest.</>}
        </Callout>

        <Panel
          title="Trade blotter"
          sub={`${scoped.length} closed trades · click a row for the cost waterfall`}
          flush
          actions={<button className="btn btn--sm" onClick={() => exportCsv(scoped)} disabled={!scoped.length}><Download size={13} /> CSV</button>}
        >
          {loading && !trades.length ? <Skeleton height={200} /> : <DataTable
            rows={scoped}
            columns={columns}
            rowKey={(t) => t.id}
            initialSort={{ key: 'exit', dir: 'desc' }}
            maxHeight={460}
            emptyTitle="No closed trades in this scope"
            emptyHint="Try All sessions, or pick a different date."
            expand={(t) => <Waterfall t={t} />}
          />}
        </Panel>

        <Analytics trades={scoped} />
      </div>
    </>
  )
}

// Sticky so the detail stays inside the visible area when the wide table scrolls sideways.
const DETAIL_BOX = { position: 'sticky', left: 0, maxWidth: 'min(760px, calc(100vw - 80px))' } as const

function Waterfall({ t }: { t: ClosedTrade }) {
  if (!t.hasDetail) {
    return (
      <dl className="kv" style={DETAIL_BOX}>
        <dt>Entry → exit</dt><dd className="num">{fmtNum(t.entryPrice)} → {fmtNum(t.exitPrice)}</dd>
        <dt>Net P&amp;L</dt><dd className={clsx('num', pnlTone(t.net))}>{fmtINR(t.net, { sign: true, decimals: true })}</dd>
        <dt>Cost detail</dt><dd className="muted">Not recorded — this trade closed before the API stored charges.</dd>
      </dl>
    )
  }
  const rows: [string, number][] = [
    ['Gross P&L', t.gross],
    ['Brokerage', -t.brokerage],
    ['STT', -t.stt],
    ['Exchange charges', -t.exchCharges],
    ['GST', -t.gst],
    ['Other', -t.other],
    ['Slippage', -t.slippage],
  ]
  return (
    <div className="grid cols-2" style={{ alignItems: 'start', ...DETAIL_BOX }}>
      <dl className="kv">
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt>{k}</dt>
            <dd className={clsx('num', pnlTone(v))}>{fmtINR(v, { sign: true, decimals: true })}</dd>
          </div>
        ))}
        <dt><strong>Net P&amp;L</strong></dt>
        <dd className={clsx('num', pnlTone(t.net))}><strong>{fmtINR(t.net, { sign: true, decimals: true })}</strong></dd>
      </dl>
      <dl className="kv">
        <dt>Entry → exit</dt><dd className="num">{fmtNum(t.entryPrice)} → {fmtNum(t.exitPrice)}</dd>
        <dt>Stop / target</dt><dd className="num">{fmtNum(t.stopLoss)} / {fmtNum(t.target)}</dd>
        <dt>Initial risk</dt><dd className="num">{fmtINR(t.initialRisk)}</dd>
        <dt>Held</dt><dd className="num">{t.entryDate} {t.entryT?.slice(0, 5)} → {t.exitDate} {t.exitT?.slice(0, 5) ?? ''}</dd>
      </dl>
    </div>
  )
}

function Analytics({ trades }: { trades: ClosedTrade[] }) {
  const byStrategy = useMemo(
    () => Object.entries(groupBy(trades, (t) => t.strategy)).map(([id, ts]) => ({ name: prettyStrategy(id), net: ts.reduce((a, t) => a + t.net, 0), n: ts.length })).sort((a, b) => b.net - a.net),
    [trades],
  )
  const reasons = useMemo(
    () => Object.entries(groupBy(trades, (t) => t.reason ?? 'OTHER')).map(([r, ts]) => ({ name: r.replace('_HIT', ''), count: ts.length, net: ts.reduce((a, t) => a + t.net, 0) })),
    [trades],
  )
  const rs = useMemo(() => trades.map(rMultiple).filter((r): r is number => r != null), [trades])
  const rHist = useMemo(() => histogram(rs, 0.5, -3, 3), [rs])
  const daily = useMemo(() => dailyPnl(trades), [trades])
  const curve = useMemo(() => equityCurve(trades), [trades])

  if (!trades.length) return <Callout tone="info">Analytics appear once there are closed trades in the selected scope.</Callout>

  return (
    <div className="grid cols-2">
      <Panel title="Equity curve" sub="Cumulative net P&L in exit order, with drawdown from the high-water mark">
        <div className="chart" style={{ height: 240 }} role="img" aria-label="Equity curve">
          <ResponsiveContainer>
            <AreaChart data={curve} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="i" {...AXIS} minTickGap={24} />
              <YAxis {...AXIS} width={56} tickFormatter={(v: number) => fmtINR(v, { compact: true })} />
              <ReferenceLine y={0} stroke="var(--border-strong)" />
              <Tooltip content={<ChartTooltip format={(v) => fmtINR(v, { sign: true })} title={(_l, p) => String(p[0]?.payload?.label ?? '')} />} />
              <Area type="monotone" dataKey="equity" name="Equity" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.12} strokeWidth={1.6} isAnimationActive={false} />
              <Area type="monotone" dataKey="drawdown" name="Drawdown" stroke="var(--neg)" fill="var(--neg)" fillOpacity={0.12} strokeWidth={1} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Net P&L by strategy" sub="Ranked; sample sizes are small, so treat as descriptive">
        <div className="chart" style={{ height: Math.max(180, byStrategy.length * 34 + 30) }} role="img" aria-label="Net P&L by strategy">
          <ResponsiveContainer>
            <BarChart data={byStrategy} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid {...GRID} horizontal={false} vertical />
              <XAxis type="number" {...AXIS} tickFormatter={(v: number) => fmtINR(v, { compact: true })} />
              <YAxis type="category" dataKey="name" {...AXIS} width={140} />
              <ReferenceLine x={0} stroke="var(--border-strong)" />
              <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip format={(v) => fmtINR(v, { sign: true })} title={(l, p) => `${l} · ${p[0]?.payload?.n} trades`} />} />
              <Bar dataKey="net" name="Net P&L" radius={2} isAnimationActive={false}>
                {byStrategy.map((s) => <Cell key={s.name} fill={s.net >= 0 ? 'var(--pos)' : 'var(--neg)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Exit reasons" sub="How trades ended, and what each bucket earned">
        <div className="chart" style={{ height: 220 }} role="img" aria-label="Exit reasons">
          <ResponsiveContainer>
            <BarChart data={reasons} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="name" {...AXIS} />
              <YAxis {...AXIS} width={32} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip format={(v) => String(v)} title={(l, p) => `${l} · net ${fmtINR(p[0]?.payload?.net as number, { sign: true })}`} />} />
              <Bar dataKey="count" name="Trades" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {reasons.map((r) => <Cell key={r.name} fill={r.net >= 0 ? 'var(--pos)' : 'var(--neg)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="R-multiple distribution" sub={`${rs.length} trades with recorded risk · bins of 0.5R, clipped to ±3R`} help="R = net P&L ÷ risk at entry. A healthy system has a right-skewed distribution (small losses, large winners).">
        <div className="chart" style={{ height: 220 }} role="img" aria-label="R-multiple histogram">
          <ResponsiveContainer>
            <BarChart data={rHist} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" {...AXIS} interval={1} />
              <YAxis {...AXIS} width={32} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip format={(v) => `${v} trades`} title={(l) => `Bin from ${l}`} />} />
              <Bar dataKey="count" name="Trades" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {rHist.map((b) => <Cell key={b.x} fill={b.x >= 0 ? 'var(--pos)' : 'var(--neg)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Daily net P&L" sub="Per exit date">
        <div className="chart" style={{ height: 220 }} role="img" aria-label="Daily net P&L">
          <ResponsiveContainer>
            <BarChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="date" {...AXIS} tickFormatter={(d: string) => fmtDate(d)} minTickGap={24} />
              <YAxis {...AXIS} width={56} tickFormatter={(v: number) => fmtINR(v, { compact: true })} />
              <ReferenceLine y={0} stroke="var(--border-strong)" />
              <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip format={(v) => fmtINR(v, { sign: true })} title={(l) => fmtDate(String(l), 'long')} />} />
              <Bar dataKey="net" name="Net P&L" radius={2} isAnimationActive={false}>
                {daily.map((d) => <Cell key={d.date} fill={d.net >= 0 ? 'var(--pos)' : 'var(--neg)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  )
}

function exportCsv(trades: ClosedTrade[]) {
  const head = ['entry_date', 'entry_time', 'exit_date', 'exit_time', 'strategy', 'lane', 'symbol', 'side', 'qty', 'entry_price', 'exit_price', 'stop_loss', 'target', 'reason', 'gross', 'brokerage', 'stt', 'exchange_charges', 'gst', 'other', 'slippage', 'net']
  const rows = trades.map((t) => [t.entryDate, t.entryT, t.exitDate, t.exitT, t.strategy, t.lane, t.symbol, t.side, t.qty, t.entryPrice, t.exitPrice, t.stopLoss, t.target, t.reason, t.hasDetail ? t.gross : null, t.hasDetail ? t.brokerage : null, t.hasDetail ? t.stt : null, t.hasDetail ? t.exchCharges : null, t.hasDetail ? t.gst : null, t.hasDetail ? t.other : null, t.hasDetail ? t.slippage : null, t.net])
  const csv = [head, ...rows].map((r) => r.map((v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v))).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = 'genie-trades.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}
