import { describe, expect, it } from 'vitest'
import { fromLive, fromTrades, payoff, totals, type PosLeg } from './positions'
import type { Trade } from '@/types'

const leg = (action: 'BUY' | 'SELL', type: 'CE' | 'PE', strike: number, avg: number): PosLeg => ({
  no: 1, action, type, strike, expiry: null, symbol: null, qty: 100, lots: 1, avg, ltp: null, pnl: null, source: 'live',
})

const trade = (over: Partial<Trade>): Trade => ({
  id: 't', strategy: 's', lane: 'research', symbol: 'BANKNIFTY_PE', exchange: 'NFO', action: 'BUY', qty: 30,
  entryDate: '2026-11-20', entryT: '10:00:00', exitDate: null, exitT: null, entryPrice: 100, exitPrice: null,
  stopLoss: 80, target: 140, initialRisk: 600, reason: null, gross: null, brokerage: null, stt: null,
  exchCharges: null, gst: null, slippage: null, net: null, circuitState: null, status: 'open', ...over,
})

describe('payoff', () => {
  it('finds breakevens and capped profit for a short straddle', () => {
    const p = payoff([leg('SELL', 'CE', 100, 10), leg('SELL', 'PE', 100, 10)])!
    expect(p.maxProfit).toBe(2000)
    expect(p.unlimitedLoss).toBe(true)
    expect(p.maxLoss).toBeNull()
    expect(p.breakevens).toEqual([80, 120])
  })

  it('bounds loss on a credit spread', () => {
    const p = payoff([leg('SELL', 'PE', 100, 8), leg('BUY', 'PE', 90, 3)])!
    expect(p.maxProfit).toBe(500)
    expect(p.maxLoss).toBe(-500)
    expect(p.unlimitedLoss).toBe(false)
  })

  it('is unavailable when a strike is unknown', () => {
    expect(payoff([{ ...leg('SELL', 'CE', 100, 10), strike: null }])).toBeNull()
  })
})

describe('fromTrades', () => {
  it('keeps carried open entries, drops positions closed on earlier days', () => {
    const rows = fromTrades(
      [
        trade({ id: 'carried' }),
        trade({ id: 'old', exitDate: '2026-11-21', exitT: '11:00:00', exitPrice: 120, net: 500, status: 'closed' }),
        trade({ id: 'today', exitDate: '2026-11-23', exitT: '11:00:00', exitPrice: 120, net: 500, status: 'closed' }),
        trade({ id: 'future', entryDate: '2026-11-24' }),
      ],
      '2026-11-23',
    )
    expect(rows.map((r) => r.id).sort()).toEqual(['carried', 'today'])
    expect(rows.find((r) => r.id === 'carried')).toMatchObject({ status: 'open', carried: true, pnl: null })
    expect(totals(rows)).toMatchObject({ realised: 500, open: null, unpriced: 1 })
  })
})

describe('fromLive', () => {
  it('groups leg rows into one combo and uses the combo P&L', () => {
    const base = { strategy_id: 'condor', position_symbol: 'NIFTY_IRON_CONDOR', underlying: 'NIFTY', entry_time: '2026-11-23T10:00:00', qty: 65, net_credit: 50, combo_unrealized_pnl: 300, combo_mark: 45 }
    const rows = fromLive(
      {
        positions: [
          { ...base, symbol: 'A', leg_id: 1, action: 'SELL', option_type: 'CE', strike: 100, entry_price: 30, current_price: 25, unrealized_pnl: 325 },
          { ...base, symbol: 'B', leg_id: 2, action: 'BUY', option_type: 'CE', strike: 110, entry_price: 10, current_price: 10, unrealized_pnl: 0, mark_source: 'entry_fallback' },
          { strategy_id: 'scalp', symbol: 'BANKNIFTY_PE', action: 'BUY', qty: 30, entry_price: 100, current_price: 110, unrealized_pnl: 300 },
        ],
      },
      'research',
    )
    expect(rows).toHaveLength(2)
    const combo = rows.find((r) => r.kind === 'combo')!
    expect(combo.legs).toHaveLength(2)
    expect(combo.pnl).toBe(300)
    expect(combo.legs[1].unmarked).toBe(true)
    expect(totals(rows).open).toBe(600)
  })
})
