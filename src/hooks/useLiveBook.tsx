import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useApiState } from '@/api/ApiProvider'
import type { Lane } from '@/api/types'
import { useApi } from '@/api/useApi'
import { fromLive, totals, type BookTotals, type LivePayload, type Position } from '@/lib/positions'

export type BookState = 'off' | 'connecting' | 'live' | 'error'

export interface LiveBook {
  state: BookState
  error: string | null
  positions: Position[]
  asOf: Date | null
  totals: BookTotals
  refresh: () => void
}

const POLL_MS = 4000
const Ctx = createContext<LiveBook>({ state: 'off', error: null, positions: [], asOf: null, totals: totals([]), refresh: () => undefined })

const LANES: Lane[] = ['managed', 'research']

/** Polls `GET /papertrade/pnl` for marked-to-market open positions (managed + research lanes) while the tab is visible. */
export function LiveBookProvider({ children }: { children: ReactNode }) {
  const { status } = useApiState()
  const enabled = status === 'online'
  const managed = useApi<LivePayload>('/papertrade/pnl', { params: { deployment_mode: 'managed' }, poll: POLL_MS, enabled })
  const research = useApi<LivePayload>('/papertrade/pnl', { params: { deployment_mode: 'research' }, poll: POLL_MS, enabled })

  const value = useMemo<LiveBook>(() => {
    const results = [managed, research]
    const positions = [managed.data && fromLive(managed.data, LANES[0]), research.data && fromLive(research.data, LANES[1])].flatMap((p) => p ?? [])
    const err = results.find((r) => r.error)?.error ?? null
    const ready = results.every((r) => r.data)
    const state: BookState = !enabled ? 'off' : ready ? (err ? 'error' : 'live') : err ? 'error' : 'connecting'
    return {
      state,
      error: err?.message ?? null,
      positions,
      asOf: [managed.updatedAt, research.updatedAt].filter((d): d is Date => d != null).sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
      totals: totals(positions),
      refresh: () => {
        managed.refresh()
        research.refresh()
      },
    }
  }, [enabled, managed, research])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useLiveBook = () => useContext(Ctx)
