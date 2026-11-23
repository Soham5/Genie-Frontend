import type { ReactNode } from 'react'
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts'
import { InfoTip } from './Panel'
import { clsx } from '@/lib/clsx'

export function Stat({ label, value, foot, tone, spark, sparkTone, help, accent, className }: {
  label: string
  value: ReactNode
  foot?: ReactNode
  tone?: 'pos' | 'neg' | 'flat' | 'warn'
  spark?: number[]
  sparkTone?: 'pos' | 'neg' | 'accent'
  help?: string
  accent?: 'pos' | 'neg' | 'warn'
  className?: string
}) {
  const color = { pos: 'var(--pos)', neg: 'var(--neg)', accent: 'var(--accent)' }[sparkTone ?? 'accent']
  const id = `sp-${label.replace(/\W/g, '')}`
  return (
    <div className={clsx('stat', accent && `stat--accent-${accent}`, className)}>
      <div className="stat__label">
        {label}
        {help && <InfoTip text={help} />}
      </div>
      <div className={clsx('stat__value num', tone)}>{value}</div>
      <div className="stat__foot">{foot}</div>
      {spark && spark.length > 2 && (
        <div className="stat__spark" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark.map((v, i) => ({ i, v }))} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${id})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
