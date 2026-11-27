import type { ReactNode } from 'react'
import { Panel } from '@/components/ui/Panel'
import { fmtINR, fmtPct, pnlTone } from '@/lib/format'
import { clsx } from '@/lib/clsx'
import { fmtIsoDay, ringAmount, type ReportSummary } from '@/lib/strategyBacktest'

function SumCard({ title, value, children }: { title: string; value?: ReactNode; children: ReactNode }) {
  return (
    <section className="sb-card" aria-label={title}>
      <h4 className="sb-card__title">{title}</h4>
      {value != null && <div className="sb-card__value num">{value}</div>}
      <div className="sb-card__rows">{children}</div>
    </section>
  )
}

function Share({ label, pct, count, total, tone }: { label: string; pct: number; count: number; total: number; tone: 'pos' | 'neg' }) {
  return (
    <div className="sb-share">
      <span className="sb-share__label">{label}</span>
      <strong className={clsx('num', tone)}>{fmtPct(pct, 2)}</strong>
      <span className={clsx('sb-pill', `sb-pill--${tone}`)} title={`${count} of ${total}`}>
        {count} vs {total}
      </span>
    </div>
  )
}

function Pair({ label, value, tone, foot }: { label: string; value: ReactNode; tone?: 'pos' | 'neg' | 'flat'; foot?: ReactNode }) {
  return (
    <div className="sb-pair">
      <span className="sb-pair__label">{label}</span>
      <strong className={clsx('num', tone)}>{value}</strong>
      {foot && <span className="sb-pair__foot">{foot}</span>}
    </div>
  )
}

function DrawdownRing({ summary }: { summary: ReportSummary }) {
  const r = 34
  const circumference = 2 * Math.PI * r
  const pct = summary.max_drawdown_pct_of_peak
  // The arc shows the drawdown as a share of the peak P&L; with no positive peak there is nothing to compare against.
  const fraction = summary.max_drawdown <= 0 ? 0 : pct == null ? 1 : Math.min(1, pct / 100)
  const amount = `₹${ringAmount(summary.max_drawdown)}`
  const detail =
    summary.max_drawdown <= 0
      ? 'No drawdown in this range.'
      : [
          pct != null ? `${fmtPct(pct, 1)} of the peak P&L` : 'Peak P&L was never positive',
          summary.max_drawdown_peak_date && summary.max_drawdown_trough_date ? `${fmtIsoDay(summary.max_drawdown_peak_date)} → ${fmtIsoDay(summary.max_drawdown_trough_date)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')

  return (
    <div className="sb-ring">
      <svg viewBox="0 0 88 88" width="88" height="88" role="img" aria-label={`Max drawdown from peak ${fmtINR(summary.max_drawdown, { decimals: true })}`}>
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--border-strong)" strokeWidth="6" />
        {fraction > 0 && (
          <circle
            cx="44"
            cy="44"
            r={r}
            fill="none"
            stroke="var(--neg)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${circumference * fraction} ${circumference}`}
            transform="rotate(-90 44 44)"
          />
        )}
        <text x="44" y="44" textAnchor="middle" dominantBaseline="central" className="sb-ring__text">
          {amount}
        </text>
      </svg>
      <div>
        <div className="sb-ring__title">Max Drawdown From Peak</div>
        <div className="sb-note">{detail}</div>
      </div>
    </div>
  )
}

export function SummaryCards({ summary: s }: { summary: ReportSummary }) {
  return (
    <Panel title="Backtest Summary" sub="Win and loss are judged on net P&L, after slippage and brokerage.">
      <div className="sb-cards">
        <SumCard title="Trading Days" value={s.trading_days}>
          <Share label="Win Days" pct={s.win_days_pct} count={s.win_days} total={s.trading_days} tone="pos" />
          <Share label="Loss Days" pct={s.loss_days_pct} count={s.loss_days} total={s.trading_days} tone="neg" />
          {s.flat_days > 0 && <p className="sb-note">{s.flat_days} breakeven {s.flat_days === 1 ? 'day' : 'days'}.</p>}
        </SumCard>

        <SumCard title="Total Trades" value={s.total_trades}>
          <Share label="Win Trades" pct={s.win_trades_pct} count={s.win_trades} total={s.total_trades} tone="pos" />
          <Share label="Loss Trades" pct={s.loss_trades_pct} count={s.loss_trades} total={s.total_trades} tone="neg" />
          {s.flat_trades > 0 && <p className="sb-note">{s.flat_trades} breakeven {s.flat_trades === 1 ? 'trade' : 'trades'}.</p>}
        </SumCard>

        <SumCard title="Streak">
          <div className="sb-streak">
            <Pair label="Win" value={s.max_win_streak} tone="pos" foot={s.max_win_streak === 1 ? 'day' : 'days'} />
            <Pair label="Loss" value={s.max_loss_streak} tone="neg" foot={s.max_loss_streak === 1 ? 'day' : 'days'} />
          </div>
          <Pair label="Max Profit" value={fmtINR(s.max_profit, { sign: true, decimals: true })} tone={pnlTone(s.max_profit)} foot={s.max_profit_date ? fmtIsoDay(s.max_profit_date) : undefined} />
          <Pair label="Max Loss" value={fmtINR(s.max_loss, { sign: true, decimals: true })} tone={pnlTone(s.max_loss)} foot={s.max_loss_date ? fmtIsoDay(s.max_loss_date) : undefined} />
        </SumCard>

        <SumCard title="Average Per Day">
          <Pair label="Profit" value={fmtINR(s.avg_profit_per_day, { sign: true, decimals: true })} tone={pnlTone(s.avg_profit_per_day)} />
          <Pair label="Loss" value={fmtINR(s.avg_loss_per_day, { sign: true, decimals: true })} tone={pnlTone(s.avg_loss_per_day)} />
          <DrawdownRing summary={s} />
        </SumCard>
      </div>
    </Panel>
  )
}
