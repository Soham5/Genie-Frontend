import { describe, expect, it } from 'vitest'
import { executedFor, openFor } from './orders'
import { fromLive } from './positions'
import type { ClosedTrade } from './trades'

const condor = (over: Partial<ClosedTrade> = {}): ClosedTrade => ({
  id: 't1', strategy: 'condor', lane: 'research', symbol: 'NIFTY_IRON_CONDOR', exchange: 'NFO', side: 'SELL', qty: 65,
  entryDate: '2026-11-27', entryT: '10:00:00', exitDate: '2026-11-27', exitT: '10:30:00', entryPrice: 50, exitPrice: 30,
  stopLoss: null, target: null, reason: 'SL_HIT', gross: 1300, net: 1200, brokerage: 0, stt: 0, exchCharges: 0, gst: 0, other: 0,
  slippage: 0, underlying: 'NIFTY', expiry: '2026-12-01', netCredit: 50, hasDetail: true, initialRisk: null,
  legs: [
    { leg_no: 1, action: 'SELL', option_type: 'CE', strike: 25850, lot_size: 65, qty: 65, symbol: 'NIFTY01DEC2625850CE', expiry: '2026-12-01', entry_price: 30, exit_price: 20 },
    { leg_no: 2, action: 'BUY', option_type: 'CE', strike: 26000, lot_size: 65, qty: 65, symbol: 'NIFTY01DEC2626000CE', expiry: '2026-12-01', entry_price: 10, exit_price: null },
  ],
  ...over,
})

describe('executedFor', () => {
  it('lists each contract on the entry order at its entry price', () => {
    const [entry] = executedFor([condor({ exitDate: '2026-11-28' })], '2026-11-27')
    expect(entry).toMatchObject({ kind: 'Entry', price: 50 })
    expect(entry.contracts).toEqual([
      { no: 1, side: 'SELL', label: 'NIFTY 01DEC 25850 CE', symbol: 'NIFTY01DEC2625850CE', qty: 65, lots: 1, price: 30 },
      { no: 2, side: 'BUY', label: 'NIFTY 01DEC 26000 CE', symbol: 'NIFTY01DEC2626000CE', qty: 65, lots: 1, price: 10 },
    ])
  })

  it('lists each contract on the exit order trading the other way at its exit price', () => {
    const [exit] = executedFor([condor({ entryDate: '2026-11-26' })], '2026-11-27')
    expect(exit).toMatchObject({ kind: 'Exit', side: 'BUY', price: 30 })
    expect(exit.contracts.map((c) => [c.side, c.price])).toEqual([['BUY', 20], ['SELL', null]])
  })

  it('has no contracts on a single-instrument order', () => {
    const orders = executedFor([condor({ legs: [], symbol: 'RELIANCE', exchange: 'NSE', underlying: null, expiry: null })], '2026-11-27')
    expect(orders.map((o) => o.contracts)).toEqual([[], []])
  })
})

describe('openFor', () => {
  it('lists the live legs of an open combo at their entry prices', () => {
    const base = { strategy_id: 'condor', position_symbol: 'NIFTY_IRON_CONDOR', underlying: 'NIFTY', expiry: '2026-12-01', entry_time: '2026-11-27T10:00:00', qty: 65, net_credit: 20 }
    const [p] = fromLive(
      {
        positions: [
          { ...base, symbol: 'NIFTY01DEC2625850CE', leg_id: 1, action: 'SELL', option_type: 'CE', strike: 25850, entry_price: 30, current_price: 25 },
          { ...base, symbol: 'NIFTY01DEC2626000CE', leg_id: 2, action: 'BUY', option_type: 'CE', strike: 26000, entry_price: 10, current_price: 9 },
        ],
      },
      'research',
    )
    const [order] = openFor([p])
    expect(order.kind).toBe('Open')
    expect(order.contracts).toMatchObject([
      { side: 'SELL', label: 'NIFTY 01DEC 25850 CE', price: 30 },
      { side: 'BUY', label: 'NIFTY 01DEC 26000 CE', price: 10 },
    ])
  })
})
