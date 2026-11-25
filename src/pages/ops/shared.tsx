import type { ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { ApiError } from '@/api/client'
import type { ApiResult } from '@/api/useApi'
import { Callout, InfoTip, Skeleton } from '@/components/ui/Panel'
import { clsx } from '@/lib/clsx'

const IST = 'Asia/Kolkata'
const HAS_TZ = /(Z|[+-]\d{2}:?\d{2})$/

/** Parses API timestamps; Python's `str(datetime)` uses a space separator. Returns null when it has no UTC offset (ambiguous). */
export function parseStamp(s: string | null | undefined): Date | null {
  if (!s) return null
  const iso = s.trim().replace(' ', 'T')
  if (!HAS_TZ.test(iso)) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** `31 Jul, 09:15:00` in IST. Timestamps without an offset are shown verbatim rather than guessing a zone. */
export function fmtStamp(s: string | null | undefined, opts: { date?: boolean } = {}): string {
  if (!s) return '—'
  const d = parseStamp(s)
  if (!d) return s.replace('T', ' ').replace(/\.\d+/, '')
  const time = d.toLocaleTimeString('en-GB', { timeZone: IST, hour12: false })
  if (opts.date === false) return time
  const day = d.toLocaleDateString('en-GB', { timeZone: IST, day: '2-digit', month: 'short' })
  return `${day}, ${time}`
}

/** "in 5 min" / "3 h ago" relative to now. */
export function fmtRel(s: string | null | undefined, now = Date.now()): string {
  const d = parseStamp(s)
  if (!d) return ''
  const diff = Math.round((d.getTime() - now) / 1000)
  const abs = Math.abs(diff)
  const body = abs < 60 ? `${abs}s` : abs < 5400 ? `${Math.round(abs / 60)} min` : abs < 129600 ? `${Math.round(abs / 3600)} h` : `${Math.round(abs / 86400)} d`
  return diff >= 0 ? `in ${body}` : `${body} ago`
}

/** Compact clock for "updated" stamps. */
export const clock = (d: Date | null) => (d ? d.toLocaleTimeString('en-GB', { timeZone: IST, hour12: false }) : '—')

/** Honest failure note: a 403 means the key's role is not allowed to read this resource, not that something broke. */
export function ApiNote({ error, what }: { error: ApiError; what: string }) {
  if (error.status === 403) {
    return <Callout tone="info" title="Not permitted.">This API key&apos;s role can&apos;t read {what}. Use a key with the trader role to see it.</Callout>
  }
  if (error.status === 401) return <Callout tone="warn" title="Key rejected.">{error.message}</Callout>
  if (error.status === 404) return <Callout tone="warn" title="Not available.">{what} isn&apos;t exposed by this API version.</Callout>
  return <Callout tone="neg" title={`Couldn't load ${what}.`}>{error.message}</Callout>
}

/** Skeleton → error → data. Keeps showing the last good payload (with a stale note) if a refresh fails. */
export function Load<T>({ res, what, height = 120, children }: {
  res: ApiResult<T>
  what: string
  height?: number
  children: (data: T) => ReactNode
}) {
  if (res.data) {
    return (
      <>
        {children(res.data)}
        {res.error && (
          <p className="muted tiny" style={{ margin: '8px 0 0' }} role="status">
            Refresh failed ({res.error.message}) — showing data from {clock(res.updatedAt)}.
          </p>
        )}
      </>
    )
  }
  if (res.error) return <ApiNote error={res.error} what={what} />
  return <Skeleton height={height} />
}

export function RefreshButton({ onClick, label = 'Refresh' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="btn btn--sm" onClick={onClick} aria-label={label}>
      <RefreshCw size={13} /> {label}
    </button>
  )
}

/** A usage gauge: value against a limit, coloured by how much headroom is left. */
export function Gauge({ label, valueText, ratio, limitText, foot, help, warnAt = 0.6, dangerAt = 0.85, className }: {
  label: string
  valueText: ReactNode
  /** value ÷ limit; null when no limit is known. */
  ratio: number | null
  limitText?: ReactNode
  foot?: ReactNode
  help?: string
  warnAt?: number
  dangerAt?: number
  className?: string
}) {
  const pct = ratio == null ? 0 : Math.max(0, Math.min(1, ratio))
  const color = ratio == null ? 'var(--surface-3)' : ratio >= dangerAt ? 'var(--neg)' : ratio >= warnAt ? 'var(--warn)' : 'var(--pos)'
  return (
    <div className={clsx('stat', className)}>
      <div className="stat__label">
        {label}
        {help && <InfoTip text={help} />}
      </div>
      <div className="stat__value num">
        {valueText}
        {limitText != null && <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}> / {limitText}</span>}
      </div>
      <div
        className="bar"
        role="progressbar"
        aria-label={`${label} usage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={ratio == null ? undefined : Math.round(pct * 100)}
        aria-valuetext={ratio == null ? 'no limit known' : `${Math.round(ratio * 100)}% of limit`}
      >
        <span style={{ width: `${pct * 100}%`, background: color }} />
      </div>
      <div className="stat__foot">{ratio == null ? foot ?? 'no limit reported' : <>{Math.round(ratio * 100)}% of limit{foot ? <> · {foot}</> : null}</>}</div>
    </div>
  )
}

/** Key/value rows from an arbitrary flat record, skipping nested values. */
export function KvList({ rows }: { rows: [label: string, value: ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd className="num">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
