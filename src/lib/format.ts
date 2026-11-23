const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 })

export const MINUS = '\u2212'

/** ₹ amount in Indian digit grouping. `sign` forces a leading +/− for P&L cells. */
export function fmtINR(n: number | null | undefined, opts: { sign?: boolean; decimals?: boolean; compact?: boolean } = {}): string {
  if (n == null || Number.isNaN(n)) return '—'
  const abs = Math.abs(n)
  const body = opts.compact && abs >= 10000 ? compact.format(abs) : (opts.decimals ? inr2 : inr).format(abs)
  const sign = n < 0 ? MINUS : opts.sign && n > 0 ? '+' : ''
  return `${sign}₹${body}`
}

export function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace('-', MINUS)
}

export function fmtPct(n: number | null | undefined, digits = 1, sign = false): string {
  if (n == null || Number.isNaN(n)) return '—'
  const s = n < 0 ? MINUS : sign && n > 0 ? '+' : ''
  return `${s}${Math.abs(n).toFixed(digits)}%`
}

export function fmtCount(n: number | null | undefined): string {
  return n == null ? '—' : inr.format(n)
}

export function pnlTone(n: number | null | undefined): 'pos' | 'neg' | 'flat' {
  if (n == null || Math.abs(n) < 0.005) return 'flat'
  return n > 0 ? 'pos' : 'neg'
}

export function fmtDate(iso: string, style: 'long' | 'short' | 'day' = 'short'): string {
  const d = new Date(`${iso}T00:00:00`)
  if (style === 'day') return d.toLocaleDateString('en-GB', { weekday: 'short' })
  if (style === 'long') return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export function fmtAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 90) return 'just now'
  if (s < 5400) return `${Math.round(s / 60)} min ago`
  if (s < 129600) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

export const prettyEvent = (e: string) => e.replaceAll('_', ' ')

export function prettyStrategy(id: string): string {
  return id
    .replace(/_(v\d+|test)$/, '')
    .split('_')
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ')
}
