import { Fragment, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { useApiState } from '@/api/ApiProvider'
import { useSessionDate } from '@/api/session'
import { useTrades } from '@/api/TradesProvider'
import { useLiveBook } from '@/hooks/useLiveBook'
import { fromClosed, optionLabel, payoff, payoffReady, scenarios, totals, tradingSymbol, type PosLeg, type Position } from '@/lib/positions'
import { fmtAgo, fmtDate, fmtINR, fmtNum, pnlTone, prettyStrategy } from '@/lib/format'
import { Badge, Callout, Empty, PageHead, Panel, Seg, Skeleton } from '@/components/ui/Panel'
import { SideChip } from '@/components/ui/bits'
import { PayoffChart } from '@/components/charts/PayoffChart'
import { clsx } from '@/lib/clsx'

type Tab = 'day' | 'net'
type LaneFilter = 'all' | 'managed' | 'research'
type SegFilter = 'all' | 'NFO' | 'NSE'

const money = (n: number | null | undefined) => (n == null ? '—' : fmtINR(n, { sign: true, decimals: true }).replace('₹', ''))

export default function Positions() {
  const { trades, loading: tradesLoading, error: tradesError, unsupported } = useTrades()
  const { date, isToday } = useSessionDate()
  const { status } = useApiState()
  const book = useLiveBook()
  const { search } = useLocation()
  const [tab, setTab] = useState<Tab>('day')
  const [lane, setLane] = useState<LaneFilter>('all')
  const [segment, setSegment] = useState<SegFilter>('all')

  // Open positions only exist "now"; past sessions show what was closed that day.
  const closedToday = useMemo(() => fromClosed(trades.filter((t) => t.exitDate === date)), [trades, date])
  const all = useMemo(() => {
    const open = isToday ? book.positions : []
    return tab === 'net' ? open : [...open, ...closedToday]
  }, [isToday, book.positions, closedToday, tab])
  const rows = useMemo(() => all.filter((p) => (lane === 'all' || p.lane === lane) && (segment === 'all' || p.segment === segment)), [all, lane, segment])

  const open = rows.filter((p) => p.status === 'open')
  const closed = rows.filter((p) => p.status === 'closed')
  const t = totals(rows)
  const booting = isToday && (book.state === 'connecting' || book.state === 'off') && book.positions.length === 0

  return (
    <>
      <PageHead
        title="Positions"
        sub={isToday ? `Live mark-to-market from the Genie API · refreshed ${book.asOf ? fmtAgo(book.asOf.toISOString()) : '—'}` : `Closed on ${fmtDate(date, 'long')} · open positions are only available for today`}
        actions={
          <>
            <Seg<SegFilter> label="Segment" value={segment} onChange={setSegment} options={[{ value: 'all', label: 'All' }, { value: 'NFO', label: 'F&O' }, { value: 'NSE', label: 'Equity' }]} />
            <Seg<LaneFilter> label="Lane" value={lane} onChange={setLane} options={[{ value: 'all', label: 'All' }, { value: 'managed', label: 'Managed' }, { value: 'research', label: 'Research' }]} />
            <button className="btn btn--sm" onClick={book.refresh} disabled={status !== 'online'}><RefreshCw size={13} /> Refresh</button>
          </>
        }
      />
      <div className="stack">
        {isToday && book.state === 'error' && (
          <Callout tone="warn" title="Live positions unavailable.">
            {book.error}{' '}
            <Link className="link-btn" to={{ pathname: '/settings', search }}>Open Settings</Link>
          </Callout>
        )}
        {unsupported && <Callout tone="warn" title="Closed trades unavailable.">The API has no <code>/console/trades</code> endpoint — update the Genie backend.</Callout>}
        {tradesError && !unsupported && <Callout tone="warn" title="Closed trades unavailable.">{tradesError.message}</Callout>}
        {closed.some((p) => p.legs.length === 0 && p.segment === 'NFO') && (
          <Callout tone="info" title="Some closed F&amp;O positions have no leg detail.">Trades closed before the Genie engine began storing legs only carry the net premium.</Callout>
        )}

        <div className="pnlstrip">
          <PnlCell label="Open P&L" value={isToday ? t.open : null} note={isToday ? `${t.openCount} open` : 'live only'} />
          <PnlCell label="Realised" value={t.closedCount ? t.realised : tradesLoading ? null : 0} note={`${t.closedCount} closed · net of costs`} />
          <PnlCell label="Total P&L" value={isToday ? t.total : t.realised} note={t.unpriced ? `${t.unpriced} unpriced` : 'open + realised'} strong />
        </div>

        <Panel
          title={tab === 'day' ? 'Day positions' : 'Net positions'}
          sub={`${open.length} open · ${closed.length} closed`}
          flush
          actions={<Seg<Tab> label="Position view" value={tab} onChange={setTab} options={[{ value: 'day', label: 'Day' }, { value: 'net', label: 'Net (open)' }]} />}
        >
          {booting || (tradesLoading && rows.length === 0) ? (
            <Skeleton height={160} />
          ) : rows.length === 0 ? (
            <Empty title="No positions">{isToday ? 'The book is flat and nothing has closed on this session.' : 'Nothing closed on this session.'}</Empty>
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
                    <th className="r hide-sm">@ Stop</th>
                    <th className="r hide-sm">@ Target</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <PositionRows key={p.id} p={p} />
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td />
                    <td colSpan={5}><strong>Total</strong></td>
                    <td className={clsx('r num', pnlTone(isToday ? t.total : t.realised))}><strong>{money(isToday ? t.total : t.realised)}</strong></td>
                    <td className="hide-sm" />
                    <td className="hide-sm" />
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

function PositionRows({ p }: { p: Position }) {
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
              {p.carried && <Badge tone="warn" title="Opened on an earlier session">Carried</Badge>}
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
          <strong>{p.pnl == null ? <span className="muted" title="No live quote yet">—</span> : money(p.pnl)}</strong>
        </td>
        <td className={clsx('r num hide-sm', pnlTone(sc.atStop))}>{p.status === 'open' ? money(sc.atStop) : ''}</td>
        <td className={clsx('r num hide-sm', pnlTone(sc.atTarget))}>{p.status === 'open' ? money(sc.atTarget) : ''}</td>
      </tr>
      {open && (
        <tr className="expanded">
          <td colSpan={9} style={{ padding: '12px 16px' }}>
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
    case 'exit': return <Badge tone="muted" title="Avg. is the entry price; Exit is the price this contract was marked at when the position closed">exit</Badge>
    default: return <Badge tone="info" title="Only the entry price was recorded; this contract had no exit price when the position closed">entry only</Badge>
  }
}

function Detail({ p }: { p: Position }) {
  const pay = useMemo(() => payoff(p.legs), [p.legs])
  const missing = p.legs.length > 0 && !payoffReady(p.legs)
  const closed = p.status === 'closed'
  const unpriced = closed ? p.legs.filter((l) => l.ltp == null).length : 0
  const legPnl = closed && p.legs.length > 0 && p.legs.every((l) => l.pnl != null) ? p.legs.reduce((sum, l) => sum + (l.pnl ?? 0), 0) : null
  const drifts = legPnl != null && p.pnl != null && Math.abs(legPnl - p.pnl) >= 1
  return (
    <div className="stack">
      <dl className="kv" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, max-content))', gap: '6px 28px' }}>
        <div><dt>Opened</dt><dd className="num" style={{ textAlign: 'left' }}>{p.openedDate ? fmtDate(p.openedDate) : '—'} {p.openedT?.slice(0, 8)}</dd></div>
        {p.expiry && <div><dt>Expiry</dt><dd className="num" style={{ textAlign: 'left' }}>{fmtDate(p.expiry)}</dd></div>}
        <div><dt>Stop</dt><dd className="num neg" style={{ textAlign: 'left' }}>{fmtNum(p.stop)}</dd></div>
        <div><dt>Target</dt><dd className="num pos" style={{ textAlign: 'left' }}>{fmtNum(p.target)}</dd></div>
        {closed && <div><dt>Exit</dt><dd className="num" style={{ textAlign: 'left' }}>{fmtNum(p.exitPrice)} @ {p.closedT?.slice(0, 8)}</dd></div>}
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
                <th className="r" title={closed ? 'Price the contract was marked at when the position closed' : undefined}>{closed ? 'Exit' : 'LTP'}</th>
                <th className="r" title={closed ? "Net of this contract's share of charges and slippage" : undefined}>P&amp;L</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {p.legs.map((l) => (
                <tr key={l.no}>
                  <td><SideChip side={l.action} /></td>
                  <td title={tradingSymbol(l.symbol)}>{optionLabel(l, p.underlying)}</td>
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
      {unpriced > 0 && (
        <span className="muted tiny">
          {unpriced === p.legs.length ? "Exit prices weren't recorded for this trade's contracts, so only their entry prices are shown." : `${unpriced} of ${p.legs.length} contracts had no exit price at close, so their Exit and P&L are blank.`} The position&apos;s own P&amp;L is unaffected.
        </span>
      )}
      {drifts && <span className="muted tiny">Contract P&amp;L marks each leg at exit, but the position exits at its stop or target price, so the two can differ slightly.</span>}

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
      {missing && <span className="muted tiny">Payoff needs every leg&apos;s strike and price, which this position doesn&apos;t have.</span>}
    </div>
  )
}
