import type { ReactNode } from 'react'
import { Download, LoaderCircle, Play, X } from 'lucide-react'
import { ActionMenu, MultiSelect, type MenuItem, type MultiOption } from '@/components/ui/Dropdown'
import { Callout, InfoTip, Panel, Seg } from '@/components/ui/Panel'
import { prettyStrategy } from '@/lib/format'
import {
  MAX_STRATEGIES,
  RANGE_OPTIONS,
  SLIPPAGE_OPTIONS,
  defaultCustomRange,
  localIsoDate,
  parseAmount,
  type BacktestForm,
  type SlippageMode,
} from '@/lib/strategyBacktest'

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="sb-field">
      <div className="sb-field__label">
        {label}
        {help && <InfoTip text={help} />}
      </div>
      <div className="sb-field__ctl">{children}</div>
    </div>
  )
}

const SLIPPAGE_NOTE: Record<SlippageMode, string> = {
  default: 'Uses the engine’s configured slippage and spread for each segment.',
  none: 'Every fill happens at the signal price.',
  percent: '% of the price, charged on every fill.',
  points: 'Price points per unit, charged on every fill.',
}

export function ConfigPanel({ form, onChange, options, optionsLoading, optionsFailed, running, onRun, downloads, errors }: {
  form: BacktestForm
  onChange: (patch: Partial<BacktestForm>) => void
  options: MultiOption[]
  optionsLoading: boolean
  optionsFailed: boolean
  running: boolean
  onRun: () => void
  downloads: MenuItem[]
  errors: string[]
}) {
  const today = localIsoDate()
  const needsValue = form.slippage === 'percent' || form.slippage === 'points'
  const capital = parseAmount(form.initialCapital)

  return (
    <Panel
      title="Choose Strategies to Backtest"
      sub="Pick one or more of your strategies, select a time range, and run a backtest to view performance."
      className="sb-config"
    >
      <form
        className="sb-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          onRun()
        }}
      >
        <Field label="Strategies">
          <MultiSelect
            label="Strategies"
            placeholder="Select strategies"
            options={options}
            value={form.strategyIds}
            onChange={(strategyIds) => onChange({ strategyIds })}
            max={MAX_STRATEGIES}
            loading={optionsLoading}
            emptyText={optionsFailed ? 'The strategy list couldn’t be loaded.' : 'No strategies are registered.'}
          />
          {form.strategyIds.length > 0 && (
            <div className="sb-chips">
              {form.strategyIds.map((id) => (
                <span className="sb-chip" key={id} title={id}>
                  {prettyStrategy(id)}
                  <button type="button" aria-label={`Remove ${prettyStrategy(id)}`} onClick={() => onChange({ strategyIds: form.strategyIds.filter((x) => x !== id) })}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="sb-note">Up to {MAX_STRATEGIES} strategies per run. Results are combined into one portfolio.</p>
        </Field>

        <Field label="Time Range">
          <Seg
            label="Time range"
            value={form.range}
            options={RANGE_OPTIONS}
            onChange={(range) => {
              const needsDates = range === 'custom' && (!form.startDate || !form.endDate)
              onChange({ range, ...(needsDates ? defaultCustomRange(today) : {}) })
            }}
          />
          {form.range === 'custom' && (
            <div className="sb-line">
              <label className="sb-inline">
                From
                <input className="input num" type="date" value={form.startDate} max={form.endDate || today} onChange={(e) => onChange({ startDate: e.target.value })} />
              </label>
              <label className="sb-inline">
                To
                <input className="input num" type="date" value={form.endDate} min={form.startDate || undefined} max={today} onChange={(e) => onChange({ endDate: e.target.value })} />
              </label>
            </div>
          )}
          {form.range !== 'custom' && <p className="sb-note">Ends yesterday, so every day in the range has a full session.</p>}
        </Field>

        <Field label="Slippage" help="Cost of getting filled away from the signal price. Applied on entry and on exit, per unit traded.">
          <div className="sb-line">
            <Seg label="Slippage" value={form.slippage} options={SLIPPAGE_OPTIONS} onChange={(slippage) => onChange({ slippage })} />
            <input
              className="input num sb-value"
              inputMode="decimal"
              aria-label="Slippage value"
              placeholder={needsValue ? 'Value' : '—'}
              disabled={!needsValue}
              value={needsValue ? form.slippageValue : ''}
              onChange={(e) => onChange({ slippageValue: e.target.value })}
            />
          </div>
          <p className="sb-note">{SLIPPAGE_NOTE[form.slippage]}</p>
        </Field>

        <Field label="Initial Capital" help="Starting capital for each strategy. A positive amount turns on capital-aware position sizing; leave it empty for the engine’s fixed-size simulation.">
          <div className="sb-line">
            <span className="muted">₹</span>
            <input
              className="input num sb-value sb-value--wide"
              inputMode="decimal"
              aria-label="Initial capital"
              placeholder="0 (fixed size)"
              value={form.initialCapital}
              onChange={(e) => onChange({ initialCapital: e.target.value })}
            />
            {capital != null && capital > 0 && (
              <label className="sb-check">
                <input type="checkbox" checked={form.riskStack} onChange={(e) => onChange({ riskStack: e.target.checked })} />
                Apply risk controls
              </label>
            )}
          </div>
          <p className="sb-note">Applied to each strategy separately, not shared across them.</p>
        </Field>

        {errors.length > 0 && (
          <Callout tone="warn" title="Check the form.">
            {errors.join(' ')}
          </Callout>
        )}

        <div className="sb-actions">
          <div className="sb-actions__note">Dry run: nothing is saved and no strategy status changes.</div>
          <div className="row">
            <ActionMenu label="Download Trades" icon={<Download size={14} />} items={downloads} disabled={downloads.every((d) => d.disabled)} align="right" />
            <button type="submit" className="btn btn--primary" disabled={running || form.strategyIds.length === 0}>
              {running ? <LoaderCircle size={14} className="sb-spin" /> : <Play size={14} />}
              {running ? 'Running…' : 'Run Backtest'}
            </button>
          </div>
        </div>
      </form>
    </Panel>
  )
}
