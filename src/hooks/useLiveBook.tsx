import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authHeaders, getApiBase, onApiChange } from '@/hooks/useLiveApi'
import { fromLive, totals, type BookTotals, type LivePayload, type Position } from '@/lib/positions'
import type { Lane } from '@/types'

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
const EMPTY = totals([])
const Ctx = createContext<LiveBook>({ state: 'off', error: null, positions: [], asOf: null, totals: EMPTY, refresh: () => undefined })

async function fetchLane(base: string, lane: Lane, signal: AbortSignal): Promise<Position[]> {
  const res = await fetch(`${base}/api/v1/papertrade/pnl?deployment_mode=${lane}`, { headers: authHeaders(), signal })
  if (res.status === 401 || res.status === 403) throw new Error('The API rejected the key (HTTP ' + res.status + '). Check the key in Settings.')
  if (!res.ok) throw new Error(`The API answered HTTP ${res.status}.`)
  return fromLive((await res.json()) as LivePayload, lane)
}

/** Polls the Genie API for marked-to-market positions (managed + research lanes) while the tab is visible. */
export function LiveBookProvider({ children }: { children: ReactNode }) {
  const [base, setBase] = useState(getApiBase)
  const [tick, setTick] = useState(0)
  const [book, setBook] = useState<Omit<LiveBook, 'refresh' | 'totals'>>({ state: base ? 'connecting' : 'off', error: null, positions: [], asOf: null })

  useEffect(() => onApiChange(() => setBase(getApiBase())), [])

  useEffect(() => {
    if (!base) {
      setBook({ state: 'off', error: null, positions: [], asOf: null })
      return
    }
    let alive = true
    let current: AbortController | null = null
    const run = async () => {
      if (document.visibilityState === 'hidden') return
      const ctl = new AbortController()
      current = ctl
      const timer = setTimeout(() => ctl.abort(), 8000)
      try {
        const [managed, research] = await Promise.all([fetchLane(base, 'managed', ctl.signal), fetchLane(base, 'research', ctl.signal)])
        if (alive) setBook({ state: 'live', error: null, positions: [...managed, ...research], asOf: new Date() })
      } catch (e) {
        if (!alive) return
        const msg = e instanceof Error && !/abort|fetch|network/i.test(e.message) ? e.message : 'Cannot reach the API. It must be served over HTTPS with CORS allowing this site.'
        setBook((b) => ({ ...b, state: 'error', error: msg }))
      } finally {
        clearTimeout(timer)
      }
    }
    setBook((b) => ({ ...b, state: b.state === 'live' ? 'live' : 'connecting' }))
    void run()
    const id = setInterval(run, POLL_MS)
    return () => {
      alive = false
      current?.abort()
      clearInterval(id)
    }
  }, [base, tick])

  const value = useMemo<LiveBook>(() => ({ ...book, totals: totals(book.positions), refresh: () => setTick((t) => t + 1) }), [book])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useLiveBook = () => useContext(Ctx)
