import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiPost, formatApiDetail } from './client'

const BASE = 'http://genie.test'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** A fetch that never answers on its own and rejects like the browser does once its signal aborts. */
function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }),
  )
}

beforeEach(() => {
  const store = new Map<string, string>([['genie-api-key', 'trader-key']])
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: vi.fn(), removeItem: vi.fn() }
  vi.stubGlobal('sessionStorage', storage)
  vi.stubGlobal('localStorage', { ...storage, getItem: () => null })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('formatApiDetail', () => {
  it('passes string details through', () => {
    expect(formatApiDetail('Strategy not found: x')).toBe('Strategy not found: x')
  })

  it('flattens FastAPI validation errors and drops the body prefix', () => {
    const detail = [
      { loc: ['body', 'strategy_ids'], msg: 'List should have at least 1 item', type: 'too_short' },
      { loc: ['body', 'slippage', 'value'], msg: 'Input should be greater than or equal to 0' },
    ]
    expect(formatApiDetail(detail)).toBe('strategy_ids: List should have at least 1 item; slippage.value: Input should be greater than or equal to 0')
  })

  it('ignores shapes it does not understand', () => {
    expect(formatApiDetail(undefined)).toBe('')
    expect(formatApiDetail({ nope: true })).toBe('')
    expect(formatApiDetail([null, 3])).toBe('')
  })
})

describe('apiPost', () => {
  it('sends the JSON body with the key and returns the parsed response', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiPost('/backtest/strategy-backtest', { strategy_ids: ['a'] }, { base: BASE })).resolves.toEqual({ ok: true })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/v1/backtest/strategy-backtest`)
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"strategy_ids":["a"]}')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json', 'X-API-Key': 'trader-key' })
  })

  it('reports a rejected role as an unauthorized ApiError with the server message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(403, { detail: 'Trader role required' })))
    const err = await apiPost('/x', {}, { base: BASE }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 403, message: 'Trader role required', unauthorized: true })
  })

  it('turns validation errors into a readable message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(422, { detail: [{ loc: ['body', 'period'], msg: 'Unknown range' }] })))
    await expect(apiPost('/x', {}, { base: BASE })).rejects.toMatchObject({ status: 422, message: 'period: Unknown range' })
  })

  it('stops waiting after the timeout with a specific message', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    await expect(apiPost('/x', {}, { base: BASE, timeoutMs: 10 })).rejects.toMatchObject({ status: 0, message: 'The API did not answer in time.' })
  })

  it('rethrows the AbortError when the caller cancels', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const ctl = new AbortController()
    const pending = apiPost('/x', {}, { base: BASE, signal: ctl.signal })
    ctl.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
