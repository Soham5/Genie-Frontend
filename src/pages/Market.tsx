import { useMemo } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAllDays, useSelectedDate, useStore } from '@/data/store'
import { Badge, Callout, Empty, PageHead, Panel } from '@/components/ui/Panel'
import { Stat } from '@/components/ui/Stat'
import { DayGate } from '@/components/ui/bits'
import { AXIS, COLORS, ChartTooltip, GRID, Legend } from '@/components/charts/chartKit'
import { fmtCount, fmtDate, fmtNum } from '@/lib/format'
import type { ChainPoint, DayDetail } from '@/types'

const STRADDLE_GATE = 22

export default function Market() {
  return (
    <>
      <PageHead title="Market" sub="Volatility regime, option-chain positioning and data-provider reliability" />
      <DayGate>{(day, date) => <MarketBody day={day} date={date} />}</DayGate>
    </>
  )
}

function MarketBody({ day, date }: { day: DayDetail; date: string }) {
  const { index } = useStore()
  const [, setDate] = useSelectedDate()
  const sessions = index.days.filter((d) => d.hasSession && d.vixClose != null)
  const recent = useMemo(() => index.days.filter((d) => d.hasSession).slice(-20).map((d) => d.date), [index.days])
  const nseDays = useAllDays(recent)

  const vix = day.vix.map((p) => ({ t: p.t.slice(0, 5), v: p.v }))
  const vixLast = vix.at(-1)?.v ?? null
  const vixFirst = vix[0]?.v ?? null

  const indices = useMemo(() => [...new Set(day.chain.map((c) => c.index))], [day.chain])
  const latest = useMemo(() => Object.fromEntries(indices.map((i) => [i, day.chain.filter((c) => c.index === i).at(-1) as ChainPoint])), [indices, day.chain])
  const pcrSeries = useMemo(() => {
    const m = new Map<string, Record<string, number | string>>()
    for (const c of day.chain) {
      const t = c.t.slice(0, 5)
      const row = m.get(t) ?? { t }
      row[c.index] = c.pcr
      m.set(t, row)
    }
    return [...m.values()]
  }, [day.chain])

  const vixHistory = sessions.map((d) => ({ date: d.date, close: d.vixClose, high: d.vixHigh, open: d.vixOpen }))
  const nseTrend = recent.filter((d) => nseDays[d]).map((d) => ({ date: d, failed: nseDays[d].nse.callFailed, fallback: nseDays[d].nse.fallbackSuccess, trips: nseDays[d].nse.circuitOpen }))

  return (
    <div className="stack">
      <div className="grid cols-4">
        <Stat label="India VIX" value={vixLast != null ? fmtNum(vixLast, 2) : '—'} foot={vixFirst != null && vixLast != null ? `${vixLast >= vixFirst ? '▲' : '▼'} ${fmtNum(Math.abs(vixLast - vixFirst), 2)} vs first reading` : 'no readings'} help={`Nifty short straddle only enters when VIX < ${STRADDLE_GATE}.`} />
        <Stat
          label="Straddle gate"
          value={vixLast == null ? '—' : vixLast < STRADDLE_GATE ? 'Open' : 'Closed'}
          tone={vixLast == null ? undefined : vixLast < STRADDLE_GATE ? 'pos' : 'neg'}
          foot={`VIX < ${STRADDLE_GATE} required · headroom ${vixLast != null ? fmtNum(STRADDLE_GATE - vixLast, 1) : '—'}`}
        />
        <Stat label="Regime" value={day.premarket?.regime.replaceAll('_', ' ') ?? '—'} foot={day.premarket ? `VIX state: ${day.premarket.vixState}` : 'no premarket snapshot'} help="Classification from the 09:05 premarket intelligence build." />
        <Stat label="F&O ban" value={day.premarket ? fmtCount(day.premarket.fnoBan) : '—'} foot={day.premarket ? (day.premarket.tradable ? 'market tradable' : 'market not tradable') : ''} help="Securities in the NSE F&O ban period; new positions are rejected by the pre-trade check." />
      </div>

      <div className="grid cols-2">
        <Panel title="India VIX — intraday" sub={fmtDate(date, 'long')} actions={<Legend items={[{ label: 'VIX', color: COLORS.accent }, { label: `Straddle gate ${STRADDLE_GATE}`, color: COLORS.warn }]} />}>
          {vix.length < 2 ? <Empty title="No VIX readings">The VIX refresh job did not log values for this session.</Empty> : (
            <div className="chart" style={{ height: 260 }} role="img" aria-label="India VIX intraday">
              <ResponsiveContainer>
                <AreaChart data={vix} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="vixg" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="t" {...AXIS} minTickGap={32} />
                  <YAxis {...AXIS} width={36} domain={[(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(Math.max(max + 1, STRADDLE_GATE + 1))]} />
                  <ReferenceLine y={STRADDLE_GATE} stroke="var(--warn)" strokeDasharray="4 4" />
                  <Tooltip content={<ChartTooltip format={(v) => fmtNum(v, 2)} />} />
                  <Area type="monotone" dataKey="v" name="India VIX" stroke="var(--accent)" strokeWidth={2} fill="url(#vixg)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="India VIX — session history" sub="Open / close / high per session · click a point to jump" actions={<Legend items={[{ label: 'Close', color: COLORS.accent }, { label: 'High', color: COLORS.violet }]} />}>
          <div className="chart" style={{ height: 260 }} role="img" aria-label="India VIX history">
            <ResponsiveContainer>
              <LineChart data={vixHistory} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="date" {...AXIS} tickFormatter={(d: string) => fmtDate(d)} minTickGap={28} />
                <YAxis {...AXIS} width={36} domain={['auto', 'auto']} />
                <ReferenceLine y={STRADDLE_GATE} stroke="var(--warn)" strokeDasharray="4 4" />
                <Tooltip content={<ChartTooltip format={(v) => fmtNum(v, 2)} title={(l) => fmtDate(String(l), 'long')} />} />
                <Line type="monotone" dataKey="high" name="High" stroke="var(--violet)" strokeWidth={1.25} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="close" name="Close" stroke="var(--accent)" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 5, onClick: (_e, p) => setDate((p as unknown as { payload: { date: string } }).payload.date) }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid cols-2-1">
        <Panel title="Put/Call ratio" sub="Option-chain snapshots (OI-based PCR)" help="PCR > 1 means more put than call open interest — typically read as supportive/bullish positioning; < 0.7 as bearish. A positioning gauge, not a signal on its own." actions={<Legend items={[{ label: 'NIFTY', color: COLORS.accent }, { label: 'BANKNIFTY', color: COLORS.violet }]} />}>
          {pcrSeries.length < 2 ? <Empty title="No option-chain snapshots" /> : (
            <div className="chart" style={{ height: 240 }} role="img" aria-label="Put call ratio over the session">
              <ResponsiveContainer>
                <LineChart data={pcrSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="t" {...AXIS} minTickGap={32} />
                  <YAxis {...AXIS} width={36} domain={['auto', 'auto']} />
                  <ReferenceLine y={1} stroke="var(--border-strong)" strokeDasharray="3 3" />
                  <Tooltip content={<ChartTooltip format={(v) => fmtNum(v, 2)} />} />
                  <Line type="monotone" dataKey="NIFTY" stroke="var(--accent)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                  <Line type="monotone" dataKey="BANKNIFTY" stroke="var(--violet)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Chain snapshot" sub="Latest persisted per index">
          {indices.length === 0 ? <Empty title="No chain data" /> : (
            <div className="stack">
              {indices.map((i) => {
                const c = latest[i]
                return (
                  <div key={i}>
                    <div className="row row--between"><strong>{i}</strong><Badge tone="outline">exp {c.expiry}</Badge></div>
                    <dl className="kv" style={{ marginTop: 8 }}>
                      <dt>PCR</dt><dd className="num">{fmtNum(c.pcr, 2)}</dd>
                      <dt>Max pain</dt><dd className="num">{fmtCount(c.maxPain)}</dd>
                      <dt>Strikes</dt><dd className="num">{c.strikes}</dd>
                      <dt>At</dt><dd className="num">{c.t.slice(0, 8)}</dd>
                    </dl>
                  </div>
                )
              })}
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>{day.chain.length} snapshots persisted this session.</p>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid cols-2">
        <Panel title="NSE data reliability" sub={`${fmtDate(date, 'long')} · primary scraper with pnsea fallback`}>
          <dl className="kv">
            <dt>Failed calls</dt><dd className="num">{fmtCount(day.nse.callFailed)}</dd>
            <dt>Fallback successes</dt><dd className="num">{fmtCount(day.nse.fallbackSuccess)}</dd>
            <dt>Circuit opened</dt><dd className="num">{fmtCount(day.nse.circuitOpen)}</dd>
            <dt>Circuit recovered</dt><dd className="num">{fmtCount(day.nse.circuitRecovered)}</dd>
            <dt>Half-open probes</dt><dd className="num">{fmtCount(day.nse.halfOpen)}</dd>
            <dt>Dormant</dt><dd className="num">{fmtCount(day.nse.circuitDormant)}</dd>
          </dl>
          {day.nse.callFailed > 0 && day.nse.circuitOpen > day.nse.circuitRecovered && (
            <div style={{ marginTop: 12 }}><Callout tone="warn">The NSE circuit tripped more often than it recovered. Check the fallback provider.</Callout></div>
          )}
        </Panel>

        <Panel title="NSE failures — last 20 sessions" sub="Failed upstream calls per session">
          {nseTrend.length < 2 ? <p className="muted">Loading history…</p> : (
            <div className="chart" style={{ height: 200 }} role="img" aria-label="NSE failed calls by session">
              <ResponsiveContainer>
                <BarChart data={nseTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="date" {...AXIS} tickFormatter={(d: string) => fmtDate(d)} minTickGap={24} />
                  <YAxis {...AXIS} width={36} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip format={(v) => fmtCount(v)} title={(l) => fmtDate(String(l), 'long')} />} />
                  <Bar dataKey="failed" name="Failed calls" fill="var(--warn)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="fallback" name="Fallback OK" fill="var(--info)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
