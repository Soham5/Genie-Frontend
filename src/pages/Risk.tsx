import type { ReactNode } from 'react'
import { num } from '@/api/client'
import { useApiState } from '@/api/ApiProvider'
import type { RiskSession } from '@/api/types'
import { useApi } from '@/api/useApi'
import { Badge, Callout, PageHead, Panel, Skeleton } from '@/components/ui/Panel'
import { Stat } from '@/components/ui/Stat'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { fmtINR } from '@/lib/format'
import { ApiNote, fmtStamp, Gauge, KvList, Load, RefreshButton } from './ops/shared'

interface Limits {
  max_daily_loss_inr: number
  max_daily_loss_pct_capital: number
  max_trade_value_inr: number
  max_sl_pct: number
  max_open_equity_positions: number
  max_open_fno_positions: number
  max_open_lots_per_strategy: number
  no_new_entry_after: string
  hard_square_off_time: string
  consecutive_loss_halt: number
  volatility_halt_vix: number
  circuit_breaker_status: { global_halt: boolean; halted_strategies: string[] }
}

interface Discrepancy { symbol: string; type: string; severity: string; broker_qty: number | null; internal_qty: number | null; detail: string }
interface ReconStatus { status?: string; message?: string; recon_date?: string; run_id?: string; is_clean?: boolean; summary?: unknown; completed_at?: string }
interface ReconDiscrepancies { count?: number; recon_date?: string; discrepancies: Discrepancy[] }

const LABELS: Record<string, string> = {
  max_daily_loss_inr: 'Max daily loss',
  max_daily_loss_pct_capital: 'Max daily loss (% capital)',
  max_trade_value_inr: 'Max trade value',
  max_sl_pct: 'Max stop-loss %',
  max_open_equity_positions: 'Max open equity positions',
  max_open_fno_positions: 'Max open F&O positions',
  max_open_lots_per_strategy: 'Max open lots / strategy',
  no_new_entry_after: 'No new entries after',
  hard_square_off_time: 'Hard square-off',
  consecutive_loss_halt: 'Halt after consecutive losses',
  volatility_halt_vix: 'Volatility halt (VIX)',
}
const MONEY = new Set(['max_daily_loss_inr', 'max_trade_value_inr'])
const label = (k: string) => LABELS[k] ?? k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
const show = (k: string, v: unknown): ReactNode => {
  if (v == null) return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'number' && MONEY.has(k)) return fmtINR(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export default function Risk() {
  const { status, kill } = useApiState()
  const enabled = status === 'online'
  const limits = useApi<Limits>('/risk/limits', { poll: 30000, enabled })
  const session = useApi<RiskSession>('/risk/session', { poll: 10000, enabled })
  const cfg = useApi<Record<string, unknown>>('/papertrade/risk-config', { poll: 60000, enabled })
  const stack = useApi<{ risk_stack_enabled: boolean }>('/papertrade/risk-stack', { poll: 60000, enabled })
  const recon = useApi<ReconStatus>('/recon/status', { poll: 60000, enabled })
  const disc = useApi<ReconDiscrepancies>('/recon/discrepancies', { poll: 60000, enabled })

  const s = session.data
  const l = limits.data
  const dayPnl = s ? num(s.daily_pnl) : null
  const weekPnl = s ? num(s.weekly_pnl) : null
  const maxDay = l?.max_daily_loss_inr ?? (s ? num(s.config.max_daily_loss) : null)
  const maxWeek = s ? num(s.config.max_weekly_loss) : null
  const losses = s ? num(s.consecutive_losses) : null
  const ratio = (v: number | null, max: number | null | undefined) => (v != null && max ? v / max : null)
  const dayLoss = dayPnl != null ? Math.max(0, -dayPnl) : null
  const weekLoss = weekPnl != null ? Math.max(0, -weekPnl) : null

  const refresh = () => { limits.refresh(); session.refresh(); cfg.refresh(); stack.refresh(); recon.refresh(); disc.refresh() }

  const discCols: Column<Discrepancy>[] = [
    { key: 'sym', header: 'Symbol', cell: (d) => <span className="mono">{d.symbol}</span> },
    { key: 'type', header: 'Type', cell: (d) => d.type },
    { key: 'sev', header: 'Severity', cell: (d) => <Badge tone={/crit|high/i.test(d.severity) ? 'neg' : 'warn'}>{d.severity}</Badge> },
    { key: 'b', header: 'Broker qty', align: 'r', cell: (d) => <span className="num">{d.broker_qty ?? '—'}</span> },
    { key: 'i', header: 'Internal qty', align: 'r', cell: (d) => <span className="num">{d.internal_qty ?? '—'}</span> },
    { key: 'd', header: 'Detail', wrap: true, cell: (d) => <span className="muted">{d.detail}</span> },
  ]

  return (
    <>
      <PageHead title="Risk" sub="Limits, circuit state and reconciliation. Read-only — limits and the kill switch are changed on the server." actions={<RefreshButton onClick={refresh} />} />
      <div className="stack">
        {kill?.active && (
          <Callout tone="neg" title="Kill switch is ACTIVE.">
            {kill.reason ?? 'No reason given'}{kill.activated_at ? ` · since ${fmtStamp(kill.activated_at)}` : ''}. The algo will not open new positions.
          </Callout>
        )}

        <Panel title="Limit usage" sub={s ? `Session ${s.session_date}` : 'From /risk/session and /risk/limits'}>
          {session.error && !s ? <ApiNote error={session.error} what="the risk session" /> : !s ? <Skeleton height={96} /> : (
            <div className="grid cols-4">
              <Gauge label="Daily loss" valueText={fmtINR(dayLoss)} limitText={fmtINR(maxDay)} ratio={ratio(dayLoss, maxDay)} foot={`day P&L ${fmtINR(dayPnl, { sign: true })}`} />
              <Gauge label="Weekly loss" valueText={fmtINR(weekLoss)} limitText={fmtINR(maxWeek)} ratio={ratio(weekLoss, maxWeek)} foot={`week P&L ${fmtINR(weekPnl, { sign: true })}`} />
              <Gauge label="Consecutive losses" valueText={String(losses ?? 0)} limitText={l?.consecutive_loss_halt} ratio={ratio(losses, l?.consecutive_loss_halt)} warnAt={0.5} dangerAt={0.8} />
              <Gauge label="Open F&O positions" valueText={String(num(s.open_fno_positions) ?? 0)} limitText={l?.max_open_fno_positions} ratio={ratio(num(s.open_fno_positions), l?.max_open_fno_positions)} />
              <Gauge label="Open equity positions" valueText={String(num(s.open_equity_positions) ?? 0)} limitText={l?.max_open_equity_positions} ratio={ratio(num(s.open_equity_positions), l?.max_open_equity_positions)} />
              <Stat label="Circuit state" value={s.circuit_state} tone={/halt|trip/i.test(s.circuit_state) ? 'neg' : /normal|active/i.test(s.circuit_state) ? 'pos' : undefined} foot={`mode ${s.risk_mode}`} />
              <Stat label="Trades today" value={String(num(s.trades_today) ?? 0)} foot={s.cooldown_until ? `cooldown until ${s.cooldown_until}` : 'no cooldown'} />
              <Stat label="Kill switch" value={kill ? (kill.active ? 'ACTIVE' : 'Off') : '—'} tone={kill?.active ? 'neg' : 'pos'} foot={l?.circuit_breaker_status.global_halt ? 'global halt on' : 'no global halt'} accent={kill?.active ? 'neg' : undefined} />
            </div>
          )}
        </Panel>

        <div className="grid cols-2">
          <Panel title="Configured limits" sub="From /risk/limits">
            <Load res={limits} what="risk limits">
              {(d) => (
                <>
                  <KvList rows={Object.entries(d).filter(([k]) => k !== 'circuit_breaker_status').map(([k, v]) => [label(k), show(k, v)])} />
                  <p className="muted tiny" style={{ margin: '10px 0 0' }}>
                    Halted strategies: {d.circuit_breaker_status.halted_strategies.length ? d.circuit_breaker_status.halted_strategies.join(', ') : 'none'}
                  </p>
                </>
              )}
            </Load>
          </Panel>

          <Panel title="Paper-trading risk engine" sub="From /papertrade/risk-config" actions={stack.data ? <Badge tone={stack.data.risk_stack_enabled ? 'pos' : 'warn'} dot>Risk stack {stack.data.risk_stack_enabled ? 'on' : 'off'}</Badge> : undefined}>
            <Load res={cfg} what="the paper risk config">
              {(d) => <KvList rows={Object.entries(d).map(([k, v]) => [label(k), show(k, v)])} />}
            </Load>
            {stack.data && !stack.data.risk_stack_enabled && <Callout tone="warn">The regime and pre-trade risk gate is bypassed for paper trading.</Callout>}
          </Panel>
        </div>

        <Panel title="Broker reconciliation" sub="Internal book vs Angel One positions (last run)">
          {recon.error && !recon.data ? <ApiNote error={recon.error} what="reconciliation status" /> : !recon.data ? <Skeleton height={80} /> : recon.data.status === 'no_recon_run' ? (
            <Callout tone="info">{recon.data.message ?? 'No reconciliation has run yet.'} Paper trading has no broker positions to reconcile.</Callout>
          ) : (
            <div className="stack">
              <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                <Badge tone={recon.data.is_clean ? 'pos' : 'neg'} dot>{recon.data.is_clean ? 'Clean' : 'Discrepancies found'}</Badge>
                <span className="muted tiny">run {recon.data.run_id ?? '—'} · {recon.data.recon_date ?? ''} · completed {fmtStamp(recon.data.completed_at)}</span>
              </div>
              {disc.data && <DataTable dense rows={disc.data.discrepancies} columns={discCols} rowKey={(d) => `${d.symbol}-${d.type}`} emptyTitle="No discrepancies" emptyHint="Broker and internal positions match." />}
              {disc.error && !disc.data && <ApiNote error={disc.error} what="reconciliation discrepancies" />}
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}
