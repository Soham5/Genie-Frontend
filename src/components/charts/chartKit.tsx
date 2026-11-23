import type { ReactNode } from 'react'

export const AXIS = {
  stroke: 'var(--border-strong)',
  tick: { fill: 'var(--muted)', fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: 'var(--border)' },
} as const

export const GRID = { stroke: 'var(--grid)', strokeDasharray: '3 3', vertical: false } as const

export const COLORS = {
  pos: 'var(--pos)',
  neg: 'var(--neg)',
  warn: 'var(--warn)',
  accent: 'var(--accent)',
  info: 'var(--info)',
  violet: 'var(--violet)',
  muted: 'var(--faint)',
}

interface TipEntry {
  name?: string | number
  value?: number | string
  color?: string
  dataKey?: string | number
  payload?: Record<string, unknown>
}

export function ChartTooltip({ active, payload, label, format, title }: {
  active?: boolean
  payload?: TipEntry[]
  label?: string | number
  format?: (value: number, name: string, entry: TipEntry) => ReactNode
  title?: (label: string | number | undefined, payload: TipEntry[]) => ReactNode
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tip">
      <div className="chart-tip__title">{title ? title(label, payload) : label}</div>
      {payload.map((p, i) => (
        <div key={`${p.dataKey}-${i}`} className="chart-tip__row">
          <span>
            <i style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="num">{format ? format(Number(p.value), String(p.name), p) : String(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          <i style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}
