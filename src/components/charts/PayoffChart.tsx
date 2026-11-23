import { useId } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AXIS, ChartTooltip, GRID } from './chartKit'
import { fmtINR, fmtNum } from '@/lib/format'
import type { Payoff } from '@/lib/positions'

/** Expiry P&L curve; green above zero, red below, with breakeven markers. */
export function PayoffChart({ payoff, spot }: { payoff: Payoff; spot?: number | null }) {
  const id = useId().replace(/:/g, '')
  const vals = payoff.points.map((p) => p.pnl)
  const max = Math.max(...vals, 0)
  const min = Math.min(...vals, 0)
  const split = max === min ? 0.5 : max / (max - min)
  return (
    <div className="chart" style={{ height: 230 }} role="img" aria-label="Payoff at expiry">
      <ResponsiveContainer>
        <AreaChart data={payoff.points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
              <stop offset={0} stopColor="var(--pos)" stopOpacity={0.35} />
              <stop offset={split} stopColor="var(--pos)" stopOpacity={0.05} />
              <stop offset={split} stopColor="var(--neg)" stopOpacity={0.05} />
              <stop offset={1} stopColor="var(--neg)" stopOpacity={0.35} />
            </linearGradient>
            <linearGradient id={`${id}-line`} x1="0" x2="0" y1="0" y2="1">
              <stop offset={split} stopColor="var(--pos)" />
              <stop offset={split} stopColor="var(--neg)" />
            </linearGradient>
          </defs>
          <CartesianGrid {...GRID} />
          <XAxis {...AXIS} dataKey="s" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => fmtNum(Number(v), 0)} tickCount={7} />
          <YAxis {...AXIS} width={64} tickFormatter={(v) => fmtINR(Number(v), { compact: true })} domain={[min * 1.1, max * 1.1 || 1]} />
          <ReferenceLine y={0} stroke="var(--border-strong)" />
          {payoff.breakevens.map((b) => (
            <ReferenceLine key={b} x={b} stroke="var(--warn)" strokeDasharray="4 3" label={{ value: `BE ${fmtNum(b, 0)}`, fill: 'var(--warn)', fontSize: 10, position: 'insideTopRight' }} />
          ))}
          {spot != null && <ReferenceLine x={spot} stroke="var(--accent)" label={{ value: 'Spot', fill: 'var(--accent)', fontSize: 10, position: 'insideTopLeft' }} />}
          <Tooltip
            content={<ChartTooltip title={(l) => `Underlying at expiry ${fmtNum(Number(l), 0)}`} format={(v) => fmtINR(v, { sign: true })} />}
          />
          <Area type="linear" dataKey="pnl" name="P&L" stroke={`url(#${id}-line)`} strokeWidth={2} fill={`url(#${id}-fill)`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
