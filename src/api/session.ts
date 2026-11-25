import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTrades } from './TradesProvider'

/** Today's date in IST (YYYY-MM-DD), the exchange's calendar day. */
export const todayIST = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' })

export interface SessionDate {
  date: string
  isToday: boolean
  today: string
  setDate: (d: string) => void
  /** Dates that have closed trades (newest first), plus today. */
  dates: string[]
}

/** The selected session lives in the URL (`?d=YYYY-MM-DD`) so views are shareable. Defaults to today. */
export function useSessionDate(): SessionDate {
  const { trades } = useTrades()
  const [params, setParams] = useSearchParams()
  const today = todayIST()
  const raw = params.get('d')
  const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today
  const dates = useMemo(() => {
    const s = new Set<string>([today])
    for (const t of trades) {
      s.add(t.exitDate)
      s.add(t.entryDate)
    }
    return [...s].sort().reverse()
  }, [trades, today])
  const setDate = (d: string) => {
    const next = new URLSearchParams(params)
    if (d === today) next.delete('d')
    else next.set('d', d)
    setParams(next, { replace: true })
  }
  return { date, isToday: date === today, today, setDate, dates }
}
