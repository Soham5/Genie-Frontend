import type { ApiTradeLeg, Lane } from '@/api/types'
import type { ClosedTrade } from './trades'

export type Side = 'BUY' | 'SELL'

export interface PosLeg {
  no: number
  action: Side
  type: 'CE' | 'PE' | null
  strike: number | null
  expiry: string | null
  symbol: string | null
  qty: number
  lots: number | null
  avg: number | null
  ltp: number | null
  pnl: number | null
  /**
   * `live` = marked now. `exit` = closed trade: `ltp` is the price the contract was marked at on exit and `pnl` is net of
   * the leg's share of costs. `entry` = closed trade where only the entry price was recorded.
   */
  source: 'live' | 'entry' | 'exit'
  /** Live feed had no fresh tick for this leg, so `ltp` is just its entry price. */
  unmarked?: boolean
}

export interface Position {
  id: string
  strategy: string
  lane: Lane
  segment: 'NFO' | 'NSE'
  kind: 'combo' | 'option' | 'equity'
  instrument: string
  underlying: string | null
  expiry: string | null
  side: Side
  qty: number
  lots: number | null
  /** Net premium (combos) or fill price per unit. */
  avg: number
  ltp: number | null
  /** Realised net P&L for closed positions, mark-to-market P&L for live ones, null when no quote exists. */
  pnl: number | null
  status: 'open' | 'closed'
  openedDate: string | null
  openedT: string | null
  closedT: string | null
  exitPrice: number | null
  reason: string | null
  stop: number | null
  target: number | null
  legs: PosLeg[]
  carried: boolean
  source: 'closed' | 'live'
}

const STRUCTURES: [RegExp, string][] = [
  [/IRON_CONDOR/, 'Iron Condor'],
  [/STRADDLE/, 'Short Straddle'],
  [/STRANGLE/, 'Short Strangle'],
  [/CREDIT_SPREAD/, 'Credit Spread'],
]

export function structureName(symbol: string): string | null {
  return STRUCTURES.find(([re]) => re.test(symbol))?.[1] ?? null
}

export const isOptionTicker = (s: string) => /[\d_](CE|PE)$/.test(s)

export function instrumentLabel(symbol: string, underlying: string | null, expiry: string | null): string {
  const struct = structureName(symbol)
  if (struct) {
    const side = /_(CE|PE)_/.exec(symbol)?.[1]
    return [underlying ?? symbol.split('_')[0], struct, side].filter(Boolean).join(' ')
  }
  const m = /^([A-Z]+)_(CE|PE)$/.exec(symbol)
  if (m) return `${m[1]} ATM ${m[2]}${expiry ? ` · exp ${expiry}` : ''}`
  return symbol
}

/** P&L of an `action` position that entered at `entry` and is marked/exited at `price`. */
export const pnlAt = (action: Side, entry: number, price: number, qty: number) => (action === 'SELL' ? entry - price : price - entry) * qty

export const optionLabel = (l: Pick<PosLeg, 'strike' | 'type' | 'expiry'>, underlying: string | null): string => {
  if (l.strike != null && l.type) return [underlying, expiryTag(l.expiry), l.strike, l.type].filter((x) => x != null && x !== '').join(' ')
  return `${underlying ?? 'Option'} ${l.type ?? ''} · strike n/a`.trim()
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** `2026-12-01` → `01DEC`; null for anything that isn't an ISO date. */
export function expiryTag(iso: string | null | undefined): string | null {
  const m = iso ? /^\d{4}-(\d{2})-(\d{2})/.exec(iso) : null
  const month = m ? MONTHS[Number(m[1]) - 1] : undefined
  return m && month ? `${m[2]}${month}` : null
}

/** A leg's trading symbol (`NIFTY01DEC2625850CE`); undefined when it only carries the strategy's synthetic name. */
export const tradingSymbol = (symbol: string | null | undefined): string | undefined => (symbol && /\d(CE|PE)$/.test(symbol) ? symbol : undefined)

const round2 = (n: number) => Math.round(n * 100) / 100

const costOf = (charges: ApiTradeLeg['charges']) => Object.values(charges ?? {}).reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0)

/** A leg's P&L after its share of costs: the API's `net_pnl`, else derived from `gross_pnl` and `charges`. Null when it was never priced at exit. */
const legNet = (l: ApiTradeLeg): number | null => l.net_pnl ?? (l.gross_pnl != null ? round2(l.gross_pnl - costOf(l.charges)) : null)

/**
 * The contracts of a closed combo. `avg` is each leg's entry price; `ltp` and `pnl` are the exit mark and net result, which are
 * null for a leg the engine could not price at exit and for every leg of a trade closed before it recorded them.
 */
export function closedLegs(t: ClosedTrade): PosLeg[] {
  return t.legs.map((l, i) => {
    const qty = l.qty ?? t.qty
    const lotSize = l.lot_size ?? (t.underlying ? LOT_SIZES[t.underlying] : undefined)
    const exit = l.exit_price ?? null
    return {
      no: l.leg_no ?? l.leg_id ?? i + 1,
      action: sideOf(l.action),
      type: l.option_type,
      strike: l.strike,
      expiry: l.expiry ?? t.expiry,
      symbol: l.symbol ?? null,
      qty,
      lots: lotSize ? round2(qty / lotSize) : null,
      avg: l.entry_price ?? l.price ?? l.ltp ?? null,
      ltp: exit,
      pnl: legNet(l),
      source: exit != null ? 'exit' : 'entry',
    }
  })
}

/** Maps closed trades from `/console/trades` to positions. Legs exist for trades closed after the engine started storing them; those closed before it recorded exit marks only carry entry prices. */
export function fromClosed(trades: ClosedTrade[]): Position[] {
  return trades
    .map((t): Position => {
      const lot = t.legs.find((l) => l.lot_size)?.lot_size
      const kind: Position['kind'] = t.legs.length > 1 ? 'combo' : t.exchange === 'NFO' || isOptionTicker(t.symbol) ? 'option' : 'equity'
      const legs = closedLegs(t)
      return {
        id: t.id,
        strategy: t.strategy,
        lane: t.lane,
        segment: t.exchange === 'NFO' || kind !== 'equity' ? 'NFO' : 'NSE',
        kind,
        instrument: instrumentLabel(t.symbol, t.underlying, t.expiry),
        underlying: t.underlying,
        expiry: t.expiry,
        side: t.side ?? (kind === 'combo' ? 'SELL' : 'BUY'),
        qty: t.qty,
        lots: lot ? Math.round((t.qty / lot) * 100) / 100 : null,
        avg: t.entryPrice,
        ltp: t.exitPrice,
        pnl: t.net,
        status: 'closed',
        openedDate: t.entryDate,
        openedT: t.entryT,
        closedT: t.exitT,
        exitPrice: t.exitPrice,
        reason: t.reason,
        stop: t.stopLoss,
        target: t.target,
        legs,
        carried: t.entryDate < t.exitDate,
        source: 'closed',
      }
    })
    .sort((a, b) => (b.closedT ?? '').localeCompare(a.closedT ?? ''))
}

// ── Live Genie API (`GET /api/v1/papertrade/pnl`) ────────────────────────────────────────────

export interface LiveRow {
  strategy_id: string
  strategy_name?: string | null
  underlying?: string | null
  position_symbol?: string
  symbol: string
  expiry?: string | null
  option_type?: 'CE' | 'PE' | null
  strike?: number | null
  leg_id?: number
  action: string
  qty: number
  entry_price?: number | null
  current_price?: number | null
  unrealized_pnl?: number | null
  mark_source?: 'tick' | 'entry_fallback'
  net_credit?: number | null
  combo_mark?: number
  combo_unrealized_pnl?: number
  stop_loss?: number | null
  target?: number | null
  entry_time?: string | null
  session_date?: string | null
}

export interface LivePayload {
  positions?: LiveRow[]
  total_unrealized_pnl?: number
}

const LOT_SIZES: Record<string, number> = { NIFTY: 65, BANKNIFTY: 30, FINNIFTY: 60, MIDCPNIFTY: 120 }
const sideOf = (a: string): Side => (a === 'SELL' ? 'SELL' : 'BUY')

export function fromLive(payload: LivePayload, lane: Lane): Position[] {
  const groups = new Map<string, LiveRow[]>()
  const out: Position[] = []
  for (const row of payload.positions ?? []) {
    if (row.leg_id != null && row.position_symbol) {
      const key = `${row.strategy_id}|${row.position_symbol}|${row.entry_time ?? ''}`
      groups.set(key, [...(groups.get(key) ?? []), row])
      continue
    }
    const side = sideOf(row.action)
    const entry = row.entry_price ?? 0
    const isOpt = isOptionTicker(row.symbol)
    out.push({
      id: `${lane}|${row.strategy_id}|${row.symbol}|${row.entry_time ?? ''}`,
      strategy: row.strategy_id, lane, segment: isOpt ? 'NFO' : 'NSE', kind: isOpt ? 'option' : 'equity',
      instrument: instrumentLabel(row.symbol, null, null), underlying: null, expiry: null, side, qty: row.qty, lots: null,
      avg: entry, ltp: row.current_price ?? null, pnl: row.unrealized_pnl ?? null, status: 'open',
      openedDate: row.session_date ?? null, openedT: clock(row.entry_time), closedT: null, exitPrice: null, reason: null,
      stop: row.stop_loss ?? null, target: row.target ?? null, legs: [], carried: false, source: 'live',
    })
  }

  for (const [key, rows] of groups) {
    const head = rows[0]
    const lot = head.underlying ? LOT_SIZES[head.underlying] : undefined
    const legs: PosLeg[] = rows
      .sort((a, b) => (a.leg_id ?? 0) - (b.leg_id ?? 0))
      .map((r, i) => ({
        no: r.leg_id ?? i + 1, action: sideOf(r.action), type: r.option_type ?? null, strike: r.strike ?? null, expiry: r.expiry ?? null,
        symbol: r.symbol, qty: r.qty, lots: lot ? Math.round((r.qty / lot) * 100) / 100 : null,
        avg: r.entry_price ?? null, ltp: r.current_price ?? null, pnl: r.unrealized_pnl ?? null, source: 'live' as const,
        unmarked: r.mark_source === 'entry_fallback',
      }))
    // Position P&L is the engine's combo mark, which stays authoritative when some legs are unmarked.
    const comboPnl = head.combo_unrealized_pnl ?? legs.reduce((s, l) => s + (l.pnl ?? 0), 0)
    const qty = head.qty
    const netCredit = head.net_credit ?? 0
    const kind: Position['kind'] = legs.length > 1 ? 'combo' : 'option'
    out.push({
      id: `${lane}|${key}`,
      strategy: head.strategy_id, lane, segment: 'NFO', kind,
      instrument: instrumentLabel(head.position_symbol ?? head.symbol, head.underlying ?? null, head.expiry ?? null),
      underlying: head.underlying ?? null, expiry: head.expiry ?? null,
      side: kind === 'combo' ? 'SELL' : sideOf(head.action), qty, lots: lot ? Math.round((qty / lot) * 100) / 100 : null,
      avg: netCredit, ltp: head.combo_mark ?? null, pnl: comboPnl, status: 'open',
      openedDate: head.session_date ?? null, openedT: clock(head.entry_time), closedT: null, exitPrice: null, reason: null,
      stop: head.stop_loss ?? null, target: head.target ?? null, legs, carried: false, source: 'live',
    })
  }
  return out
}

function clock(iso: string | null | undefined): string | null {
  if (!iso) return null
  const m = /T(\d{2}:\d{2}:\d{2})/.exec(iso)
  return m ? m[1] : null
}

// ── Aggregates ────────────────────────────────────────────────────────────────────────────────

export interface BookTotals {
  realised: number
  open: number | null
  total: number | null
  openCount: number
  closedCount: number
  unpriced: number
}

export function totals(positions: Position[]): BookTotals {
  let realised = 0
  let open = 0
  let openCount = 0
  let closedCount = 0
  let unpriced = 0
  for (const p of positions) {
    if (p.status === 'closed') {
      realised += p.pnl ?? 0
      closedCount++
    } else {
      openCount++
      if (p.pnl == null) unpriced++
      else open += p.pnl
    }
  }
  const openKnown = openCount === 0 || unpriced < openCount
  return { realised, open: openKnown ? open : null, total: openKnown ? realised + open : null, openCount, closedCount, unpriced }
}

/** P&L if the position is exited at its stop / target price (premium for combos, price otherwise). */
export function scenarios(p: Position): { atStop: number | null; atTarget: number | null } {
  const f = (px: number | null) => (px == null || !p.qty ? null : pnlAt(p.side, p.avg, px, p.qty))
  return { atStop: f(p.stop), atTarget: f(p.target) }
}

// ── Expiry payoff (Sensibull-style) ───────────────────────────────────────────────────────────

export interface Payoff {
  points: { s: number; pnl: number }[]
  breakevens: number[]
  maxProfit: number | null
  maxLoss: number | null
  /** true = the end of the range keeps growing (no cap). */
  unlimitedProfit: boolean
  unlimitedLoss: boolean
}

export const payoffReady = (legs: PosLeg[]) => legs.length > 0 && legs.every((l) => l.type && l.strike != null && l.avg != null)

const intrinsic = (type: 'CE' | 'PE', k: number, s: number) => (type === 'CE' ? Math.max(0, s - k) : Math.max(0, k - s))

export function payoff(legs: PosLeg[], samples = 160): Payoff | null {
  if (!payoffReady(legs)) return null
  const at = (s: number) => legs.reduce((sum, l) => sum + pnlAt(l.action, l.avg as number, intrinsic(l.type as 'CE' | 'PE', l.strike as number, s), l.qty), 0)
  const ks = legs.map((l) => l.strike as number)
  const lo = Math.min(...ks)
  const hi = Math.max(...ks)
  // Wide enough to show the breakevens, which sit roughly one net premium outside the strikes.
  const premium = legs.reduce((s, l) => s + (l.avg as number), 0)
  const pad = Math.max((hi - lo) * 0.6, lo * 0.06, premium * 1.5)
  const from = Math.max(0, lo - pad)
  const to = hi + pad
  const step = (to - from) / samples
  const points = Array.from({ length: samples + 1 }, (_, i) => {
    const s = from + i * step
    return { s: Math.round(s), pnl: Math.round(at(s) * 100) / 100 }
  })
  const breakevens: number[] = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if ((a.pnl < 0 && b.pnl > 0) || (a.pnl > 0 && b.pnl < 0)) breakevens.push(Math.round(a.s + ((0 - a.pnl) * (b.s - a.s)) / (b.pnl - a.pnl)))
  }
  const far = hi * 50
  const unlimitedProfit = at(far * 2) - at(far) > 1e-6
  const unlimitedLoss = at(far * 2) - at(far) < -1e-6
  // Payoff kinks sit on strikes, which the sampling grid can miss.
  const all = [...points.map((p) => p.pnl), at(0), ...ks.map(at)]
  return {
    points,
    breakevens,
    maxProfit: unlimitedProfit ? null : Math.max(...all),
    maxLoss: unlimitedLoss ? null : Math.min(...all),
    unlimitedProfit,
    unlimitedLoss,
  }
}
