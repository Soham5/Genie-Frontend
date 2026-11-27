import { useMemo } from 'react'
import { Empty, Panel } from '@/components/ui/Panel'
import { COLORS, Legend } from '@/components/charts/chartKit'
import { fmtINR, pnlTone } from '@/lib/format'
import { clsx } from '@/lib/clsx'
import { fmtIsoDay, monthCalendars, type DayRow } from '@/lib/strategyBacktest'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function CalendarPanel({ daily }: { daily: DayRow[] }) {
  const months = useMemo(() => monthCalendars(daily), [daily])

  return (
    <Panel
      title="Daywise Breakdown"
      sub="One square per calendar day; hover a square for its P&L."
      actions={
        <Legend
          items={[
            { label: 'Profit', color: COLORS.pos },
            { label: 'Loss', color: COLORS.neg },
            { label: 'No closed trades', color: 'var(--surface-3)' },
          ]}
        />
      }
    >
      {months.length === 0 ? (
        <Empty title="No trading days">There is nothing to lay out because no trades closed in this range.</Empty>
      ) : (
        <div className="sb-months" tabIndex={0} aria-label="Monthly calendars, scroll sideways for more months">
          {months.map((m) => (
            <div className="sb-month" key={m.key}>
              <div className="sb-month__dow" aria-hidden>
                {WEEKDAYS.map((d, i) => (
                  <span key={i}>{d}</span>
                ))}
              </div>
              <div className="sb-month__grid">
                {Array.from({ length: m.leading }, (_, i) => (
                  <span key={`blank-${i}`} className="sb-day sb-day--blank" aria-hidden />
                ))}
                {m.cells.map((c) => (
                  <span
                    key={c.date}
                    className={`sb-day sb-day--${c.kind}`}
                    title={c.pnl == null ? `${fmtIsoDay(c.date)} · no closed trades` : `${fmtIsoDay(c.date)} · ${fmtINR(c.pnl, { sign: true, decimals: true })}`}
                  />
                ))}
              </div>
              <div className="sb-month__label">{m.label}</div>
              <div className={clsx('sb-month__pnl num', pnlTone(m.pnl))}>{m.tradingDays ? fmtINR(m.pnl, { sign: true, decimals: true }) : '—'}</div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
