import { describe, expect, it } from 'vitest'
import type { ApiTradeLeg } from '@/api/types'
import { fromClosed, fromLive, optionLabel, payoff, payoffReady, totals, type PosLeg } from './positions'
import type { ClosedTrade } from './trades'

const leg = (action: 'BUY' | 'SELL', type: 'CE' | 'PE', strike: number, avg: number): PosLeg => ({
  no: 1, action, type, strike, expiry: null, symbol: null, qty: 100, lots: 1, avg, ltp: null, pnl: null, source: 'live',
})

const closed = (over: Partial<ClosedTrade>): ClosedTrade => ({
  id: 't', strategy: 's', lane: 'research', symbol: 'NIFTY_IRON_CONDOR', exchange: 'NFO', side: 'SELL', qty: 65,
  entryDate: '2026-11-20', entryT: '10:00:00', exitDate: '2026-11-23', exitT: '11:00:00', entryPrice: 50, exitPrice: 30,
  stopLoss: 80, target: 20, reason: 'TARGET_HIT', gross: 1400, net: 1300, brokerage: 40, stt: 30, exchCharges: 10, gst: 10, other: 0,
  slippage: 10, underlying: 'NIFTY', expiry: '2026-11-26', netCredit: 50, legs: [], hasDetail: true, initialRisk: 1950, ...over,
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

describe('fromClosed', () => {
  it('maps a closed combo with its entry legs and realised P&L', () => {
    const [p] = fromClosed([
      closed({
        legs: [
          { leg_no: 1, action: 'SELL', option_type: 'CE', strike: 100, lot_size: 65, price: 30, symbol: 'A' },
          { leg_no: 2, action: 'BUY', option_type: 'CE', strike: 110, lot_size: 65, price: 10, symbol: 'B' },
        ],
      }),
    ])
    expect(p).toMatchObject({ kind: 'combo', status: 'closed', pnl: 1300, side: 'SELL', lots: 1, carried: true, source: 'closed' })
    expect(p.legs.map((l) => l.avg)).toEqual([30, 10])
    expect(totals([p])).toMatchObject({ realised: 1300, closedCount: 1, openCount: 0 })
  })

  it('degrades gracefully for older trades with no stored detail', () => {
    const [p] = fromClosed([closed({ legs: [], side: null, exchange: null, symbol: 'RELIANCE', hasDetail: false })])
    expect(p).toMatchObject({ kind: 'equity', side: 'BUY', legs: [] })
  })

  describe('contract legs', () => {
    const apiLeg = (over: Partial<ApiTradeLeg> = {}): ApiTradeLeg => ({
      leg_no: 1, action: 'SELL', option_type: 'CE', strike: 100, lot_size: 65, qty: 65, symbol: 'NIFTY01DEC26100CE', underlying: 'NIFTY',
      expiry: '2026-12-01', entry_price: 30, exit_price: 20, gross_pnl: 650, charges: { brokerage: 10, slippage: 5 }, net_pnl: 635, ...over,
    })

    it('reads each contract’s entry price, exit price and net P&L from the API leg', () => {
      const [p] = fromClosed([
        closed({ legs: [apiLeg(), apiLeg({ leg_no: 2, action: 'BUY', strike: 110, entry_price: 10, exit_price: 12, gross_pnl: -130, net_pnl: -145 })] }),
      ])
      expect(p.legs).toMatchObject([
        { no: 1, action: 'SELL', strike: 100, expiry: '2026-12-01', avg: 30, ltp: 20, pnl: 635, lots: 1, source: 'exit' },
        { no: 2, action: 'BUY', strike: 110, avg: 10, ltp: 12, pnl: -145, source: 'exit' },
      ])
    })

    it('derives net P&L from gross P&L and charges when the API sends no net_pnl', () => {
      const [p] = fromClosed([closed({ legs: [apiLeg({ net_pnl: undefined })] })])
      expect(p.legs[0].pnl).toBe(635)
    })

    it('keeps the entry price of a contract that was not priced at exit and still draws the payoff', () => {
      const [p] = fromClosed([
        closed({
          legs: [
            apiLeg({ exit_price: null, gross_pnl: null, net_pnl: null }),
            apiLeg({ leg_no: 2, option_type: 'PE', strike: 90, entry_price: 25, exit_price: null, gross_pnl: null, net_pnl: null }),
          ],
        }),
      ])
      expect(p.legs[0]).toMatchObject({ avg: 30, ltp: null, pnl: null, source: 'entry' })
      expect(payoffReady(p.legs)).toBe(true)
    })
  })
})

describe('optionLabel', () => {
  it('names the contract from its own expiry', () => {
    expect(optionLabel({ strike: 25850, type: 'CE', expiry: '2026-12-01' }, 'NIFTY')).toBe('NIFTY 01DEC 25850 CE')
  })

  it('leaves out an expiry it cannot read instead of printing "Invalid Date"', () => {
    expect(optionLabel({ strike: 25850, type: 'PE', expiry: '01-Dec-2026' }, 'NIFTY')).toBe('NIFTY 25850 PE')
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
