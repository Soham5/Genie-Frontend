import type { ReactNode } from 'react'
import { AlertOctagon, AlertTriangle, Info, XOctagon } from 'lucide-react'
import { useDay, useSelectedDate } from '@/data/store'
import type { DayDetail, DayStatus, FeedEvent, Level } from '@/types'
import { prettyEvent } from '@/lib/format'
import { Badge, Callout, Skeleton } from './Panel'

/** Renders children once the selected day's detail file has loaded. */
export function DayGate({ children }: { children: (day: DayDetail, date: string) => ReactNode }) {
  const [date] = useSelectedDate()
  const { day, error } = useDay(date)
  if (error) return <Callout tone="neg" title="Couldn't load this session.">{error}</Callout>
  if (!day) {
    return (
      <div className="stack" aria-busy="true">
        <Skeleton height={96} />
        <Skeleton height={320} />
      </div>
    )
  }
  return <>{children(day, date)}</>
}

export const LEVEL_TONE: Record<Level, 'muted' | 'warn' | 'neg'> = { info: 'muted', warning: 'warn', error: 'neg', critical: 'neg' }

/** Kite-style BUY (blue) / SELL (red) chip. */
export function SideChip({ side }: { side: string | null | undefined }) {
  if (side !== 'BUY' && side !== 'SELL') return <span className="muted">—</span>
  return <span className={`side side--${side.toLowerCase()}`}>{side}</span>
}

export function LevelIcon({ level }: { level: Level }) {
  if (level === 'critical') return <XOctagon size={14} color="var(--neg)" aria-label="critical" />
  if (level === 'error') return <AlertOctagon size={14} color="var(--neg)" aria-label="error" />
  if (level === 'warning') return <AlertTriangle size={14} color="var(--warn)" aria-label="warning" />
  return <Info size={14} color="var(--faint)" aria-label="info" />
}

export function StatusBadge({ status }: { status: DayStatus }) {
  const tone = { healthy: 'pos', degraded: 'warn', incident: 'neg', idle: 'muted' }[status] as 'pos' | 'warn' | 'neg' | 'muted'
  const label = { healthy: 'Healthy', degraded: 'Degraded', incident: 'Incident', idle: 'No session' }[status]
  return <Badge tone={tone} dot>{label}</Badge>
}

export function FeedList({ events }: { events: FeedEvent[] }) {
  return (
    <div className="feed" role="list">
      {events.map((e, i) => (
        <div className="feed__row" key={`${e.t}-${e.event}-${i}`} role="listitem">
          <span className="num muted">{e.t.slice(0, 8)}</span>
          <LevelIcon level={e.level} />
          <span className="feed__event">{prettyEvent(e.event)}</span>
          <span className="feed__msg">{e.msg || <span className="muted">{e.component}</span>}</span>
        </div>
      ))}
    </div>
  )
}
