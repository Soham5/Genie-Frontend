import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useStore } from '@/data/store'
import { CATALOG, catalogFor, type Segment } from '@/data/catalog'
import { Badge, Callout, PageHead, Panel, Seg } from '@/components/ui/Panel'
import { backtestFlags } from '@/lib/quality'
import { computeStats } from '@/lib/stats'
import { fmtINR, fmtNum, fmtPct, pnlTone } from '@/lib/format'
import { clsx } from '@/lib/clsx'

type Filter = 'All' | Segment

export default function Strategies() {
  const { closedTrades, trades, backtest } = useStore()
  const { search } = useLocation()
  const [seg, setSeg] = useState<Filter>('All')

  const cards = useMemo(
    () =>
      CATALOG.map((meta) => {
        const mine = closedTrades.filter((t) => catalogFor(t.strategy)?.id === meta.id)
        const openCount = trades.filter((t) => t.status === 'open' && catalogFor(t.strategy)?.id === meta.id).length
        const bt = backtest.rows.find((r) => r.id === meta.id)
        return { meta, stats: computeStats(mine), openCount, bt, flags: bt ? backtestFlags(bt) : [] }
      }).sort((a, b) => b.stats.count - a.stats.count || a.meta.name.localeCompare(b.meta.name)),
    [closedTrades, trades, backtest],
  )
  const shown = cards.filter((c) => seg === 'All' || c.meta.segment === seg)
  const live = cards.filter((c) => c.stats.count > 0 || c.openCount > 0).length

  return (
    <>
      <PageHead
        title="Strategies"
        sub={`${CATALOG.length} strategies in the catalog · ${live} have traded live (paper) in the logged window`}
        actions={<Seg<Filter> label="Segment" value={seg} onChange={setSeg} options={(['All', 'Equity intraday', 'Swing', 'F&O'] as Filter[]).map((v) => ({ value: v, label: v }))} />}
      />
      <div className="stack">
        <Callout tone="warn" title="Read backtest numbers with caution.">
          The backtest column comes from a synthetic-data report. Flags show where metrics are thin or implausible. See the <Link className="link-btn" to={{ pathname: '/backtests', search }}>Backtest Lab</Link>.
        </Callout>
        <div className="card-grid">
          {shown.map(({ meta, stats, openCount, bt, flags }) => (
            <Panel
              key={meta.id}
              className="strategy-card"
              title={meta.name}
              sub={meta.summary}
              actions={<Badge tone={meta.segment === 'F&O' ? 'violet' : meta.segment === 'Swing' ? 'info' : 'accent'}>{meta.segment}</Badge>}
            >
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Paper / live log</div>
              {stats.count + openCount === 0 ? (
                <p className="muted" style={{ fontSize: 12.5 }}>No trades in the logged window.</p>
              ) : (
                <div className="strategy-card__metrics metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <Metric label="Net P&L" value={fmtINR(stats.net, { sign: true })} tone={pnlTone(stats.net)} />
                  <Metric label="Closed / open" value={`${stats.count} / ${openCount}`} />
                  <Metric label="Win rate" value={fmtPct(stats.winRate, 0)} />
                  <Metric label="Profit factor" value={fmtNum(stats.profitFactor)} />
                  <Metric label="Expectancy" value={fmtINR(stats.expectancy, { sign: true })} tone={pnlTone(stats.expectancy)} />
                  <Metric label="Avg R" value={stats.avgR == null ? '—' : `${fmtNum(stats.avgR)}R`} />
                </div>
              )}
              <div className="divider" />
              <div className="row row--between" style={{ marginBottom: 6 }}>
                <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Backtest (synthetic)</span>
                <span className="row row--wrap" style={{ gap: 4 }}>
                  {flags.map((f) => <Badge key={f.key} tone={f.severity} title={f.detail}>{f.label}</Badge>)}
                </span>
              </div>
              {bt && bt.trades ? (
                <div className="metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <Metric label="Net P&L" value={fmtINR(bt.netPnl, { sign: true })} tone={pnlTone(bt.netPnl)} />
                  <Metric label="Sharpe" value={fmtNum(bt.sharpe, 1)} dim={flags.some((f) => f.key === 'implausible')} />
                  <Metric label="Win rate" value={fmtPct(bt.winRate, 0)} />
                </div>
              ) : (
                <p className="muted" style={{ fontSize: 12.5 }}>{bt ? 'No signals generated in the test window.' : 'Not part of the backtest report.'}</p>
              )}
              <div className="muted mono" style={{ fontSize: 11, marginTop: 12 }}>{meta.className}</div>
            </Panel>
          ))}
        </div>
      </div>
    </>
  )
}

function Metric({ label, value, tone, dim }: { label: string; value: string; tone?: 'pos' | 'neg' | 'flat'; dim?: boolean }) {
  return (
    <div>
      <div className="metric__label">{label}</div>
      <div className={clsx('metric__value num', tone, dim && 'muted')} style={dim ? { textDecoration: 'line-through' } : undefined}>{value}</div>
    </div>
  )
}
