import { useMemo } from 'react'
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useSelectedDate, useStore } from '@/data/store'
import { Badge, Callout, Panel, PageHead } from '@/components/ui/Panel'
import { Stat } from '@/components/ui/Stat'
import { DayGate, FeedList } from '@/components/ui/bits'
import { AXIS, COLORS, ChartTooltip, GRID, Legend } from '@/components/charts/chartKit'
import { computeStats, dailyPnl, equityCurve } from '@/lib/stats'
import { fmtCount, fmtDate, fmtINR, fmtNum, fmtPct, pnlTone } from '@/lib/format'
import type { DaySummary } from '@/types'
import { clsx } from '@/lib/clsx'

export default function Overview() {
  const { index, closedTrades } = useStore()
  const [date, setDate] = useSelectedDate()
  const cur = index.days.find((d) => d.date === date)!
  const { search } = useLocation()

  const curve = useMemo(() => equityCurve(closedTrades), [closedTrades])
  const all = useMemo(() => computeStats(closedTrades), [closedTrades])
  const daily = useMemo(() => dailyPnl(closedTrades), [closedTrades])
  const dayTrades = useMemo(() => closedTrades.filter((t) => t.exitDate === date), [closedTrades, date])
  const dayStats = useMemo(() => computeStats(dayTrades), [dayTrades])
  const sessions = index.days.filter((d) => d.hasSession)
  const vixSpark = sessions.map((d) => d.vixClose).filter((v): v is number => v != null)

  return (
    <>
      <PageHead
        title="Overview"
        sub={<>Session <strong>{fmtDate(date, 'long')}</strong> · paper trading · NSE (Nifty / Bank Nifty options &amp; equities)</>}
      />
      <div className="stack">
        <Verdict day={cur} />

        <div className="grid cols-4">
          <Stat
            label="Net P&L"
            help="Realised P&L after brokerage, STT, exchange charges, GST and modelled slippage for trades closed this session. Live marks are not in the logs, so open positions are not marked-to-market."
            value={fmtINR(dayStats.net, { sign: true })}
            tone={pnlTone(dayStats.net)}
            foot={`${dayStats.count} closed · cum ${fmtINR(all.net, { sign: true, compact: true })}`}
            spark={daily.map((d) => d.net)}
            sparkTone={dayStats.net >= 0 ? 'pos' : 'neg'}
            accent={dayStats.count ? (dayStats.net >= 0 ? 'pos' : 'neg') : undefined}
          />
          <Stat label="Win rate" value={fmtPct(dayStats.winRate, 0)} foot={`${dayStats.wins}W / ${dayStats.losses}L · all-time ${fmtPct(all.winRate, 0)}`} help="Closed trades with positive net P&L ÷ closed trades." />
          <Stat label="Entries / Exits" value={`${cur.entries} / ${cur.exits}`} foot={`${cur.open} open at close`} />
          <Stat label="Scan cycles" value={fmtCount(cur.cycles + cur.researchCycles)} foot={`${cur.cycles} managed · ${cur.researchCycles} research`} help="Strategy scan loops completed across the managed and research lanes." />
          <Stat label="Risk blocks" value={fmtCount(cur.riskBlocks)} foot={cur.riskBlocks ? 'entries vetoed by risk gate' : 'no vetoes'} tone={cur.riskBlocks ? 'warn' : undefined} help="Candidate entries rejected by cooldowns, trade caps, circuit breaker or loss budget." />
          <Stat label="India VIX" value={cur.vixClose != null ? fmtNum(cur.vixClose, 1) : '—'} foot={cur.vixOpen != null ? `open ${fmtNum(cur.vixOpen, 1)} · ${cur.regime ?? '—'}` : 'no reading'} spark={vixSpark} sparkTone="accent" help="Volatility gate: the Nifty short straddle only enters when VIX < 22." />
          <Stat label="Kill switch" value={cur.killSwitch ? `${cur.killSwitch}×` : 'Clear'} foot={cur.killSwitch ? 'auto-activations today' : 'not triggered'} tone={cur.killSwitch ? 'neg' : 'pos'} accent={cur.killSwitch ? 'neg' : undefined} />
          <Stat label="Errors / Warnings" value={`${fmtCount(cur.errors)} / ${fmtCount(cur.warnings)}`} foot={`${fmtCount(cur.events)} log events`} tone={cur.errors ? 'neg' : undefined} />
        </div>

        <div className="grid cols-2-1">
          <Panel
            title="Cumulative net P&L"
            sub={`${curve.length} closed trades across ${daily.length} sessions · after all costs`}
            actions={<Legend items={[{ label: 'Equity', color: COLORS.accent }, { label: 'Drawdown', color: COLORS.neg }]} />}
          >
            {curve.length < 2 ? (
              <p className="muted">Not enough closed trades yet to draw an equity curve.</p>
            ) : (
              <div className="chart" style={{ height: 280 }} role="img" aria-label="Cumulative net profit and drawdown by trade">
                <ResponsiveContainer>
                  <ComposedChart data={curve} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="eq" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="i" {...AXIS} tickFormatter={(v) => `#${v}`} minTickGap={32} />
                    <YAxis {...AXIS} width={64} tickFormatter={(v: number) => fmtINR(v, { compact: true })} />
                    <ReferenceLine y={0} stroke="var(--border-strong)" />
                    <Tooltip
                      content={<ChartTooltip title={(_l, p) => `Trade #${p[0]?.payload?.i} · ${p[0]?.payload?.label}`} format={(v) => fmtINR(v, { sign: true })} />}
                    />
                    <Area type="stepAfter" dataKey="drawdown" name="Drawdown" stroke="var(--neg)" strokeWidth={1} fill="var(--neg-soft)" isAnimationActive={false} />
                    <Line type="stepAfter" dataKey="equity" name="Equity" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="row row--wrap" style={{ marginTop: 10, gap: 18, fontSize: 12.5 }}>
              <span className="muted">Max drawdown <strong className="num neg">{fmtINR(all.maxDrawdown)}</strong></span>
              <span className="muted">Profit factor <strong className="num">{fmtNum(all.profitFactor)}</strong></span>
              <span className="muted">Expectancy <strong className={clsx('num', pnlTone(all.expectancy))}>{fmtINR(all.expectancy, { sign: true })}</strong>/trade</span>
              <span className="muted">Max loss streak <strong className="num">{all.maxLossStreak}</strong></span>
            </div>
          </Panel>

          <Panel title="Session calendar" sub="Net P&L by session · click to inspect" help="Colour = realised net P&L (green profit, red loss). Dot = degraded (amber) or incident (red) session. Grey = session with no closed trades. Faded = no logs.">
            <Calendar days={index.days} first={index.source.firstDate} last={index.source.lastDate} selected={date} onSelect={setDate} />
            <div className="legend" style={{ marginTop: 12 }}>
              <span><i style={{ background: 'var(--pos)' }} />Profit</span>
              <span><i style={{ background: 'var(--neg)' }} />Loss</span>
              <span><i style={{ background: 'var(--surface-3)' }} />No closed trades</span>
            </div>
          </Panel>
        </div>

        <DayGate>
          {(day) => {
            const comps = Object.entries(day.components).sort((a, b) => b[1].errors - a[1].errors || b[1].warnings - a[1].warnings || b[1].events - a[1].events)
            const maxEvents = Math.max(1, ...comps.map(([, c]) => c.events))
            const cyc = day.cycles.filter((c) => c.scanned > 0 || c.entries || c.exits)
            const throughput = cyc.map((c) => ({ t: c.t.slice(0, 5), scanned: c.scanned, kind: c.kind, entries: c.entries }))
            return (
              <>
                <div className="grid cols-2">
                  <Panel title="Component health" sub="Log volume with warning / error counts per subsystem">
                    {comps.length === 0 ? <p className="muted">No component activity.</p> : (
                      <div className="stack" style={{ gap: 10 }}>
                        {comps.map(([name, c]) => (
                          <div key={name}>
                            <div className="row row--between" style={{ fontSize: 12.5, marginBottom: 4 }}>
                              <span>{name}</span>
                              <span className="row">
                                <span className="num muted">{fmtCount(c.events)}</span>
                                {c.warnings > 0 && <Badge tone="warn">{c.warnings} warn</Badge>}
                                {c.errors > 0 && <Badge tone="neg">{c.errors} err</Badge>}
                              </span>
                            </div>
                            <div className="bar"><span style={{ width: `${(c.events / maxEvents) * 100}%`, background: c.errors ? 'var(--neg)' : c.warnings ? 'var(--warn)' : 'var(--accent)' }} /></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Panel>

                  <Panel title="Scan throughput" sub="Symbols scanned per strategy cycle" actions={<Link className="link-btn" to={{ pathname: '/trading', search }}>Trading <ArrowRight size={12} style={{ verticalAlign: -2 }} /></Link>}>
                    {throughput.length === 0 ? (
                      <p className="muted">No scan cycles ran this session.</p>
                    ) : (
                      <div className="chart" style={{ height: 250 }} role="img" aria-label="Symbols scanned per cycle">
                        <ResponsiveContainer>
                          <BarChart data={throughput} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid {...GRID} />
                            <XAxis dataKey="t" {...AXIS} minTickGap={28} />
                            <YAxis {...AXIS} width={36} />
                            <Tooltip content={<ChartTooltip format={(v) => fmtCount(v)} />} cursor={{ fill: 'var(--surface-2)' }} />
                            <Bar dataKey="scanned" name="Symbols scanned" fill="var(--accent)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </Panel>
                </div>

                <Panel title="Latest events" sub="Most recent warnings, errors and trade activity" flush actions={<Link className="link-btn" to={{ pathname: '/logs', search }}>All events <ArrowRight size={12} style={{ verticalAlign: -2 }} /></Link>}>
                  {day.feed.length ? <FeedList events={day.feed.slice(-12).reverse()} /> : <p className="muted" style={{ padding: 16 }}>No notable events.</p>}
                </Panel>
              </>
            )
          }}
        </DayGate>
      </div>
    </>
  )
}

function Verdict({ day }: { day: DaySummary }) {
  if (!day.hasSession) {
    return <Callout tone="info" title="No trading session.">The platform emitted no strategy cycles on this date (weekend, holiday, or the service was offline).</Callout>
  }
  const notes: string[] = []
  if (day.killSwitch) notes.push(`kill switch tripped ${day.killSwitch}×`)
  if (day.errors) notes.push(`${day.errors} errors`)
  if (day.riskBlocks) notes.push(`${day.riskBlocks} risk blocks`)
  if (day.status === 'healthy') return <Callout tone="pos" title="Healthy session.">Strategies scanned normally with no errors or kill-switch activity.</Callout>
  return (
    <Callout tone={day.status === 'incident' ? 'neg' : 'warn'} title={day.status === 'incident' ? 'Incident.' : 'Degraded session.'}>
      {notes.length ? notes.join(' · ') : 'Elevated warnings from upstream data providers.'}. See <Link className="link-btn" to="/system">System Health</Link> for the timeline.
    </Callout>
  )
}

function Calendar({ days, first, last, selected, onSelect }: { days: DaySummary[]; first: string; last: string; selected: string; onSelect: (d: string) => void }) {
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days])
  const { cells, scale } = useMemo(() => {
    const start = new Date(`${first}T00:00:00`)
    const end = new Date(`${last}T00:00:00`)
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    const out: { date: string; empty: boolean }[] = []
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0 || d.getDay() === 6) continue
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      out.push({ date: iso, empty: iso < first })
    }
    const max = Math.max(1, ...days.map((d) => Math.abs(d.net)))
    return { cells: out, scale: max }
  }, [days, first, last])

  return (
    <div className="cal" role="grid" aria-label="Session calendar" style={{ gridTemplateColumns: `repeat(${Math.ceil(cells.length / 5)}, minmax(0, 1fr))` }}>
      {cells.map((c) => {
        const d = byDate.get(c.date)
        const closed = d && d.exits > 0
        const intensity = d ? Math.min(1, 0.25 + (Math.abs(d.net) / scale) * 0.75) : 0
        const bg = closed ? `color-mix(in srgb, ${d.net >= 0 ? 'var(--pos)' : 'var(--neg)'} ${Math.round(intensity * 100)}%, var(--surface-2))` : d?.hasSession ? 'var(--surface-3)' : undefined
        return (
          <button
            key={c.date}
            className="cal__cell"
            data-empty={c.empty}
            data-status={d?.status}
            aria-current={c.date === selected ? 'date' : undefined}
            disabled={!d}
            style={{ background: bg, opacity: d?.hasSession ? 1 : 0.55, cursor: d ? 'pointer' : 'default' }}
            data-tip={d ? `${fmtDate(c.date, 'long')} · ${d.hasSession ? `${fmtINR(d.net, { sign: true })} · ${d.exits} exits` : 'no session'}` : undefined}
            aria-label={d ? `${c.date}: ${d.status}, net ${fmtINR(d.net)}` : c.date}
            onClick={() => d && onSelect(c.date)}
          >
            {c.date.slice(8)}
          </button>
        )
      })}
    </div>
  )
}
