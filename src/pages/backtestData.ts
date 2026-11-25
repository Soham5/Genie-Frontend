import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, apiGet } from '@/api/client'
import { useApiState } from '@/api/ApiProvider'

/** One row of `GET /backtest/results` (summary only). */
export interface RunSummary {
  id: string
  strategy_id: string
  approved: boolean
  net_pnl: number
  sharpe_ratio: number
  run_at: string | null
}

/** One run from `GET /backtest/results/{strategy_id}` (full metrics). */
export interface RunDetail {
  id: string
  run_at: string | null
  segment: string
  total_trades: number
  win_rate: number
  win_loss_ratio: number
  sharpe_ratio: number
  max_drawdown: number
  profit_factor: number
  net_pnl: number
  approved: boolean
  rejection_reason: string | null
}

export interface DetailState {
  /** Strategy id -> runs (newest first). */
  runs: Map<string, RunDetail[]>
  failed: Map<string, ApiError>
  pending: number
}

const CONCURRENCY = 4

/**
 * Fetches `/backtest/results/{id}` for every strategy id (the list endpoint only carries a few metrics).
 * Results stream in; `pending` counts what's still outstanding.
 */
export function useBacktestDetails(ids: string[]): DetailState & { refresh: () => void } {
  const { base } = useApiState()
  const key = useMemo(() => [...new Set(ids)].sort().join('|'), [ids])
  const [state, setState] = useState<DetailState>({ runs: new Map(), failed: new Map(), pending: 0 })
  const [tick, setTick] = useState(0)
  const runRef = useRef(0)

  useEffect(() => {
    const list = key ? key.split('|') : []
    const token = ++runRef.current
    const ctl = new AbortController()
    setState({ runs: new Map(), failed: new Map(), pending: list.length })
    if (!list.length || !base) return () => ctl.abort()

    let next = 0
    const worker = async () => {
      while (next < list.length) {
        const id = list[next++]
        try {
          const res = await apiGet<{ results: RunDetail[] }>(`/backtest/results/${encodeURIComponent(id)}`, undefined, { signal: ctl.signal })
          if (runRef.current !== token) return
          setState((s) => ({ ...s, runs: new Map(s.runs).set(id, res.results), pending: s.pending - 1 }))
        } catch (e) {
          if (runRef.current !== token || ctl.signal.aborted) return
          const err = e instanceof ApiError ? e : new ApiError(0, e instanceof Error ? e.message : 'Request failed.')
          setState((s) => ({ ...s, failed: new Map(s.failed).set(id, err), pending: s.pending - 1 }))
        }
      }
    }
    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker))
    return () => ctl.abort()
  }, [key, base, tick])

  return { ...state, refresh: () => setTick((t) => t + 1) }
}
