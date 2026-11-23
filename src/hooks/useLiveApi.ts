import { useEffect, useState } from 'react'

const KEY = 'genie-api-base'
const EVENT = 'genie-api-change'

export type LiveState = 'off' | 'checking' | 'up' | 'down'

export const getApiBase = () => localStorage.getItem(KEY) ?? ''

export function setApiBase(value: string) {
  const v = value.trim().replace(/\/+$/, '')
  if (v) localStorage.setItem(KEY, v)
  else localStorage.removeItem(KEY)
  window.dispatchEvent(new Event(EVENT))
}

/**
 * Optional liveness probe against a running Genie API (`GET /api/v1/health/live`).
 * The dashboard itself is a static snapshot, so this only drives a status pill.
 * Note: an https:// Pages site cannot call a plain http:// API (mixed content) and the API must allow this origin via CORS.
 */
export function useLiveApi(): { base: string; state: LiveState } {
  const [base, setBase] = useState(getApiBase)
  const [state, setState] = useState<LiveState>(base ? 'checking' : 'off')

  useEffect(() => {
    const onChange = () => setBase(getApiBase())
    window.addEventListener(EVENT, onChange)
    return () => window.removeEventListener(EVENT, onChange)
  }, [])

  useEffect(() => {
    if (!base) {
      setState('off')
      return
    }
    let alive = true
    const ping = async () => {
      try {
        const ctl = new AbortController()
        const timer = setTimeout(() => ctl.abort(), 6000)
        const res = await fetch(`${base}/api/v1/health/live`, { signal: ctl.signal })
        clearTimeout(timer)
        if (alive) setState(res.ok ? 'up' : 'down')
      } catch {
        if (alive) setState('down')
      }
    }
    setState('checking')
    void ping()
    const id = setInterval(ping, 30000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [base])

  return { base, state }
}
