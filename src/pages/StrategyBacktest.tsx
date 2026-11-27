import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FileSpreadsheet, LoaderCircle, Square } from 'lucide-react'
import { ApiError, apiPost } from '@/api/client'
import { useApi } from '@/api/useApi'
import { useApiState } from '@/api/ApiProvider'
import { ApiErrorNote } from '@/components/ui/ApiErrorNote'
import type { MenuItem, MultiOption } from '@/components/ui/Dropdown'
import { Callout, Empty, Panel } from '@/components/ui/Panel'
import { downloadText } from '@/lib/download'
import { prettyStrategy } from '@/lib/format'
import {
  DEFAULT_FORM,
  MAX_STRATEGIES,
  buildRequest,
  csvFilename,
  dailyToCsv,
  localIsoDate,
  tradesToCsv,
  type BacktestForm,
  type StrategyBacktestResponse,
} from '@/lib/strategyBacktest'
import { CalendarPanel } from './backtest/CalendarPanel'
import { ConfigPanel } from './backtest/ConfigPanel'
import { EquityPanel } from './backtest/EquityPanel'
import { ExtremeDaysPanel } from './backtest/ExtremeDaysPanel'
import { StrategyTable } from './backtest/StrategyTable'
import { SummaryCards } from './backtest/SummaryCards'
import { TransactionsPanel } from './backtest/TransactionsPanel'
import type { StrategyCfg } from './StrategyDrawer'
import './StrategyBacktest.css'

interface StrategiesPayload {
  count: number
  strategies: Record<string, StrategyCfg>
}

type RunState =
  | { kind: 'idle' }
  | { kind: 'running'; count: number }
  | { kind: 'error'; error: ApiError }
  | { kind: 'done'; report: StrategyBacktestResponse }

/** Strategy ids handed over by another page through router state (query strings are carried between pages by the navbar). */
function preselected(state: unknown): string[] {
  const ids = (state as { strategies?: unknown } | null)?.strategies
  return Array.isArray(ids) ? ids.filter((s): s is string => typeof s === 'string').slice(0, MAX_STRATEGIES) : []
}

/** Server details are sometimes bare fragments; this keeps them readable when more text follows. */
const sentence = (text: string) => {
  const t = text.trim()
  return /[.!?…]$/.test(t) ? t : `${t}.`
}

function describeRunError(error: ApiError): { tone: 'warn' | 'neg'; title: string; body: string } {
  switch (error.status) {
    case 401:
      return { tone: 'warn', title: 'The API rejected the key.', body: sentence(error.message) }
    case 403:
      return { tone: 'warn', title: 'This key can’t run backtests.', body: `Backtests need an API key with the trader role. ${sentence(error.message)}` }
    case 404:
      return { tone: 'warn', title: 'A selected strategy no longer exists.', body: error.message }
    case 422:
      return { tone: 'warn', title: 'The API rejected the request.', body: error.message }
    case 429:
      return { tone: 'warn', title: 'Too many requests.', body: `Wait a moment before running another backtest. ${sentence(error.message)}` }
    default:
      return { tone: 'neg', title: error.status === 0 ? 'Couldn’t get a result.' : 'The backtest failed.', body: error.message }
  }
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function RunningPanel({ count, onCancel }: { count: number; onCancel: () => void }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const started = Date.now()
    const id = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500)
    return () => window.clearInterval(id)
  }, [])

  return (
    <Panel className="sb-scroll-target" title="Running backtest">
      <div className="sb-running" role="status" aria-live="polite">
        <LoaderCircle size={26} className="sb-spin" />
        <div className="grow">
          <strong>
            Simulating {count} {count === 1 ? 'strategy' : 'strategies'}…
          </strong>
          <p className="muted">Every trading day is replayed bar by bar, so long ranges and many strategies can take a few minutes.</p>
        </div>
        <span className="num muted" aria-label="Elapsed time">{clock(seconds)}</span>
        <button type="button" className="btn" onClick={onCancel}>
          <Square size={13} /> Cancel
        </button>
      </div>
      <p className="sb-note">Cancelling only stops waiting for the answer; the server may still finish the run.</p>
    </Panel>
  )
}

export default function StrategyBacktest({ onRunningChange }: { onRunningChange?: (running: boolean) => void }) {
  const api = useApiState()
  const loc = useLocation()
  const strategies = useApi<StrategiesPayload>('/strategies', { enabled: api.status !== 'unconfigured' })

  const [form, setForm] = useState<BacktestForm>(() => ({ ...DEFAULT_FORM, strategyIds: preselected(loc.state) }))
  const [errors, setErrors] = useState<string[]>([])
  const [run, setRun] = useState<RunState>({ kind: 'idle' })
  const inflight = useRef<AbortController | null>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => inflight.current?.abort(), [])

  const running = run.kind === 'running'
  useEffect(() => {
    onRunningChange?.(running)
  }, [running, onRunningChange])

  const report = run.kind === 'done' ? run.report : null
  useEffect(() => {
    if (report) resultsRef.current?.scrollIntoView({ block: 'start' })
  }, [report])

  const options = useMemo<MultiOption[]>(
    () =>
      Object.entries(strategies.data?.strategies ?? {})
        .map(([id, cfg]) => ({
          value: id,
          label: (
            <>
              <strong>{prettyStrategy(id)}</strong>
              <span className="mono muted dd__sub">{id}</span>
            </>
          ),
          hint: [cfg.segment, cfg.timeframe].filter(Boolean).join(' · '),
          search: `${id} ${prettyStrategy(id)} ${cfg.class_name} ${cfg.segment}`.toLowerCase(),
          name: prettyStrategy(id),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(({ name: _name, ...option }) => option),
    [strategies.data],
  )

  const patch = useCallback((p: Partial<BacktestForm>) => {
    setForm((f) => ({ ...f, ...p }))
    setErrors([])
  }, [])

  const start = useCallback(async () => {
    if (inflight.current) return
    const built = buildRequest(form, localIsoDate())
    if (!built.ok) {
      setErrors(built.errors)
      return
    }
    setErrors([])
    const ctl = new AbortController()
    inflight.current = ctl
    setRun({ kind: 'running', count: built.request.strategy_ids.length })
    try {
      const result = await apiPost<StrategyBacktestResponse>('/backtest/strategy-backtest', built.request, { signal: ctl.signal })
      if (inflight.current !== ctl) return
      inflight.current = null
      setRun({ kind: 'done', report: result })
    } catch (e) {
      if (inflight.current !== ctl) return
      inflight.current = null
      setRun({ kind: 'error', error: e instanceof ApiError ? e : new ApiError(0, e instanceof Error ? e.message : 'The request failed.') })
    }
  }, [form])

  const cancel = useCallback(() => {
    inflight.current?.abort()
    inflight.current = null
    setRun({ kind: 'idle' })
  }, [])

  const downloads = useMemo<MenuItem[]>(
    () => [
      {
        label: 'All trades (CSV)',
        icon: <FileSpreadsheet size={14} />,
        disabled: !report?.trades.length,
        onSelect: () => report && downloadText(csvFilename('trades', report.request), tradesToCsv(report.trades)),
      },
      {
        label: 'Daily P&L (CSV)',
        icon: <FileSpreadsheet size={14} />,
        disabled: !report?.daily.length,
        onSelect: () => report && downloadText(csvFilename('daily-pnl', report.request), dailyToCsv(report.daily)),
      },
    ],
    [report],
  )

  const failure = run.kind === 'error' ? describeRunError(run.error) : null

  return (
    <div className="stack sb-root">
      {strategies.error && <ApiErrorNote error={strategies.error} what="the strategy list" />}

      <ConfigPanel
        form={form}
        onChange={patch}
        options={options}
        optionsLoading={strategies.loading}
        optionsFailed={Boolean(strategies.error)}
        running={running}
        onRun={() => void start()}
        downloads={downloads}
        errors={errors}
      />

      {run.kind === 'idle' && (
        <Panel title="Backtest Results">
          <Empty title="Click Run Backtest to view results">Your equity curve, daily breakdown and every simulated trade will appear here.</Empty>
        </Panel>
      )}

      {run.kind === 'running' && <RunningPanel count={run.count} onCancel={cancel} />}

      {failure && (
        <div className="sb-scroll-target" ref={resultsRef}>
          <Callout tone={failure.tone} title={failure.title}>
            {failure.body}{' '}
            {(run.kind === 'error' && (run.error.status === 401 || run.error.status === 403)) && (
              <>
                Update the key in <Link className="link-btn" to="/settings">Settings</Link>.
              </>
            )}
          </Callout>
        </div>
      )}

      {report && (
        <div className="stack sb-results sb-scroll-target" ref={resultsRef}>
          {report.warnings.length > 0 && (
            <Callout tone="warn" title={report.warnings.length === 1 ? 'Heads up.' : `${report.warnings.length} things to check.`}>
              <ul className="sb-warnings">
                {report.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Callout>
          )}
          <EquityPanel report={report} />
          {report.trades.length > 0 && <SummaryCards summary={report.summary} />}
          <StrategyTable report={report} />
          {report.trades.length > 0 && (
            <>
              <ExtremeDaysPanel daily={report.daily} />
              <CalendarPanel daily={report.daily} />
              <TransactionsPanel report={report} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
