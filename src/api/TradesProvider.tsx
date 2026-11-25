import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { ApiError } from './client'
import type { TradesPayload } from './types'
import { useApi } from './useApi'
import { normalizeTrades, type ClosedTrade } from '@/lib/trades'
import { useApiState } from './ApiProvider'

interface TradesState {
  /** Closed trades, oldest first. */
  trades: ClosedTrade[]
  loading: boolean
  error: ApiError | null
  /** The API answered 404: it doesn't have `/console/trades` yet. */
  unsupported: boolean
  /** The API hit its row limit, so older history is missing. */
  truncated: boolean
  updatedAt: Date | null
  refresh: () => void
}

const LIMIT = 5000
const Ctx = createContext<TradesState>({ trades: [], loading: false, error: null, unsupported: false, truncated: false, updatedAt: null, refresh: () => undefined })

/** One shared fetch of closed trades (`GET /console/trades`) used by Dashboard, Orders, Positions, P&L and Strategies. */
export function TradesProvider({ children }: { children: ReactNode }) {
  const { status } = useApiState()
  const res = useApi<TradesPayload>('/console/trades', { params: { limit: LIMIT }, poll: 30000, enabled: status === 'online' })
  const value = useMemo<TradesState>(
    () => ({
      trades: res.data ? normalizeTrades(res.data.trades) : [],
      loading: res.loading,
      error: res.error,
      unsupported: res.error?.status === 404,
      truncated: (res.data?.count ?? 0) >= LIMIT,
      updatedAt: res.updatedAt,
      refresh: res.refresh,
    }),
    [res.data, res.loading, res.error, res.updatedAt, res.refresh],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useTrades = () => useContext(Ctx)
