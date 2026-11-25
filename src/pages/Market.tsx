import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend as RLegend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { num } from '@/api/client'
import { useApiState } from '@/api/ApiProvider'
import { useApi } from '@/api/useApi'
import { Badge, Callout, PageHead, Panel, Seg, Skeleton } from '@/components/ui/Panel'
import { Stat } from '@/components/ui/Stat'
import { AXIS, ChartTooltip, GRID } from '@/components/charts/chartKit'
import { fmtNum, fmtPct, pnlTone } from '@/lib/format'
import { clsx } from '@/lib/clsx'
import { ApiNote, clock, RefreshButton } from './ops/shared'

interface ChainLeg { ltp: number; oi: number; change_oi: number; iv: number; volume: number }
interface ChainRow { strike: number; expiry: string; ce: ChainLeg; pe: ChainLeg }
interface Analytics {
  spot: number | null
  atm_strike: number | null
  pcr: number | null
  max_pain: number | null
  oi_walls: { resistance: { strike: number; oi: number }[]; support: { strike: number; oi: number }[] }
}
interface ChainPayload { index: string; expiry: string | null; count: number; chain: ChainRow[]; analytics?: Analytics }
interface IndexQuote { index: string; quote: Record<string, unknown> | null; available: boolean }

const INDICES = [
  { value: 'NIFTY', label: 'Nifty 50', quote: 'NIFTY 50' },
  { value: 'BANKNIFTY', label: 'Bank Nifty', quote: 'NIFTY BANK' },
  { value: 'FINNIFTY', label: 'Fin Nifty', quote: 'NIFTY FINANCIAL SERVICES' },
] as const
type IndexKey = (typeof INDICES)[number]['value']

const expiryTime = (e: string) => {
  const t = Date.parse(e.replace(/-/g, ' '))
  return Number.isNaN(t) ? 0 : t
}
const lakh = (v: number) => (Math.abs(v) >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : fmtNum(v, 0))
const pick = (q: Record<string, unknown> | null, ...keys: string[]) => {
  if (!q) return null
  for (const k of keys) {
    const n = num(q[k])
    if (n != null) return n
  }
  return null
}

function QuoteTile({ label, name, enabled }: { label: string; name: string; enabled: boolean }) {
  const res = useApi<IndexQuote>(`/market/index-quote/${encodeURIComponent(name)}`, { poll: 20000, enabled })
  const last = pick(res.data?.quote ?? null, 'last', 'lastPrice', 'ltp')
  const prev = pick(res.data?.quote ?? null, 'previousClose', 'prevClose', 'previous_close')
  const chg = last != null && prev ? last - prev : null
  const pct = chg != null && prev ? (chg / prev) * 100 : null
  const foot = res.error && !res.data ? 'unavailable' : res.data && !res.data.available ? 'no quote from NSE' : chg == null ? 'prev close n/a' : `${chg >= 0 ? '+' : ''}${fmtNum(chg)} (${fmtPct(pct)})`
  return <Stat label={label} value={last == null ? '—' : fmtNum(last)} tone={pnlTone(chg)} foot={foot} />
}

export default function Market() {
  const { status } = useApiState()
  const enabled = status === 'online'
  const [index, setIndex] = useState<IndexKey>('NIFTY')
  const [expiry, setExpiry] = useState<string | null>(null)
  const [window, setWindow] = useState<'near' | 'all'>('near')

  const base = useApi<ChainPayload>(`/market/option-chain/${index}`, { poll: 60000, enabled })
  const expiries = useMemo(() => [...new Set((base.data?.chain ?? []).map((r) => r.expiry))].sort((a, b) => expiryTime(a) - expiryTime(b)), [base.data])

  useEffect(() => { setExpiry(null) }, [index])
  const chosen = expiry && expiries.includes(expiry) ? expiry : expiries[0] ?? null
  const chain = useApi<ChainPayload>(`/market/option-chain/${index}`, { params: { expiry: chosen ?? undefined, analytics: true }, poll: 30000, enabled: enabled && chosen != null })

  const a = chain.data?.analytics
  const rows = useMemo(() => chain.data?.chain ?? [], [chain.data])
  const spot = a?.spot ?? null
  const atm = a?.atm_strike ?? null
  const shown = useMemo(() => {
    if (window === 'all' || atm == null) return rows
    const i = rows.findIndex((r) => r.strike === atm)
    return i < 0 ? rows : rows.slice(Math.max(0, i - 12), i + 13)
  }, [rows, atm, window])
  const maxOi = Math.max(1, ...shown.flatMap((r) => [r.ce.oi, r.pe.oi]))
  const totals = useMemo(() => rows.reduce((t, r) => ({ ce: t.ce + r.ce.oi, pe: t.pe + r.pe.oi }), { ce: 0, pe: 0 }), [rows])
  const oiData = useMemo(() => shown.map((r) => ({ strike: r.strike, CE: r.ce.oi, PE: r.pe.oi })), [shown])
  const noData = chain.data != null && rows.length === 0

  return (
    <>
      <PageHead
        title="Market"
        sub="Index quotes and option-chain analytics from NSE public data via the Genie API."
        actions={
          <>
            <Seg<IndexKey> label="Index" value={index} onChange={setIndex} options={INDICES.map((i) => ({ value: i.value, label: i.label }))} />
            <select className="select" value={chosen ?? ''} onChange={(e) => setExpiry(e.target.value)} aria-label="Expiry" disabled={!expiries.length}>
              {!expiries.length && <option value="">Expiry…</option>}
              {expiries.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <RefreshButton onClick={() => { base.refresh(); chain.refresh() }} />
          </>
        }
      />
      <div className="stack">
        <div className="grid cols-4">
          {INDICES.map((i) => <QuoteTile key={i.value} label={i.label} name={i.quote} enabled={enabled} />)}
          <QuoteTile label="India VIX" name="INDIA VIX" enabled={enabled} />
        </div>

        {base.error && !base.data ? <ApiNote error={base.error} what="the option chain" /> : !base.data ? <Skeleton height={240} /> : base.data.chain.length === 0 ? (
          <Callout tone="info" title="No option-chain data.">NSE data is disabled or unavailable on the Genie server, so there is nothing to show for {index}.</Callout>
        ) : (
          <>
            <div className="grid cols-4">
              <Stat label="Spot" value={spot == null ? '—' : fmtNum(spot)} foot={atm == null ? 'ATM n/a' : `ATM ${fmtNum(atm, 0)}`} />
              <Stat label="PCR" value={a?.pcr == null ? '—' : fmtNum(a.pcr)} tone={a?.pcr == null ? undefined : a.pcr >= 1 ? 'pos' : 'neg'} foot={`PE ${lakh(totals.pe)} · CE ${lakh(totals.ce)} OI`} help="Put OI ÷ call OI for the selected expiry. Above 1 leans bullish (put writing)." />
              <Stat label="Max pain" value={a?.max_pain == null ? '—' : fmtNum(a.max_pain, 0)} foot={spot != null && a?.max_pain != null ? `${fmtNum(a.max_pain - spot, 0)} pts from spot` : undefined} help="Strike that minimises total option-writer payout." />
              <Stat label="OI walls" value={a?.oi_walls.resistance[0] ? `${fmtNum(a.oi_walls.support[0]?.strike ?? null, 0)} – ${fmtNum(a.oi_walls.resistance[0].strike, 0)}` : '—'} foot="support – resistance (highest OI)" />
            </div>

            <Panel title="Open interest by strike" sub={`${chosen ?? ''} · ${shown.length} strikes`} actions={<Seg<'near' | 'all'> label="Strike range" value={window} onChange={setWindow} options={[{ value: 'near', label: 'ATM ±12' }, { value: 'all', label: 'All' }]} />}>
              {chain.error && !chain.data ? <ApiNote error={chain.error} what="chain analytics" /> : !chain.data ? <Skeleton height={240} /> : (
                <div className="chart" style={{ height: 260 }} role="img" aria-label="Open interest by strike">
                  <ResponsiveContainer>
                    <BarChart data={oiData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="strike" {...AXIS} minTickGap={14} />
                      <YAxis {...AXIS} width={48} tickFormatter={(v: number) => lakh(v)} />
                      {atm != null && <ReferenceLine x={atm} stroke="var(--border-strong)" strokeDasharray="3 3" />}
                      <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip format={(v) => lakh(v)} title={(l) => `Strike ${l}`} />} />
                      <RLegend />
                      <Bar dataKey="CE" name="Call OI" fill="var(--neg)" fillOpacity={0.75} isAnimationActive={false} />
                      <Bar dataKey="PE" name="Put OI" fill="var(--pos)" fillOpacity={0.75} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <Panel flush title="Option chain" sub={`updated ${clock(chain.updatedAt)} · bars show OI relative to the busiest strike`}>
              {noData ? <div style={{ padding: 12 }}><Callout tone="info">No strikes for this expiry.</Callout></div> : (
                <div className="tbl-wrap" style={{ maxHeight: 520, overflow: 'auto' }}>
                  <table className="tbl tbl--dense">
                    <thead>
                      <tr>
                        <th className="r">OI</th><th className="r">Chg OI</th><th className="r">IV</th><th className="r">LTP</th>
                        <th className="c">Strike</th>
                        <th className="r">LTP</th><th className="r">IV</th><th className="r">Chg OI</th><th className="r">OI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r) => (
                        <tr key={r.strike}>
                          <td className="r num" style={{ background: `linear-gradient(to left, color-mix(in srgb, var(--neg) 22%, transparent) ${(r.ce.oi / maxOi) * 100}%, transparent 0)` }}>{lakh(r.ce.oi)}</td>
                          <td className={clsx('r num', pnlTone(r.ce.change_oi))}>{lakh(r.ce.change_oi)}</td>
                          <td className="r num muted">{r.ce.iv ? fmtNum(r.ce.iv, 1) : '—'}</td>
                          <td className="r num">{fmtNum(r.ce.ltp)}</td>
                          <td className="c num" style={{ background: r.strike === atm ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : undefined }}><strong>{fmtNum(r.strike, 0)}</strong> {r.strike === atm && <Badge tone="accent">ATM</Badge>}</td>
                          <td className="r num">{fmtNum(r.pe.ltp)}</td>
                          <td className="r num muted">{r.pe.iv ? fmtNum(r.pe.iv, 1) : '—'}</td>
                          <td className={clsx('r num', pnlTone(r.pe.change_oi))}>{lakh(r.pe.change_oi)}</td>
                          <td className="r num" style={{ background: `linear-gradient(to right, color-mix(in srgb, var(--pos) 22%, transparent) ${(r.pe.oi / maxOi) * 100}%, transparent 0)` }}>{lakh(r.pe.oi)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </>
        )}
      </div>
    </>
  )
}
