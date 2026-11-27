import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Empty, Panel } from '@/components/ui/Panel'
import { AXIS, COLORS, GRID } from '@/components/charts/chartKit'
import { fmtINR, pnlTone } from '@/lib/format'
import { clsx } from '@/lib/clsx'
import { describeSlippage, fmtIsoDay, fmtIsoTick, niceAxis, type DayRow, type StrategyBacktestResponse } from '@/lib/strategyBacktest'

function EquityTip({ active, payload }: { active?: boolean; payload?: { payload?: DayRow }[] }) {
  const d = payload?.[0]?.payload
  if (!active || !d) return null
  const row = (label: string, value: string, tone?: string) => (
    <div className="chart-tip__row">
      <span>{label}</span>
      <span className={clsx('num', tone)}>{value}</span>
    </div>
  )
  return (
    <div className="chart-tip">
      <div className="chart-tip__title">{fmtIsoDay(d.date)}</div>
      {row('Cumulative', fmtINR(d.cumulative_pnl, { sign: true, decimals: true }), pnlTone(d.cumulative_pnl))}
      {row('Day P&L', fmtINR(d.pnl, { sign: true, decimals: true }), pnlTone(d.pnl))}
      {row('Drawdown', fmtINR(d.drawdown, { decimals: true }), d.drawdown < 0 ? 'neg' : undefined)}
      {row('Trades', String(d.trades))}
    </div>
  )
}

function echo(report: StrategyBacktestResponse): string {
  const { request, strategies, elapsed_seconds } = report
  const capital = request.initial_capital > 0 ? `${fmtINR(request.initial_capital)} capital per strategy${request.risk_stack_enabled ? ' with risk controls' : ''}` : 'fixed-size simulation'
  const n = strategies.length
  return [
    `${fmtIsoDay(request.start_date)} → ${fmtIsoDay(request.end_date)}`,
    `${n} ${n === 1 ? 'strategy' : 'strategies'}`,
    describeSlippage(request.slippage),
    capital,
    `took ${elapsed_seconds}s`,
  ].join(' · ')
}

export function EquityPanel({ report }: { report: StrategyBacktestResponse }) {
  const { summary, daily } = report
  const peak = summary.max_drawdown_peak_date
  const trough = summary.max_drawdown_trough_date
  const dates = new Set(daily.map((d) => d.date))
  const shade = summary.max_drawdown > 0 && peak != null && trough != null && dates.has(peak) && dates.has(trough)
  const axis = useMemo(() => niceAxis(daily.map((d) => d.cumulative_pnl)), [daily])

  return (
    <Panel title="Backtest Results" sub={echo(report)} className="sb-equity-panel">
      <div className="sb-headline">
        <div>
          <span className="sb-headline__label">P&amp;L</span>
          <strong className={clsx('sb-headline__value num', pnlTone(summary.net_pnl))}>{fmtINR(summary.net_pnl, { decimals: true })}</strong>
        </div>
        <div>
          <span className="sb-headline__label">Max. Draw down</span>
          <strong className={clsx('sb-headline__value num', summary.max_drawdown > 0 ? 'neg' : 'flat')}>{fmtINR(-summary.max_drawdown, { decimals: true })}</strong>
        </div>
      </div>
      <p className="sb-costs num">
        Net of costs. Gross {fmtINR(summary.gross_pnl, { decimals: true })} · slippage {fmtINR(summary.total_slippage, { decimals: true })} · brokerage {fmtINR(summary.total_brokerage, { decimals: true })}
      </p>
      {daily.length === 0 ? (
        <Empty title="No trades in this range">The strategies produced no closed trades between these dates. Try a longer range, or check the warnings above.</Empty>
      ) : daily.length < 2 ? (
        <Empty title="Only one trading day">There is not enough history to draw an equity curve.</Empty>
      ) : (
        <div className="chart sb-chart" style={{ height: 320 }} role="img" aria-label={`Cumulative net P&L over ${daily.length} trading days`}>
          <ResponsiveContainer>
            <AreaChart data={daily} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="sbEquity" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.info} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={COLORS.info} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="date" {...AXIS} tickFormatter={fmtIsoTick} minTickGap={52} />
              <YAxis {...AXIS} width={64} domain={axis.domain} ticks={axis.ticks} tickFormatter={(v: number) => fmtINR(v, { compact: true })} />
              <ReferenceLine y={0} stroke="var(--border-strong)" />
              {shade && <ReferenceArea x1={peak} x2={trough} fill={COLORS.neg} fillOpacity={0.09} stroke="none" ifOverflow="hidden" />}
              <Tooltip content={<EquityTip />} />
              <Area type="monotone" dataKey="cumulative_pnl" name="Cumulative P&L" stroke={COLORS.info} strokeWidth={1.8} fill="url(#sbEquity)" baseValue={0} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {shade && (
        <p className="sb-note" style={{ marginTop: 8 }}>
          The shaded band marks the deepest drawdown: from the peak on {fmtIsoDay(peak)} to the low on {fmtIsoDay(trough)}.
        </p>
      )}
    </Panel>
  )
}
