import type { ApiTrade, ApiTradeLeg, Lane } from '@/api/types'

export interface ClosedTrade {
  id: string
  strategy: string
  lane: Lane
  symbol: string
  exchange: string | null
  side: 'BUY' | 'SELL' | null
  qty: number
  entryDate: string
  entryT: string | null
  exitDate: string
  /** HH:MM:SS, or null for trades closed before the API recorded exit times. */
  exitT: string | null
  entryPrice: number
  exitPrice: number | null
  stopLoss: number | null
  target: number | null
  reason: string | null
  gross: number
  net: number
  brokerage: number
  stt: number
  exchCharges: number
  gst: number
  other: number
  slippage: number
  underlying: string | null
  expiry: string | null
  netCredit: number | null
  legs: ApiTradeLeg[]
  /** False for trades closed before the engine stored side/legs/charges. */
  hasDetail: boolean
  initialRisk: number | null
}

const datePart = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null)
const timePart = (iso: string | null | undefined) => {
  const m = iso ? /T(\d{2}:\d{2}:\d{2})/.exec(iso) : null
  return m ? m[1] : null
}

export function normalizeTrade(t: ApiTrade): ClosedTrade | null {
  if (t.net_pnl == null) return null
  const side = t.side === 'SELL' ? 'SELL' : t.side === 'BUY' ? 'BUY' : null
  const c = t.charges
  const costs = (c?.brokerage ?? 0) + (c?.stt ?? 0) + (c?.exchange_charges ?? 0) + (c?.gst ?? 0) + (c?.other ?? 0) + (c?.slippage ?? 0)
  const stop = t.stop_loss
  // Risk budgeted at entry: distance to the stop in premium/price terms × qty.
  const initialRisk = stop != null && side && t.qty ? Math.abs(stop - t.entry_price) * t.qty : null
  return {
    id: t.id,
    strategy: t.strategy_id,
    lane: t.deployment_mode,
    symbol: t.symbol,
    exchange: t.exchange,
    side,
    qty: t.qty,
    entryDate: datePart(t.entry_time) ?? t.session_date,
    entryT: timePart(t.entry_time),
    exitDate: datePart(t.exit_time) ?? t.session_date,
    exitT: timePart(t.exit_time),
    entryPrice: t.entry_price,
    exitPrice: t.exit_price,
    stopLoss: stop,
    target: t.target,
    reason: t.exit_reason,
    gross: t.gross_pnl ?? t.net_pnl + costs,
    net: t.net_pnl,
    brokerage: c?.brokerage ?? 0,
    stt: c?.stt ?? 0,
    exchCharges: c?.exchange_charges ?? 0,
    gst: c?.gst ?? 0,
    other: c?.other ?? 0,
    slippage: c?.slippage ?? 0,
    underlying: t.underlying,
    expiry: t.expiry,
    netCredit: t.net_credit,
    legs: t.legs ?? [],
    hasDetail: t.gross_pnl != null,
    initialRisk: initialRisk && initialRisk > 0 ? initialRisk : null,
  }
}

/** Oldest-first, so running curves read left to right. The API is newest-first, so its order breaks ties. */
export function normalizeTrades(rows: ApiTrade[]): ClosedTrade[] {
  const out = [...rows].reverse().map(normalizeTrade).filter((t): t is ClosedTrade => t != null)
  return out.sort((a, b) => `${a.exitDate}${a.exitT ?? ''}`.localeCompare(`${b.exitDate}${b.exitT ?? ''}`))
}
