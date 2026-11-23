import { useMemo, useState } from 'react'
import { useSelectedDate, useStore, useDay } from '@/data/store'
import { instrumentLabel } from '@/lib/positions'
import { fmtDate, fmtNum, prettyStrategy } from '@/lib/format'
import { Badge, Callout, PageHead, Panel, Seg } from '@/components/ui/Panel'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { SideChip } from '@/components/ui/bits'
import type { RiskBlock, Trade } from '@/types'

type Tab = 'executed' | 'rejected'

interface Order {
  id: string
  t: string
  side: string
  symbol: string
  instrument: string
  segment: string
  qty: number
  price: number | null
  kind: 'Entry' | 'Exit'
  reason: string | null
  strategy: string
  lane: string
  legs: number
}

const flip = (a: string | null) => (a === 'BUY' ? 'SELL' : a === 'SELL' ? 'BUY' : '—')

function ordersFor(trades: Trade[], date: string): Order[] {
  const out: Order[] = []
  for (const tr of trades) {
    const base = {
      symbol: tr.symbol,
      instrument: instrumentLabel(tr.symbol, tr.underlying ?? null, tr.expiry ?? null),
      segment: tr.exchange === 'NFO' ? 'NFO' : 'NSE',
      qty: tr.qty,
      strategy: tr.strategy,
      lane: tr.lane,
      legs: tr.legs?.length ?? 0,
    }
    if (tr.entryDate === date && tr.entryT) out.push({ ...base, id: `${tr.id}-in`, t: tr.entryT, side: tr.action ?? '—', price: tr.entryPrice, kind: 'Entry', reason: null })
    if (tr.exitDate === date && tr.exitT) out.push({ ...base, id: `${tr.id}-out`, t: tr.exitT, side: flip(tr.action), price: tr.exitPrice, kind: 'Exit', reason: tr.reason })
  }
  return out.sort((a, b) => b.t.localeCompare(a.t))
}

export default function Orders() {
  const { trades } = useStore()
  const [date] = useSelectedDate()
  const { day } = useDay(date)
  const [tab, setTab] = useState<Tab>('executed')
  const orders = useMemo(() => ordersFor(trades, date), [trades, date])
  const blocks = useMemo(() => (day?.riskBlocks ?? []).map((b, i) => ({ ...b, i })), [day])

  const executed: Column<Order>[] = [
    { key: 't', header: 'Time', sort: (o) => o.t, cell: (o) => <span className="num">{o.t.slice(0, 8)}</span> },
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
    { key: 'qty', header: 'Qty.', align: 'r', sort: (o) => o.qty, cell: (o) => <span className="num">{o.qty}/{o.qty}</span> },
    { key: 'px', header: 'Avg. price', align: 'r', cell: (o) => <span className="num">{fmtNum(o.price)}</span> },
    { key: 'st', header: 'Status', cell: () => <Badge tone="pos" dot>COMPLETE</Badge> },
    { key: 'kind', header: 'Note', cell: (o) => <span className="muted">{o.kind === 'Entry' ? 'Entry' : `Exit · ${(o.reason ?? 'closed').replace('_HIT', '')}`}</span> },
    { key: 'strat', header: 'Strategy', sort: (o) => o.strategy, cell: (o) => <span>{prettyStrategy(o.strategy)} <Badge tone={o.lane === 'managed' ? 'accent' : 'outline'}>{o.lane}</Badge></span> },
  ]

  const rejected: Column<RiskBlock & { i: number }>[] = [
    { key: 't', header: 'Time', sort: (b) => b.t, cell: (b) => <span className="num">{b.t.slice(0, 8)}</span> },
    { key: 'ins', header: 'Instrument', sort: (b) => b.symbol, cell: (b) => <span className="mono">{b.symbol}</span> },
    { key: 'st', header: 'Status', cell: () => <Badge tone="neg" dot>REJECTED</Badge> },
    { key: 'cat', header: 'Gate', sort: (b) => b.category, cell: (b) => <Badge tone="warn">{b.category}</Badge> },
    { key: 'why', header: 'Reason', wrap: true, cell: (b) => <span className="muted">{b.reason}</span> },
    { key: 'strat', header: 'Strategy', sort: (b) => b.strategy, cell: (b) => prettyStrategy(b.strategy) },
  ]

  return (
    <>
      <PageHead
        title="Orders"
        sub={`Order book for ${fmtDate(date, 'long')} · the algo places and exits every order; this is a read-only view.`}
        actions={<Seg<Tab> label="Order status" value={tab} onChange={setTab} options={[{ value: 'executed', label: `Executed (${orders.length})` }, { value: 'rejected', label: `Rejected (${blocks.length})` }]} />}
      />
      <div className="stack">
        <Callout tone="info">
          Orders are reconstructed from entry and exit log events, so each is shown as filled in full at its logged fill price. Pending, open and cancelled orders are not recorded.
        </Callout>
        <Panel flush title={tab === 'executed' ? 'Executed orders' : 'Orders blocked by the risk gate'}>
          {tab === 'executed' ? (
            <DataTable dense rows={orders} columns={executed} rowKey={(o) => o.id} initialSort={{ key: 't', dir: 'desc' }} emptyTitle="No orders this session" emptyHint="Nothing was entered or exited on this date." />
          ) : (
            <DataTable dense rows={blocks} columns={rejected} rowKey={(b) => String(b.i)} initialSort={{ key: 't', dir: 'desc' }} emptyTitle="No rejected orders" emptyHint="The risk gate blocked nothing this session." />
          )}
        </Panel>
      </div>
    </>
  )
}
