const BASE_KEY = 'genie-api-base'
const TOKEN_KEY = 'genie-api-key'
const EVENT = 'genie-api-change'

/** Optional build-time default (e.g. `VITE_API_BASE=https://genie.example.com`). The Settings value wins. */
const BUILD_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').trim().replace(/\/+$/, '')

export const getApiBase = () => localStorage.getItem(BASE_KEY) ?? BUILD_BASE
export const getApiKey = () => sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY) ?? ''
export const isKeyRemembered = () => localStorage.getItem(TOKEN_KEY) != null

export function setApiBase(value: string) {
  const v = value.trim().replace(/\/+$/, '')
  if (v) localStorage.setItem(BASE_KEY, v)
  else localStorage.removeItem(BASE_KEY)
  window.dispatchEvent(new Event(EVENT))
}

/** Keys stay in the tab (sessionStorage) unless the user opts to remember them on this device. */
export function setApiKey(value: string, remember: boolean) {
  const v = value.trim()
  sessionStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_KEY)
  if (v) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, v)
  window.dispatchEvent(new Event(EVENT))
}

export const onApiChange = (fn: () => void) => {
  window.addEventListener(EVENT, fn)
  return () => window.removeEventListener(EVENT, fn)
}

export function authHeaders(): Record<string, string> {
  const k = getApiKey()
  if (!k) return {}
  return k.split('.').length === 3 ? { Authorization: `Bearer ${k}` } : { 'X-API-Key': k }
}

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
  get unauthorized() {
    return this.status === 401 || this.status === 403
  }
}

export type Params = Record<string, string | number | boolean | null | undefined>

const API_PREFIX = '/api/v1'

export function buildUrl(base: string, path: string, params?: Params): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params ?? {})) if (v != null && v !== '') qs.set(k, String(v))
  const q = qs.toString()
  return `${base}${API_PREFIX}${path}${q ? `?${q}` : ''}`
}

const NETWORK_MESSAGE = 'Cannot reach the Genie API. It must be served over HTTPS with CORS allowing this site.'

export interface RequestOpts {
  signal?: AbortSignal
  timeoutMs?: number
  base?: string
}

/** FastAPI sends a string `detail` for HTTP errors and a list of `{ loc, msg }` for request-validation failures. */
export function formatApiDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (!Array.isArray(detail)) return ''
  return detail
    .map((item) => {
      if (!item || typeof item !== 'object' || !('msg' in item)) return ''
      const { loc, msg } = item as { loc?: unknown; msg: unknown }
      const field = Array.isArray(loc) ? loc.filter((p) => p !== 'body').join('.') : ''
      return field ? `${field}: ${String(msg)}` : String(msg)
    })
    .filter(Boolean)
    .join('; ')
}

async function request<T>(method: 'GET' | 'POST', path: string, params: Params | undefined, body: unknown, opts: RequestOpts, timeoutMessage: string): Promise<T> {
  const base = opts.base ?? getApiBase()
  if (!base) throw new ApiError(0, 'No API URL configured.')
  const ctl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ctl.abort()
  }, opts.timeoutMs ?? 10000)
  const onAbort = () => ctl.abort()
  opts.signal?.addEventListener('abort', onAbort)
  try {
    const hasBody = body !== undefined
    const res = await fetch(buildUrl(base, path, params), {
      method,
      headers: { Accept: 'application/json', ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...authHeaders() },
      body: hasBody ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    })
    if (!res.ok) {
      let detail = ''
      try {
        detail = formatApiDetail(((await res.json()) as { detail?: unknown }).detail)
      } catch {
        /* non-JSON error body */
      }
      if (res.status === 401 || res.status === 403) throw new ApiError(res.status, detail || 'The API rejected the key. Check it in Settings.')
      throw new ApiError(res.status, detail || `The API answered HTTP ${res.status}.`)
    }
    return (await res.json()) as T
  } catch (e) {
    if (e instanceof ApiError) throw e
    if (opts.signal?.aborted) throw e
    throw new ApiError(0, timedOut ? timeoutMessage : NETWORK_MESSAGE)
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}

/** GET JSON from the Genie API. Throws `ApiError` (status 0 = network/CORS/timeout). */
export function apiGet<T>(path: string, params?: Params, opts: RequestOpts = {}): Promise<T> {
  return request<T>('GET', path, params, undefined, opts, NETWORK_MESSAGE)
}

/**
 * POST a JSON body to the Genie API. Defaults to a 10-minute timeout because backtests simulate months
 * of bars; abort through `opts.signal`, which rethrows the original `AbortError` instead of an `ApiError`.
 */
export function apiPost<T>(path: string, body: unknown, opts: RequestOpts = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 600_000
  const minutes = Math.round(timeoutMs / 60_000)
  const message = minutes >= 1 ? `The API did not answer within ${minutes} min, so the request was stopped.` : 'The API did not answer in time.'
  return request<T>('POST', path, undefined, body, { ...opts, timeoutMs }, message)
}

/** Numbers arrive as numbers or strings (e.g. `/risk/session`); returns null when not numeric. */
export function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
