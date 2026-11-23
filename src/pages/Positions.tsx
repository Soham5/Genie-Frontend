import { Fragment, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { useSelectedDate, useStore } from '@/data/store'
import { useLiveBook } from '@/hooks/useLiveBook'
import { getApiBase } from '@/hooks/useLiveApi'
import { fromTrades, optionLabel, payoff, payoffReady, scenarios, totals, type PosLeg, type Position } from '@/lib/positions'
import { fmtAgo, fmtDate, fmtINR, fmtNum, pnlTone, prettyStrategy } from '@/lib/format'
import { Badge, Callout, Empty, PageHead, Panel, Seg } from '@/components/ui/Panel'
import { SideChip } from '@/components/ui/bits'
import { PayoffChart } from '@/components/charts/PayoffChart'
import { clsx } from '@/lib/clsx'

type Source = 'live' | 'snapshot'
type Tab = 'day' | 'net'
type LaneFilter = 'all' | 'managed' | 'research'
type SegFilter = 'all' | 'NFO' | 'NSE'

const money = (n: number | null | undefined) => (n == null ? '—' : fmtINR(n, { sign: true, decimals: true }).replace('₹', ''))

export default function Positions() {
  const { trades } = useStore()
  const [date] = useSelectedDate()
  const book = useLiveBook()
  const { search } = useLocation()
  const [pick, setPick] = useState<Source | null>(null)
  const [tab, setTab] = useState<Tab>('day')
  const [lane, setLane] = useState<LaneFilter>('all')
  const [segment, setSegment] = useState<SegFilter>('all')

  const source: Source = pick ?? (book.state === 'live' ? 'live' : 'snapshot')
  const hasApi = !!getApiBase()

  const all = useMemo(() => (source === 'live' ? book.positions : fromTrades(trades, date)), [source, book.positions, trades, date])
  const rows = useMemo(() => {
    let r = all.filter((p) => (lane === 'all' || p.lane === lane) && (segment === 'all' || p.segment === segment))
    if (source === 'snapshot' && tab === 'net') r = r.filter((p) => p.status === 'open')
    if (source === 'snapshot' && tab === 'day') r = r.filter((p) => !(p.carried && p.status === 'open'))
    return r
  }, [all, lane, segment, tab, source])

  const open = rows.filter((p) => p.status === 'open')
  const closed = rows.filter((p) => p.status === 'closed')
  const t = totals(rows)
  const live = source === 'live'

  return (
    <>
      <PageHead
        title="Positions"
        sub={live ? `Live mark-to-market from the Genie API · refreshed ${book.asOf ? fmtAgo(book.asOf.toISOString()) : '—'}` : `Snapshot from the log export · ${fmtDate(date, 'long')}`}
        actions={
          <>
            <Seg<SegFilter> label="Segment" value={segment} onChange={setSegment} options={[{ value: 'all', label: 'All' }, { value: 'NFO', label: 'F&O' }, { value: 'NSE', label: 'Equity' }]} />
            <Seg<LaneFilter> label="Lane" value={lane} onChange={setLane} options={[{ value: 'all', label: 'All' }, { value: 'managed', label: 'Managed' }, { value: 'research', label: 'Research' }]} />
            <Seg<Source> label="Data source" value={source} onChange={setPick} options={[{ value: 'live', label: <>Live{book.state === 'live' && <span className="dot dot--pos dot--pulse" style={{ marginLeft: 6 }} />}</> }, { value: 'snapshot', label: 'Snapshot' }]} />
            {live && <button className="btn btn--sm" onClick={book.refresh}><RefreshCw size={13} /> Refresh</button>}
          </>
        }
      />
      <div className="stack">
        {live && book.state !== 'live' && (
          <Callout tone={hasApi ? 'warn' : 'info'} title={hasApi ? (book.state === 'connecting' ? 'Connecting to the Genie API…' : 'Live data unavailable.') : 'Live mode is not set up.'}>
            {hasApi ? book.error : 'Add your API URL and a read-only key to see leg-level LTPs and mark-to-market P&L.'}{' '}
            <Link className="link-btn" to={{ pathname: '/about', search }}>Open Settings</Link>
          </Callout>
        )}
        {!live && (
          <Callout tone="info" title="Snapshot has no live prices.">
            The log export records fills, not quotes, so open positions show P&amp;L at stop / target instead of mark-to-market. Switch to <strong>Live</strong> for real LTPs.
            Option legs lost in log truncation are marked <em>derived</em> or <em>not logged</em>.
          </Callout>
        )}

        <div className="pnlstrip">
          <PnlCell label="Open P&L" value={t.open} note={live ? `${t.openCount} open` : open.length ? 'needs live quotes' : 'flat'} />
          <PnlCell label="Realised" value={live ? null : t.realised} note={live ? 'see P&L page' : `${t.closedCount} closed`} />
          <PnlCell label="Total P&L" value={live ? t.open : t.total} note={live ? 'unrealised' : t.unpriced ? `${t.unpriced} unpriced` : 'net of costs'} strong />
        </div>

        <Panel
          title={live ? 'Open positions' : tab === 'day' ? 'Day positions' : 'Net positions'}
          sub={live ? `${open.length} open` : `${open.length} open · ${closed.length} closed`}
          flush
          actions={!live && <Seg<Tab> label="Position view" value={tab} onChange={setTab} options={[{ value: 'day', label: 'Day' }, { value: 'net', label: 'Net (open)' }]} />}
        >
          {rows.length === 0 ? (
            <Empty title={live ? 'No open positions' : 'No positions'}>{live ? 'The book is flat.' : 'Nothing was opened or closed in this view.'}</Empty>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl tbl--dense pos-tbl">
                <thead>
                  <tr>
                    <th style={{ width: 28 }} />
                    <th>Instrument</th>
                    <th>Strategy</th>
                    <th className="r">Qty.</th>
                    <th className="r">Avg.</th>
                    <th className="r">LTP</th>
                    <th className="r">P&amp;L</th>
                    {!live && <th className="r hide-sm">@ Stop</th>}
                    {!live && <th className="r hide-sm">@ Target</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <PositionRows key={p.id} p={p} live={live} />
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td />
                    <td colSpan={live ? 5 : 7}><strong>Total</strong></td>
                    <td className={clsx('r num', pnlTone(live ? t.open : t.total))}><strong>{money(live ? t.open : t.total)}</strong></td>
                    {!live && <td className="hide-sm" />}
                    {!live && <td className="hide-sm" />}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}

function PnlCell({ label, value, note, strong }: { label: string; value: number | null; note: string; strong?: boolean }) {
  return (
    <div className="pnlstrip__cell">
      <span className="pnlstrip__label">{label}</span>
      <span className={clsx('pnlstrip__value num', pnlTone(value), strong && 'pnlstrip__value--lg')}>{value == null ? '—' : money(value)}</span>
      <span className="pnlstrip__note">{note}</span>
    </div>
  )
}

function PositionRows({ p, live }: { p: Position; live: boolean }) {
  const [open, setOpen] = useState(false)
  const expandable = p.legs.length > 0 || p.kind !== 'equity'
  const sc = useMemo(() => scenarios(p), [p])
  const combo = p.kind === 'combo'
  return (
    <Fragment>
      <tr className={clsx(expandable && 'clickable', open && 'expanded', p.status === 'closed' && 'is-closed')} onClick={expandable ? () => setOpen((o) => !o) : undefined}>
        <td>{expandable && (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}</td>
        <td>
          <div className="instr">
            <span className="instr__name">{p.instrument}</span>
            <span className="instr__meta">
              <Badge tone="outline">{p.segment}</Badge>
              {combo && <Badge tone="violet">{p.legs.length} legs</Badge>}
              {p.status === 'closed' && <Badge tone="muted">Closed{p.reason ? ` · ${p.reason.replace('_HIT', '')}` : ''}</Badge>}
              {p.carried && p.status === 'open' && <Badge tone="warn" title="Opened on an earlier session and never logged an exit">Carried</Badge>}
            </span>
          </div>
        </td>
        <td>
          <span>{prettyStrategy(p.strategy)}</span>{' '}
          <Badge tone={p.lane === 'managed' ? 'accent' : 'outline'}>{p.lane}</Badge>
        </td>
        <td className="r num">
          <SideChip side={p.side} /> <span>{p.qty}</span>
          {p.lots != null && <div className="muted tiny">{fmtNum(p.lots, p.lots % 1 ? 1 : 0)} lot{p.lots === 1 ? '' : 's'}</div>}
        </td>
        <td className="r num">
          {fmtNum(p.avg)}
          {combo && <div className="muted tiny">net {p.avg >= 0 ? 'credit' : 'debit'}</div>}
        </td>
        <td className="r num">
          {fmtNum(p.ltp)}
          {combo && p.ltp != null && <div className="muted tiny">{p.status === 'closed' ? 'exit' : 'to close'}</div>}
        </td>
        <td className={clsx('r num', pnlTone(p.pnl))}>
          <strong>{p.pnl == null ? <span className="muted" title="No live quote in the log snapshot">—</span> : money(p.pnl)}</strong>
        </td>
        {!live && <td className={clsx('r num hide-sm', pnlTone(sc.atStop))}>{p.status === 'open' ? money(sc.atStop) : ''}</td>}
        {!live && <td className={clsx('r num hide-sm', pnlTone(sc.atTarget))}>{p.status === 'open' ? money(sc.atTarget) : ''}</td>}
      </tr>
      {open && (
        <tr className="expanded">
          <td colSpan={live ? 7 : 9} style={{ padding: '12px 16px' }}>
            <Detail p={p} />
          </td>
        </tr>
      )}
    </Fragment>
  )
}

function legBadge(l: PosLeg) {
  if (l.unmarked) return <Badge tone="warn" title="No fresh tick for this leg; LTP shows its entry price">no tick</Badge>
  switch (l.source) {
    case 'live': return <Badge tone="accent">live</Badge>
    case 'logged': return <Badge tone="pos" title="Read directly from the entry record">logged</Badge>
    case 'derived': return <Badge tone="info" title="Reconstructed from the strategy structure and net credit">derived</Badge>
    default: return <Badge tone="warn" title="This leg was lost when the log line was truncated">not logged</Badge>
  }
}

function Detail({ p }: { p: Position }) {
  const pay = useMemo(() => payoff(p.legs), [p.legs])
  const missing = p.legs.length > 0 && !payoffReady(p.legs)
  return (
    <div className="stack">
      <dl className="kv" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, max-content))', gap: '6px 28px' }}>
        <div><dt>Opened</dt><dd className="num" style={{ textAlign: 'left' }}>{p.openedDate ? fmtDate(p.openedDate) : '—'} {p.openedT?.slice(0, 8)}</dd></div>
        {p.expiry && <div><dt>Expiry</dt><dd className="num" style={{ textAlign: 'left' }}>{fmtDate(p.expiry)}</dd></div>}
        <div><dt>Stop</dt><dd className="num neg" style={{ textAlign: 'left' }}>{fmtNum(p.stop)}</dd></div>
        <div><dt>Target</dt><dd className="num pos" style={{ textAlign: 'left' }}>{fmtNum(p.target)}</dd></div>
        {p.status === 'closed' && <div><dt>Exit</dt><dd className="num" style={{ textAlign: 'left' }}>{fmtNum(p.exitPrice)} @ {p.closedT?.slice(0, 8)}</dd></div>}
      </dl>

      {p.legs.length > 0 ? (
        <div className="tbl-wrap">
          <table className="tbl tbl--dense">
            <thead>
              <tr>
                <th>Leg</th>
                <th>Contract</th>
                <th className="r">Qty.</th>
                <th className="r">Avg.</th>
                <th className="r">LTP</th>
                <th className="r">P&amp;L</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {p.legs.map((l) => (
                <tr key={l.no}>
                  <td><SideChip side={l.action} /></td>
                  <td>{optionLabel(l, p.underlying)}</td>
                  <td className="r num">{l.qty}{l.lots != null && <span className="muted tiny"> · {fmtNum(l.lots, l.lots % 1 ? 1 : 0)}L</span>}</td>
                  <td className="r num">{fmtNum(l.avg)}</td>
                  <td className="r num">{fmtNum(l.ltp)}</td>
                  <td className={clsx('r num', pnlTone(l.pnl))}>{l.pnl == null ? '—' : money(l.pnl)}</td>
                  <td>{legBadge(l)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <span className="muted">Single instrument — no multi-leg breakdown.</span>
      )}

      {pay && (
        <div className="grid cols-3-2" style={{ alignItems: 'start' }}>
          <div>
            <div className="muted tiny" style={{ marginBottom: 4 }}>PAYOFF AT EXPIRY</div>
            <PayoffChart payoff={pay} />
          </div>
          <dl className="kv">
            <dt>Max profit</dt><dd className="num pos">{pay.unlimitedProfit ? 'Unlimited' : fmtINR(pay.maxProfit, { sign: true })}</dd>
            <dt>Max loss</dt><dd className="num neg">{pay.unlimitedLoss ? 'Unlimited' : fmtINR(pay.maxLoss)}</dd>
            <dt>Breakevens</dt><dd className="num">{pay.breakevens.length ? pay.breakevens.map((b) => fmtNum(b, 0)).join(' · ') : '—'}</dd>
          </dl>
        </div>
      )}
      {missing && <span className="muted tiny">Payoff needs every leg&apos;s strike and price. Some were not preserved in the logs; connect the live API for complete legs.</span>}
    </div>
  )
}
