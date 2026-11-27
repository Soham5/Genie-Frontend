import { closedLegs, instrumentLabel, isOptionTicker, optionLabel, type PosLeg, type Position } from './positions'
import type { ClosedTrade } from './trades'

/** One contract of a multi-leg F&O order. */
export interface Contract {
  no: number
  side: string
  label: string
  symbol: string | null
  qty: number
  lots: number | null
  /** Entry price on entry and open orders, exit price on exit orders; null when it was not recorded. */
  price: number | null
}

export interface Order {
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
  /** Empty for single-instrument orders and for trades stored before their legs were. */
  contracts: Contract[]
}

const flip = (a: string | null) => (a === 'BUY' ? 'SELL' : a === 'SELL' ? 'BUY' : '—')

/** The contracts behind an order. An exit order trades each leg the other way, at the price that leg was marked at on exit. */
export const contractsFor = (legs: PosLeg[], underlying: string | null, kind: Order['kind']): Contract[] =>
  legs.map((l) => ({
    no: l.no,
    side: kind === 'Exit' ? flip(l.action) : l.action,
    label: optionLabel(l, underlying),
    symbol: l.symbol,
    qty: l.qty,
    lots: l.lots,
    price: kind === 'Exit' ? l.ltp : l.avg,
  }))

/** One entry and one exit order per closed trade that falls on `date`. */
export function executedFor(trades: ClosedTrade[], date: string): Order[] {
  const out: Order[] = []
  for (const tr of trades) {
    const legs = closedLegs(tr)
    const base = {
      instrument: instrumentLabel(tr.symbol, tr.underlying, tr.expiry),
      segment: tr.exchange === 'NFO' || isOptionTicker(tr.symbol) || tr.legs.length ? 'NFO' : 'NSE',
      qty: tr.qty,
      strategy: tr.strategy,
      lane: tr.lane,
    }
    if (tr.entryDate === date) out.push({ ...base, id: `${tr.id}-in`, t: tr.entryT ?? '', side: tr.side ?? '—', price: tr.entryPrice, kind: 'Entry', reason: null, contracts: contractsFor(legs, tr.underlying, 'Entry') })
    if (tr.exitDate === date) out.push({ ...base, id: `${tr.id}-out`, t: tr.exitT ?? '', side: flip(tr.side), price: tr.exitPrice, kind: 'Exit', reason: tr.reason, contracts: contractsFor(legs, tr.underlying, 'Exit') })
  }
  return out.sort((a, b) => b.t.localeCompare(a.t))
}

export function openFor(positions: Position[]): Order[] {
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
    contracts: contractsFor(p.legs, p.underlying, 'Open'),
  }))
}
