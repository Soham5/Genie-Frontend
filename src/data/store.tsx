import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { BacktestData, ClosedTrade, DataIndex, DayDetail, Trade } from '@/types'
import { isClosed } from '@/lib/stats'

const base = `${import.meta.env.BASE_URL}data/`

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(base + file, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
  return res.json() as Promise<T>
}

interface Store {
  index: DataIndex
  trades: Trade[]
  closedTrades: ClosedTrade[]
  backtest: BacktestData
}

type Boot = { state: 'loading' } | { state: 'error'; error: string } | { state: 'ready'; store: Store }

const StoreCtx = createContext<Store | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Boot>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setBoot({ state: 'loading' })
    Promise.all([getJson<DataIndex>('index.json'), getJson<Trade[]>('trades.json'), getJson<BacktestData>('backtest.json')])
      .then(([index, trades, backtest]) => {
        if (!alive) return
        setBoot({ state: 'ready', store: { index, trades, closedTrades: trades.filter(isClosed), backtest } })
      })
      .catch((e: Error) => alive && setBoot({ state: 'error', error: e.message }))
    return () => { alive = false }
  }, [attempt])

  if (boot.state === 'loading') return <BootScreen />
  if (boot.state === 'error') {
    return (
      <div className="boot">
        <div className="boot__card">
          <h1>Couldn't load the dataset</h1>
          <p className="muted">{boot.error}. Run <code>npm run data</code> to regenerate <code>public/data</code>.</p>
          <button className="btn btn--primary" onClick={() => setAttempt((a) => a + 1)}>Retry</button>
        </div>
      </div>
    )
  }
  return <StoreCtx.Provider value={boot.store}>{children}</StoreCtx.Provider>
}

function BootScreen() {
  return (
    <div className="boot" role="status" aria-live="polite">
      <div className="boot__card">
        <div className="boot__logo">G</div>
        <p className="muted">Loading Genie dataset…</p>
        <div className="boot__bar"><span /></div>
      </div>
    </div>
  )
}

export function useStore(): Store {
  const s = useContext(StoreCtx)
  if (!s) throw new Error('useStore outside DataProvider')
  return s
}

/** The selected session lives in the URL (?d=YYYY-MM-DD) so views are shareable. */
export function useSelectedDate(): [string, (d: string) => void] {
  const { index } = useStore()
  const [params, setParams] = useSearchParams()
  const raw = params.get('d')
  const valid = raw && index.days.some((d) => d.date === raw)
  const date = valid ? raw : index.latestSession
  const set = (d: string) => {
    const next = new URLSearchParams(params)
    if (d === index.latestSession) next.delete('d')
    else next.set('d', d)
    setParams(next, { replace: true })
  }
  return [date, set]
}

const dayCache = new Map<string, Promise<DayDetail>>()

export function useDay(date: string): { day: DayDetail | null; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ date: string; day: DayDetail | null; error: string | null }>({ date, day: null, error: null })
  const latest = useRef(date)
  latest.current = date

  useEffect(() => {
    let promise = dayCache.get(date)
    if (!promise) {
      promise = getJson<DayDetail>(`days/${date}.json`)
      dayCache.set(date, promise)
      promise.catch(() => dayCache.delete(date))
    }
    promise
      .then((day) => latest.current === date && setState({ date, day, error: null }))
      .catch((e: Error) => latest.current === date && setState({ date, day: null, error: e.message }))
  }, [date])

  const fresh = state.date === date
  return { day: fresh ? state.day : null, loading: !fresh || (!state.day && !state.error), error: fresh ? state.error : null }
}

/** Loads every day file once (for multi-day charts); resolves progressively. */
export function useAllDays(dates: string[]): Record<string, DayDetail> {
  const [map, setMap] = useState<Record<string, DayDetail>>({})
  const key = dates.join(',')
  const memo = useMemo(() => dates, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true
    for (const d of memo) {
      let p = dayCache.get(d)
      if (!p) {
        p = getJson<DayDetail>(`days/${d}.json`)
        dayCache.set(d, p)
        p.catch(() => dayCache.delete(d))
      }
      p.then((day) => alive && setMap((m) => (m[d] ? m : { ...m, [d]: day }))).catch(() => undefined)
    }
    return () => { alive = false }
  }, [memo])

  return map
}
