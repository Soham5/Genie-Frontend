import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getApiBase, onApiChange } from './client'
import type { HealthPayload, KillStatus, RunnerStatus } from './types'
import { useApi } from './useApi'

export type ApiStatus = 'unconfigured' | 'connecting' | 'online' | 'unauthorized' | 'offline'

interface ApiState {
  base: string
  status: ApiStatus
  /** Human-readable reason when status is `offline` or `unauthorized`. */
  error: string | null
  health: HealthPayload | null
  kill: KillStatus | null
  runner: RunnerStatus | null
  refresh: () => void
}

const Ctx = createContext<ApiState>({ base: '', status: 'unconfigured', error: null, health: null, kill: null, runner: null, refresh: () => undefined })

const POLL_MS = 10000

/** Connection status plus the few payloads every screen shows: `/health`, `/kill/status`, `/papertrade/runner`. */
export function ApiProvider({ children }: { children: ReactNode }) {
  const [base, setBase] = useState(getApiBase)
  useEffect(() => onApiChange(() => setBase(getApiBase())), [])

  const enabled = Boolean(base)
  const health = useApi<HealthPayload>('/health', { poll: POLL_MS, enabled })
  const kill = useApi<KillStatus>('/kill/status', { poll: POLL_MS, enabled })
  // The only authenticated probe: /health and /kill/status are public.
  const runner = useApi<RunnerStatus>('/papertrade/runner', { poll: POLL_MS, enabled })

  const value = useMemo<ApiState>(() => {
    let status: ApiStatus
    let error: string | null = null
    if (!base) status = 'unconfigured'
    else if (runner.error?.unauthorized) {
      status = 'unauthorized'
      error = runner.error.message
    } else if (health.error?.status === 0 || (health.error && !health.data)) {
      status = 'offline'
      error = health.error.message
    } else if (health.data || runner.data) status = 'online'
    else status = health.loading || runner.loading ? 'connecting' : 'offline'
    return {
      base,
      status,
      error,
      health: health.data,
      kill: kill.data,
      runner: runner.data,
      refresh: () => {
        health.refresh()
        kill.refresh()
        runner.refresh()
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, health.data, health.error, health.loading, kill.data, runner.data, runner.error, runner.loading])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useApiState = () => useContext(Ctx)
