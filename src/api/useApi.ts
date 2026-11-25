import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, apiGet, getApiBase, onApiChange, type Params } from './client'

export interface ApiResult<T> {
  data: T | null
  error: ApiError | null
  /** True until the first response (or error) arrives. */
  loading: boolean
  updatedAt: Date | null
  refresh: () => void
}

export interface UseApiOptions {
  params?: Params
  /** Re-fetch every `poll` ms while the tab is visible. */
  poll?: number
  enabled?: boolean
}

/**
 * GET a Genie API path, optionally polling. Keeps the last good `data` when a refresh fails so
 * screens don't blank out on a blip; `error` is cleared by the next success.
 */
export function useApi<T>(path: string, { params, poll, enabled = true }: UseApiOptions = {}): ApiResult<T> {
  const [base, setBase] = useState(getApiBase)
  const [state, setState] = useState<{ data: T | null; error: ApiError | null; loading: boolean; updatedAt: Date | null }>({
    data: null,
    error: null,
    loading: true,
    updatedAt: null,
  })
  const [tick, setTick] = useState(0)
  const paramKey = JSON.stringify(params ?? {})
  const keyRef = useRef('')

  useEffect(() => onApiChange(() => setBase(getApiBase())), [])

  useEffect(() => {
    const key = `${base}|${path}|${paramKey}`
    const changed = keyRef.current !== key
    keyRef.current = key
    if (!enabled || !base) {
      setState({ data: null, error: null, loading: false, updatedAt: null })
      return
    }
    if (changed) setState({ data: null, error: null, loading: true, updatedAt: null })

    let alive = true
    let ctl: AbortController | null = null
    const run = async () => {
      if (document.visibilityState === 'hidden') return
      ctl?.abort()
      ctl = new AbortController()
      try {
        const data = await apiGet<T>(path, JSON.parse(paramKey) as Params, { signal: ctl.signal })
        if (alive) setState({ data, error: null, loading: false, updatedAt: new Date() })
      } catch (e) {
        if (!alive || (e instanceof DOMException && e.name === 'AbortError')) return
        const err = e instanceof ApiError ? e : new ApiError(0, e instanceof Error ? e.message : 'Request failed.')
        setState((s) => ({ ...s, error: err, loading: false }))
      }
    }
    void run()
    const id = poll ? setInterval(run, poll) : null
    const onVisible = () => {
      if (document.visibilityState === 'visible' && poll) void run()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      ctl?.abort()
      if (id) clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [base, path, paramKey, poll, enabled, tick])

  const refresh = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, refresh }
}
