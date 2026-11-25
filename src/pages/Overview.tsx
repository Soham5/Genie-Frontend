import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { num } from '@/api/client'
import { useApiState } from '@/api/ApiProvider'
import { useSessionDate } from '@/api/session'
import { useTrades } from '@/api/TradesProvider'
import type { RiskSession } from '@/api/types'
import { useApi } from '@/api/useApi'
import { useLiveBook } from '@/hooks/useLiveBook'
import { Badge, Callout, PageHead, Panel, Skeleton } from '@/components/ui/Panel'
import { Stat } from '@/components/ui/Stat'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { AXIS, ChartTooltip, GRID } from '@/components/charts/chartKit'
import { computeStats, dailyPnl, equityCurve, groupBy } from '@/lib/stats'
import type { ClosedTrade } from '@/lib/trades'
import { fmtDate, fmtINR, fmtPct, pnlTone, prettyStrategy } from '@/lib/format'
import { clsx } from '@/lib/clsx'
import { ApiNote, clock, fmtRel, Gauge } from './ops/shared'

const CIRCUIT_TONE: Record<string, 'pos' | 'warn' | 'neg' | 'muted'> = { NORMAL: 'pos', ACTIVE: 'pos', CAUTION: 'warn', REDUCED: 'warn', HALTED: 'neg', HALT: 'neg', TRIPPED: 'neg' }

export default function Overview() {
  const { status, health, kill, runner } = useApiState()
  const { date, isToday } = useSessionDate()
  const { search } = useLocation()
  const { trades, loading, error, unsupported } = useTrades()
  const book = useLiveBook()
  const session = useApi<RiskSession>('/risk/session', { poll: 10000, enabled: status === 'online' })

  const day = useMemo(() => trades.filter((t) => t.exitDate === date), [trades, date])
  const dayStats = useMemo(() => computeStats(day), [day])
  const allStats = useMemo(() => computeStats(trades), [trades])
  const curve = useMemo(() => equityCurve(trades), [trades])
  const daily = useMemo(() => dailyPnl(trades).slice(-30), [trades])
  const byStrategy = useMemo(
    () => Object.entries(groupBy(day, (t) => t.strategy)).map(([id, ts]) => ({ name: prettyStrategy(id), net: ts.reduce((a, t) => a + t.net, 0), n: ts.length })).sort((a, b) => b.net - a.net),
    [day],
  )

  const s = session.data
  const cap = s ? num(s.config.trading_capital) : null
  const cur = s ? num(s.current_capital) : null
  const peak = s ? num(s.peak_capital) : null
  const dayPnl = s ? num(s.daily_pnl) : null
  const weekPnl = s ? num(s.weekly_pnl) : null
  const maxDay = s ? num(s.config.max_daily_loss) : null
  const maxWeek = s ? num(s.config.max_weekly_loss) : null
  const dd = cur != null && peak != null && peak > 0 ? ((peak - cur) / peak) * 100 : null
  const dayUse = dayPnl != null && maxDay ? Math.max(0, -dayPnl) / maxDay : null
  const weekUse = weekPnl != null && maxWeek ? Math.max(0, -weekPnl) / maxWeek : null
  const circuit = s?.circuit_state ?? null

  const recent: Column<ClosedTrade>[] = [
    { key: 'exit', header: 'Exit', sort: (t) => `${t.exitDate} ${t.exitT ?? ''}`, cell: (t) => <span className="num">{t.exitT?.slice(0, 5) ?? fmtDate(t.exitDate)}</span> },
    { key: 'sym', header: 'Instrument', cell: (t) => <span className="mono">{t.symbol}</span> },
    { key: 'strat', header: 'Strategy', cell: (t) => prettyStrategy(t.strategy) },
    { key: 'why', header: 'Exit', cell: (t) => <Badge tone={t.reason === 'TARGET_HIT' ? 'pos' : t.reason === 'SL_HIT' ? 'neg' : 'muted'}>{(t.reason ?? '—').replace('_HIT', '')}</Badge> },
    { key: 'net', header: 'Net', align: 'r', sort: (t) => t.net, cell: (t) => <strong className={clsx('num', pnlTone(t.net))}>{fmtINR(t.net, { sign: true })}</strong> },
  ]

  return (
    <>
      <PageHead title="Dashboard" sub={`Account and algo status for ${fmtDate(date, 'long')}, straight from the Genie API.`} />
      <div className="stack">
        {unsupported && <Callout tone="warn" title="Closed trades unavailable.">The API has no <code>/console/trades</code> endpoint — update the Genie backend.</Callout>}
        {error && !unsupported && <Callout tone="warn" title="Closed trades unavailable.">{error.message}</Callout>}

        <Panel title="Funds & risk" sub={s ? `Risk engine session ${s.session_date} · mode ${s.risk_mode}` : 'From /risk/session'}>
          {session.error && !s ? <ApiNote error={session.error} what="the risk session" /> : !s ? <Skeleton height={96} /> : (
            <div className="grid cols-4">
              <Stat label="Trading capital" value={fmtINR(cap)} foot={`total ${fmtINR(num(s.config.total_capital))}`} />
              <Stat label="Current capital" value={fmtINR(cur)} foot={`peak ${fmtINR(peak)}`} />
              <Stat label="Day P&L" value={fmtINR(dayPnl, { sign: true })} tone={pnlTone(dayPnl)} foot={`${num(s.trades_today) ?? 0} trades today`} accent={dayPnl == null ? undefined : dayPnl >= 0 ? 'pos' : 'neg'} />
              <Stat label="Week P&L" value={fmtINR(weekPnl, { sign: true })} tone={pnlTone(weekPnl)} foot={`drawdown from peak ${dd == null ? '—' : fmtPct(dd)}`} />
              <Gauge label="Daily loss used" valueText={fmtINR(dayPnl != null ? Math.max(0, -dayPnl) : null)} limitText={fmtINR(maxDay)} ratio={dayUse} help="Realised loss today against the daily-loss limit." />
              <Gauge label="Weekly loss used" valueText={fmtINR(weekPnl != null ? Math.max(0, -weekPnl) : null)} limitText={fmtINR(maxWeek)} ratio={weekUse} />
              <Stat label="Consecutive losses" value={String(num(s.consecutive_losses) ?? 0)} foot={s.cooldown_until ? `cooldown until ${s.cooldown_until}` : 'no cooldown'} />
              <Stat label="Open positions" value={`${num(s.open_fno_positions) ?? 0} F&O · ${num(s.open_equity_positions) ?? 0} eq`} foot="per risk engine" />
            </div>
          )}
        </Panel>

        <div className="grid cols-4">
          <Stat label="Circuit" value={circuit ?? '—'} tone={circuit ? (CIRCUIT_TONE[circuit.toUpperCase()] === 'pos' ? 'pos' : CIRCUIT_TONE[circuit.toUpperCase()] === 'neg' ? 'neg' : undefined) : undefined} foot={kill?.active ? `kill switch ON${kill.reason ? ` · ${kill.reason}` : ''}` : 'kill switch off'} accent={kill?.active ? 'neg' : undefined} />
          <Stat label="Runner" value={runner ? (runner.running ? 'Running' : 'Stopped') : '—'} tone={runner?.running ? 'pos' : undefined} foot={runner?.last_cycle_at ? `last cycle ${fmtRel(runner.last_cycle_at) || runner.last_cycle_at}` : 'no cycle yet'} />
          <Stat label="Broker" value={health ? (health.broker_connected ? 'Connected' : 'Disconnected') : '—'} tone={health ? (health.broker_connected ? 'pos' : 'neg') : undefined} foot={`websocket ${health?.websocket_state ?? '—'}`} />
          <Stat label="Live feed" value={book.state === 'live' ? 'Live' : book.state} foot={book.asOf ? `updated ${clock(book.asOf)}` : 'waiting'} />
        </div>

        <div className="grid cols-4">
          <Stat label="Open P&L (MTM)" value={book.totals.open == null ? '—' : fmtINR(book.totals.open, { sign: true })} tone={pnlTone(book.totals.open)} foot={`${book.totals.openCount} open${book.totals.unpriced ? ` · ${book.totals.unpriced} unpriced` : ''}`} accent={book.totals.open == null ? undefined : book.totals.open >= 0 ? 'pos' : 'neg'} />
          <Stat label={isToday ? 'Realised today' : 'Realised that day'} value={fmtINR(dayStats.net, { sign: true })} tone={pnlTone(dayStats.net)} foot={`${dayStats.count} closed trades`} />
          <Stat label="Win rate" value={dayStats.count ? fmtPct(dayStats.winRate, 0) : '—'} foot={`${dayStats.wins}W / ${dayStats.losses}L`} />
          <Stat label="All-time net" value={fmtINR(allStats.net, { sign: true })} tone={pnlTone(allStats.net)} foot={`${allStats.count} trades · PF ${allStats.profitFactor == null ? '—' : allStats.profitFactor.toFixed(2)}`} />
        </div>

        <div className="grid cols-2">
          <Panel title="Equity curve" sub="Cumulative net P&L across all closed trades, with drawdown">
            {loading && !trades.length ? <Skeleton height={220} /> : !curve.length ? <Callout tone="info">No closed trades yet.</Callout> : (
              <div className="chart" style={{ height: 220 }} role="img" aria-label="Equity curve">
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
            )}
          </Panel>

          <Panel title="Daily net P&L" sub="Last 30 sessions">
            {!daily.length ? <Callout tone="info">No sessions yet.</Callout> : (
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
            )}
          </Panel>
        </div>

        <div className="grid cols-2">
          <Panel flush title={`Closed trades · ${fmtDate(date)}`} sub="Most recent first" actions={<Link className="link-btn" to={{ pathname: '/trading', search }}>All P&amp;L →</Link>}>
            {loading && !trades.length ? <Skeleton height={140} /> : <DataTable dense rows={day.slice(-8)} columns={recent} rowKey={(t) => t.id} initialSort={{ key: 'exit', dir: 'desc' }} emptyTitle="No closed trades" emptyHint="Nothing was exited on this date." />}
          </Panel>
          <Panel title="Net P&L by strategy" sub={fmtDate(date, 'long')} actions={<Link className="link-btn" to={{ pathname: '/positions', search }}>Positions →</Link>}>
            {!byStrategy.length ? <Callout tone="info">No realised P&amp;L on this date.</Callout> : (
              <div className="chart" style={{ height: Math.max(160, byStrategy.length * 34 + 30) }} role="img" aria-label="Net P&L by strategy">
                <ResponsiveContainer>
                  <BarChart data={byStrategy} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid {...GRID} horizontal={false} vertical />
                    <XAxis type="number" {...AXIS} tickFormatter={(v: number) => fmtINR(v, { compact: true })} />
                    <YAxis type="category" dataKey="name" {...AXIS} width={140} />
                    <ReferenceLine x={0} stroke="var(--border-strong)" />
                    <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip format={(v) => fmtINR(v, { sign: true })} title={(l, p) => `${l} · ${p[0]?.payload?.n} trades`} />} />
                    <Bar dataKey="net" name="Net P&L" radius={2} isAnimationActive={false}>
                      {byStrategy.map((b) => <Cell key={b.name} fill={b.net >= 0 ? 'var(--pos)' : 'var(--neg)'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}
