import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Empty, Panel, Seg } from '@/components/ui/Panel'
import { AXIS, COLORS, ChartTooltip, GRID } from '@/components/charts/chartKit'
import { fmtINR, pnlTone } from '@/lib/format'
import { clsx } from '@/lib/clsx'
import { TOP_OPTIONS, extremeDays, fmtIsoDay, fmtIsoShort, niceAxis, topLimit, type DayRow, type TopN } from '@/lib/strategyBacktest'

export function ExtremeDaysPanel({ daily }: { daily: DayRow[] }) {
  const [top, setTop] = useState<TopN>('10')
  const { days, avgProfit, avgLoss } = useMemo(() => extremeDays(daily, topLimit(top)), [daily, top])
  const axis = useMemo(() => niceAxis(days.map((d) => d.pnl)), [days])

  // A dotted marker at the first bar of each new calendar year keeps long ranges readable.
  const yearStarts = useMemo(() => days.filter((d, i) => i > 0 && d.date.slice(0, 4) !== days[i - 1].date.slice(0, 4)).map((d) => d.date), [days])

  return (
    <Panel
      title="Max Profit and Loss"
      sub={
        <span className="num">
          Avg Profit: <span className={clsx(pnlTone(avgProfit))}>{avgProfit == null ? '—' : fmtINR(avgProfit, { decimals: true })}</span>
          {' | '}
          Avg Loss: <span className={clsx(pnlTone(avgLoss))}>{avgLoss == null ? '—' : fmtINR(avgLoss, { decimals: true })}</span>
        </span>
      }
      actions={<Seg label="Number of days" value={top} onChange={setTop} options={TOP_OPTIONS} />}
    >
      {days.length === 0 ? (
        <Empty title="No winning or losing days">Every trading day in this range finished flat.</Empty>
      ) : (
        <div className="chart sb-chart" style={{ height: 300 }} role="img" aria-label={`Best and worst trading days, ${days.length} bars in date order`}>
          <ResponsiveContainer>
            <BarChart data={days} margin={{ top: 14, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="date" {...AXIS} tickFormatter={fmtIsoShort} minTickGap={14} />
              <YAxis {...AXIS} width={64} domain={axis.domain} ticks={axis.ticks} tickFormatter={(v: number) => fmtINR(v, { compact: true })} />
              <ReferenceLine y={0} stroke="var(--border-strong)" />
              {yearStarts.map((date) => (
                <ReferenceLine key={date} x={date} stroke="var(--faint)" strokeDasharray="3 4" label={{ value: date.slice(0, 4), position: 'insideTopLeft', fill: 'var(--muted)', fontSize: 11 }} />
              ))}
              <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip format={(v) => fmtINR(v, { sign: true, decimals: true })} title={(label) => fmtIsoDay(String(label))} />} />
              <Bar dataKey="pnl" name="P&L" maxBarSize={days.length > 40 ? 12 : 26} isAnimationActive={false}>
                {days.map((d) => (
                  <Cell key={d.date} fill={d.pnl >= 0 ? COLORS.pos : COLORS.neg} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  )
}
