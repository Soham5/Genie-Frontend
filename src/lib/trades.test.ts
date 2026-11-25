import { describe, expect, it } from 'vitest'
import type { ApiTrade } from '@/api/types'
import { normalizeTrades } from './trades'

const row = (over: Partial<ApiTrade>): ApiTrade => ({
  id: '1', strategy_id: 's', deployment_mode: 'research', symbol: 'NIFTY_IRON_CONDOR', session_date: '2026-11-23', entry_time: '2026-11-23T10:00:00',
  exit_reason: 'TARGET_HIT', qty: 65, entry_price: 50, exit_price: 30, net_pnl: 1300, gross_pnl: null, side: null, exit_time: null, exchange: null,
  stop_loss: null, target: null, underlying: null, expiry: null, net_credit: null, legs: null, charges: null, ...over,
})

describe('normalizeTrades', () => {
  it('returns oldest first and skips trades with no realised P&L', () => {
    const out = normalizeTrades([
      row({ id: 'b', exit_time: '2026-11-23T11:00:00' }),
      row({ id: 'x', net_pnl: null }),
      row({ id: 'a', exit_time: '2026-11-22T09:30:00', session_date: '2026-11-22' }),
    ])
    expect(out.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('reads detail written at exit and derives risk from the stop', () => {
    const [t] = normalizeTrades([
      row({
        gross_pnl: 1400, side: 'SELL', stop_loss: 80, exit_time: '2026-11-23T11:05:09',
        charges: { brokerage: 40, stt: 30, exchange_charges: 10, gst: 10, slippage: 10 },
      }),
    ])
    expect(t).toMatchObject({ hasDetail: true, gross: 1400, net: 1300, side: 'SELL', exitDate: '2026-11-23', exitT: '11:05:09', initialRisk: 1950 })
  })

  it('falls back for older trades without detail', () => {
    const [t] = normalizeTrades([row({})])
    expect(t).toMatchObject({ hasDetail: false, gross: 1300, side: null, exitT: null, exitDate: '2026-11-23', initialRisk: null, legs: [] })
  })
})
