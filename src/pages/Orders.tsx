import { useMemo, useState } from 'react'
import { useApiState } from '@/api/ApiProvider'
import { useSessionDate } from '@/api/session'
import { useTrades } from '@/api/TradesProvider'
import { useApi } from '@/api/useApi'
import { useLiveBook } from '@/hooks/useLiveBook'
import { instrumentLabel, isOptionTicker, type Position } from '@/lib/positions'
import type { ClosedTrade } from '@/lib/trades'
import { fmtDate, fmtNum, prettyStrategy } from '@/lib/format'
import { Badge, Callout, PageHead, Panel, Seg, Skeleton } from '@/components/ui/Panel'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { SideChip } from '@/components/ui/bits'
import { ApiNote, fmtStamp, RefreshButton } from './ops/shared'

type Tab = 'executed' | 'open' | 'broker' | 'approvals'

interface Order {
  id: string
  t: string
  side: string
  instrument: string
  segment: string
  qty: number
  price: number | null
  kind: 'Entry' | 'Exit' | 'Open'
  reason: string | null
  strategy: string
  lane: string
  legs: number
}

const flip = (a: string | null) => (a === 'BUY' ? 'SELL' : a === 'SELL' ? 'BUY' : '—')

function executedFor(trades: ClosedTrade[], date: string): Order[] {
  const out: Order[] = []
  for (const tr of trades) {
    const base = {
      instrument: instrumentLabel(tr.symbol, tr.underlying, tr.expiry),
      segment: tr.exchange === 'NFO' || isOptionTicker(tr.symbol) || tr.legs.length ? 'NFO' : 'NSE',
      qty: tr.qty,
      strategy: tr.strategy,
      lane: tr.lane,
      legs: tr.legs.length,
    }
    if (tr.entryDate === date) out.push({ ...base, id: `${tr.id}-in`, t: tr.entryT ?? '', side: tr.side ?? '—', price: tr.entryPrice, kind: 'Entry', reason: null })
    if (tr.exitDate === date) out.push({ ...base, id: `${tr.id}-out`, t: tr.exitT ?? '', side: flip(tr.side), price: tr.exitPrice, kind: 'Exit', reason: tr.reason })
  }
  return out.sort((a, b) => b.t.localeCompare(a.t))
}

function openFor(positions: Position[]): Order[] {
  return positions.map((p) => ({
    id: p.id,
    t: p.openedT ?? '',
    side: p.side,
    instrument: p.instrument,
    segment: p.segment,
    qty: p.qty,
    price: p.avg,
    kind: 'Open',
    reason: null,
    strategy: p.strategy,
    lane: p.lane,
    legs: p.legs.length,
  }))
}

interface BrokerOrder {
  orderid?: string
  tradingsymbol?: string
  transactiontype?: string
  quantity?: number | string
  price?: number | string
  averageprice?: number | string
  orderstatus?: string
  status?: string
  ordertype?: string
  producttype?: string
  updatetime?: string
  exchange?: string
  text?: string
}

interface Ticket {
  ticket_id: string
  strategy_id: string
  symbol: string
  exchange: string
  action: string
  quantity: number
  price: number | null
  stop_loss: number | null
  target: number | null
  order_type: string
  state: string
  created_at: string
  expires_at: string
  reason: string | null
}

const statusTone = (s: string): 'pos' | 'neg' | 'warn' | 'muted' => {
  const v = s.toLowerCase()
  if (/complete|filled|executed/.test(v)) return 'pos'
  if (/reject|cancel/.test(v)) return 'neg'
  if (/open|pending|trigger|put/.test(v)) return 'warn'
  return 'muted'
}

export default function Orders() {
  const { trades, loading, error, unsupported } = useTrades()
  const { date, isToday } = useSessionDate()
  const { status } = useApiState()
  const book = useLiveBook()
  const [tab, setTab] = useState<Tab>('executed')
  const [strategy, setStrategy] = useState('all')
  const enabled = status === 'online'
  const brokerRes = useApi<{ orders: BrokerOrder[] | null }>('/live/orders', { poll: 15000, enabled: enabled && tab === 'broker' })
  const apprRes = useApi<{ count: number; tickets: Ticket[] }>('/approvals', { poll: 15000, enabled: enabled && tab === 'approvals' })

  const executed = useMemo(() => executedFor(trades, date), [trades, date])
  const open = useMemo(() => openFor(book.positions), [book.positions])
  const strategies = useMemo(() => [...new Set([...executed, ...open].map((o) => o.strategy))].sort(), [executed, open])
  const keep = (o: Order) => strategy === 'all' || o.strategy === strategy

  const cols = (withKind: boolean): Column<Order>[] => [
    { key: 't', header: 'Time', sort: (o) => o.t, cell: (o) => <span className="num">{o.t ? o.t.slice(0, 8) : '—'}</span> },
    { key: 'side', header: 'Type', cell: (o) => <SideChip side={o.side} /> },
    {
      key: 'ins',
      header: 'Instrument',
      sort: (o) => o.instrument,
      cell: (o) => (
        <span>
          {o.instrument} <Badge tone="outline">{o.segment}</Badge>
          {o.legs > 1 && <> <Badge tone="violet">{o.legs} legs</Badge></>}
        </span>
      ),
    },
    { key: 'qty', header: 'Qty.', align: 'r', sort: (o) => o.qty, cell: (o) => <span className="num">{o.qty}</span> },
    { key: 'px', header: 'Avg. price', align: 'r', cell: (o) => <span className="num">{fmtNum(o.price)}</span> },
    { key: 'st', header: 'Status', cell: (o) => (o.kind === 'Open' ? <Badge tone="info" dot>OPEN POSITION</Badge> : <Badge tone="pos" dot>COMPLETE</Badge>) },
    ...(withKind ? [{ key: 'kind', header: 'Note', cell: (o: Order) => <span className="muted">{o.kind === 'Entry' ? 'Entry' : `Exit · ${(o.reason ?? 'closed').replace('_HIT', '')}`}</span> }] : []),
    { key: 'strat', header: 'Strategy', sort: (o) => o.strategy, cell: (o) => <span>{prettyStrategy(o.strategy)} <Badge tone={o.lane === 'managed' ? 'accent' : 'outline'}>{o.lane}</Badge></span> },
  ]

  const brokerCols: Column<BrokerOrder>[] = [
    { key: 't', header: 'Time', sort: (o) => o.updatetime ?? '', cell: (o) => <span className="num">{o.updatetime ?? '—'}</span> },
    { key: 'side', header: 'Type', cell: (o) => <SideChip side={o.transactiontype ?? ''} /> },
    { key: 'ins', header: 'Instrument', sort: (o) => o.tradingsymbol ?? '', cell: (o) => <span>{o.tradingsymbol ?? '—'} {o.exchange && <Badge tone="outline">{o.exchange}</Badge>}</span> },
    { key: 'qty', header: 'Qty.', align: 'r', cell: (o) => <span className="num">{o.quantity ?? '—'}</span> },
    { key: 'px', header: 'Price', align: 'r', cell: (o) => <span className="num">{Number(o.averageprice) > 0 ? o.averageprice : (o.price ?? '—')}</span> },
    { key: 'ot', header: 'Order', cell: (o) => <span className="muted">{[o.ordertype, o.producttype].filter(Boolean).join(' · ') || '—'}</span> },
    { key: 'st', header: 'Status', cell: (o) => { const s = o.orderstatus ?? o.status ?? '—'; return <Badge tone={statusTone(s)} dot>{s.toUpperCase()}</Badge> } },
    { key: 'txt', header: 'Message', wrap: true, cell: (o) => <span className="muted">{o.text || ''}</span> },
  ]

  const ticketCols: Column<Ticket>[] = [
    { key: 't', header: 'Created', sort: (t) => t.created_at, cell: (t) => <span className="num">{fmtStamp(t.created_at)}</span> },
    { key: 'side', header: 'Type', cell: (t) => <SideChip side={t.action} /> },
    { key: 'ins', header: 'Instrument', sort: (t) => t.symbol, cell: (t) => <span>{t.symbol} <Badge tone="outline">{t.exchange}</Badge></span> },
    { key: 'qty', header: 'Qty.', align: 'r', cell: (t) => <span className="num">{t.quantity}</span> },
    { key: 'px', header: 'Price', align: 'r', cell: (t) => <span className="num">{fmtNum(t.price)}</span> },
    { key: 'sl', header: 'SL / Target', align: 'r', cell: (t) => <span className="num muted">{fmtNum(t.stop_loss)} / {fmtNum(t.target)}</span> },
    { key: 'st', header: 'State', cell: (t) => <Badge tone={t.state === 'PENDING' ? 'warn' : t.state === 'APPROVED' ? 'pos' : 'muted'} dot>{t.state}</Badge> },
    { key: 'ex', header: 'Expires', cell: (t) => <span className="num muted">{fmtStamp(t.expires_at)}</span> },
    { key: 'strat', header: 'Strategy', sort: (t) => t.strategy_id, cell: (t) => prettyStrategy(t.strategy_id) },
  ]

  const execRows = executed.filter(keep)
  const openRows = open.filter(keep)
  const needsDay = tab === 'executed'

  return (
    <>
      <PageHead
        title="Orders"
        sub={`${needsDay ? `${fmtDate(date, 'long')} · ` : ''}the algo places and exits every order; this is a read-only view.`}
        actions={
          <>
            <select className="select" value={strategy} onChange={(e) => setStrategy(e.target.value)} aria-label="Strategy filter" style={{ maxWidth: 190 }}>
              <option value="all">All strategies</option>
              {strategies.map((s) => <option key={s} value={s}>{prettyStrategy(s)}</option>)}
            </select>
            <Seg<Tab>
              label="Order book"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'executed', label: `Executed (${execRows.length})` },
                { value: 'open', label: `Open (${openRows.length})` },
                { value: 'broker', label: 'Broker book' },
                { value: 'approvals', label: 'Approvals' },
              ]}
            />
          </>
        }
      />
      <div className="stack">
        {unsupported && <Callout tone="warn" title="Closed trades unavailable.">The API has no <code>/console/trades</code> endpoint — update the Genie backend.</Callout>}
        {error && !unsupported && <Callout tone="warn" title="Closed trades unavailable.">{error.message}</Callout>}

        {tab === 'executed' && (
          <Panel flush title="Executed orders" sub="Derived from closed trades: one entry and one exit order per trade, filled in full">
            {loading && !trades.length ? <Skeleton height={160} /> : <DataTable dense rows={execRows} columns={cols(true)} rowKey={(o) => o.id} initialSort={{ key: 't', dir: 'desc' }} emptyTitle="No orders this session" emptyHint="Nothing was entered or exited on this date." />}
          </Panel>
        )}

        {tab === 'open' && (
          <Panel flush title="Open positions" sub="Entry orders still working — from the live paper book">
            {!isToday && <div style={{ padding: 12 }}><Callout tone="info">Open positions are only available for today; the selected session is {fmtDate(date, 'long')}.</Callout></div>}
            {book.state === 'error' && <div style={{ padding: 12 }}><Callout tone="warn" title="Live book unavailable.">{book.error}</Callout></div>}
            {book.state === 'connecting' ? <Skeleton height={120} /> : <DataTable dense rows={openRows} columns={cols(false)} rowKey={(o) => o.id} initialSort={{ key: 't', dir: 'desc' }} emptyTitle="No open positions" emptyHint="The book is flat." />}
          </Panel>
        )}

        {tab === 'broker' && (
          <Panel flush title="Broker order book" sub="Live Angel One orders from /live/orders" actions={<RefreshButton onClick={brokerRes.refresh} />}>
            {brokerRes.error && !brokerRes.data ? <div style={{ padding: 12 }}><ApiNote error={brokerRes.error} what="the broker order book" /></div> : !brokerRes.data ? <Skeleton height={120} /> : (
              <DataTable dense rows={brokerRes.data.orders ?? []} columns={brokerCols} rowKey={(o) => o.orderid ?? JSON.stringify(o)} initialSort={{ key: 't', dir: 'desc' }} emptyTitle="No broker orders" emptyHint="Paper trading never reaches the broker, so this stays empty until live trading is enabled." />
            )}
          </Panel>
        )}

        {tab === 'approvals' && (
          <Panel flush title="Pending approvals" sub="Signals waiting for a human decision (read-only here)" actions={<RefreshButton onClick={apprRes.refresh} />}>
            {apprRes.error && !apprRes.data ? <div style={{ padding: 12 }}><ApiNote error={apprRes.error} what="approval tickets" /></div> : !apprRes.data ? <Skeleton height={120} /> : (
              <DataTable dense rows={apprRes.data.tickets} columns={ticketCols} rowKey={(t) => t.ticket_id} initialSort={{ key: 't', dir: 'desc' }} emptyTitle="No approval tickets" emptyHint="Nothing is waiting for approval." />
            )}
          </Panel>
        )}

        <p className="muted tiny" style={{ margin: 0 }}>Rejected and cancelled orders are not shown: the Genie API doesn&apos;t record risk-gate blocks or order rejections for paper trading.</p>
      </div>
    </>
  )
}
