import { useCallback, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApi } from '@/api/useApi'
import { useApiState } from '@/api/ApiProvider'
import { useTrades } from '@/api/TradesProvider'
import { useLiveBook } from '@/hooks/useLiveBook'
import { Badge, Callout, PageHead, Panel, Seg, Skeleton } from '@/components/ui/Panel'
import { Stat } from '@/components/ui/Stat'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { ApiErrorNote } from '@/components/ui/ApiErrorNote'
import { computeStats, equityCurve, groupBy, type TradeStats } from '@/lib/stats'
import type { ClosedTrade } from '@/lib/trades'
import type { Position } from '@/lib/positions'
import type { Lane } from '@/api/types'
import { fmtDate, fmtINR, fmtNum, fmtPct, pnlTone, prettyStrategy } from '@/lib/format'
import { fmtStamp } from '@/lib/stamp'
import { clsx } from '@/lib/clsx'
import { STATUS_TONE, StrategyDrawer, prettyStatus, type StrategyCfg } from './StrategyDrawer'

type LaneFilter = 'all' | Lane

interface StrategiesPayload { count: number; strategies: Record<string, StrategyCfg> }
interface KpiStrategies { stage: string; count: number; strategies: { strategy_id: string; trade_count: number; first_trade: string | null; last_trade: string | null }[] }

interface Row {
  id: string
  cfg: StrategyCfg | null
  lane: Lane | null
  trades: ClosedTrade[]
  stats: TradeStats
  open: Position[]
  openPnl: number | null
  lastTrade: string | null
  recorded: number | null
}

/** Mirrors the backend: "pending" strategies are scanned by the research lane, promoted ones by the managed lane. */
const laneOfStatus = (status: string): Lane | null => (status === 'pending' ? 'research' : status === 'deactivated' ? null : 'managed')

const EMPTY_TRADES: ClosedTrade[] = []

export default function Strategies() {
  const api = useApiState()
  const { trades, loading: tradesLoading, error: tradesError, unsupported, truncated } = useTrades()
  const book = useLiveBook()
  const reg = useApi<StrategiesPayload>('/strategies', { enabled: api.status !== 'unconfigured' })
  const kpi = useApi<KpiStrategies>('/kpi/strategies', { params: { stage: 'papertrade' }, enabled: api.status !== 'unconfigured' })
  const [lane, setLane] = useState<LaneFilter>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const close = useCallback(() => setSelected(null), [])

  const rows = useMemo<Row[]>(() => {
    const byTrades = groupBy(trades, (t) => t.strategy)
    const byOpen = groupBy(book.positions, (p) => p.strategy)
    const kpiMap = new Map((kpi.data?.strategies ?? []).map((k) => [k.strategy_id, k]))
    const registry = reg.data?.strategies ?? {}
    const ids = new Set([...Object.keys(registry), ...Object.keys(byTrades), ...Object.keys(byOpen)])
    const out: Row[] = []
    for (const id of ids) {
      const cfg = registry[id] ?? null
      const statusLane = cfg ? laneOfStatus(cfg.status) : null
      const mine = lane === 'all' ? (byTrades[id] ?? EMPTY_TRADES) : (byTrades[id] ?? EMPTY_TRADES).filter((t) => t.lane === lane)
      const open = lane === 'all' ? (byOpen[id] ?? []) : (byOpen[id] ?? []).filter((p) => p.lane === lane)
      if (lane !== 'all' && statusLane !== lane && !mine.length && !open.length) continue
      const k = kpiMap.get(id)
      const priced = open.filter((p) => p.pnl != null)
      out.push({
        id,
        cfg,
        lane: statusLane,
        trades: mine,
        stats: computeStats(mine),
        open,
        openPnl: priced.length ? priced.reduce((s, p) => s + (p.pnl ?? 0), 0) : null,
        lastTrade: mine.at(-1)?.exitDate ?? (lane === 'all' ? k?.last_trade?.slice(0, 10) ?? null : null),
        recorded: k?.trade_count ?? null,
      })
    }
    return out
  }, [trades, book.positions, kpi.data, reg.data, lane])

  const q = query.trim().toLowerCase()
  const shown = useMemo(
    () => (q ? rows.filter((r) => `${r.id} ${prettyStrategy(r.id)} ${r.cfg?.class_name ?? ''} ${r.cfg?.segment ?? ''} ${r.cfg?.status ?? ''}`.toLowerCase().includes(q)) : rows),
    [rows, q],
  )

  const totals = useMemo(() => {
    const all = shown.flatMap((r) => r.trades).sort((a, b) => `${a.exitDate}${a.exitT ?? ''}`.localeCompare(`${b.exitDate}${b.exitT ?? ''}`))
    const open = shown.flatMap((r) => r.open)
    return {
      stats: computeStats(all),
      spark: equityCurve(all).map((p) => p.equity),
      active: shown.filter((r) => r.stats.count > 0 || r.open.length > 0).length,
      open: open.length,
      openPnl: open.filter((p) => p.pnl != null).reduce((s, p) => s + (p.pnl ?? 0), 0),
    }
  }, [shown])

  const selectedRow = selected ? rows.find((r) => r.id === selected) ?? null : null
  const registered = reg.data ? Object.keys(reg.data.strategies).length : null
  const managedCount = reg.data ? Object.values(reg.data.strategies).filter((c) => laneOfStatus(c.status) === 'managed').length : null
  const researchCount = reg.data ? Object.values(reg.data.strategies).filter((c) => laneOfStatus(c.status) === 'research').length : null

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Strategy',
      sort: (r) => prettyStrategy(r.id),
      cell: (r) => (
        <div>
          <button type="button" className="link-btn" style={{ textDecoration: 'none', fontWeight: 600, color: 'var(--text)' }} onClick={(e) => { e.stopPropagation(); setSelected(r.id) }} aria-label={`Open details for ${prettyStrategy(r.id)}`}>
            {prettyStrategy(r.id)}
          </button>
          <div className="mono muted" style={{ fontSize: 11 }}>{r.id}</div>
        </div>
      ),
    },
    { key: 'seg', header: 'Segment', sort: (r) => r.cfg?.segment ?? null, cell: (r) => (r.cfg ? <span><Badge tone="outline">{r.cfg.segment}</Badge> <span className="muted num" style={{ fontSize: 11.5 }}>{r.cfg.timeframe}</span></span> : <span className="muted">—</span>) },
    {
      key: 'status',
      header: 'Status',
      sort: (r) => r.cfg?.status ?? null,
      cell: (r) => (r.cfg ? <Badge tone={STATUS_TONE[r.cfg.status] ?? 'muted'} dot>{prettyStatus(r.cfg.status)}</Badge> : <Badge tone="warn" title="Trades exist for this id but the strategy registry doesn't list it.">not in registry</Badge>),
    },
    { key: 'lane', header: 'Lane', sort: (r) => r.lane ?? '', cell: (r) => (r.lane ? <Badge tone={r.lane === 'managed' ? 'info' : 'violet'}>{r.lane}</Badge> : <span className="muted">—</span>) },
    { key: 'open', header: 'Open', align: 'r', sort: (r) => r.open.length, cell: (r) => <span className="num">{r.open.length || <span className="muted">0</span>}</span> },
    { key: 'mtm', header: 'Open MTM', align: 'r', sort: (r) => r.openPnl, cell: (r) => <span className={clsx('num', pnlTone(r.openPnl))}>{r.openPnl == null ? '—' : fmtINR(r.openPnl, { sign: true })}</span> },
    { key: 'trades', header: 'Closed', align: 'r', sort: (r) => r.stats.count, cell: (r) => <span className="num">{r.stats.count}</span> },
    { key: 'win', header: 'Win %', align: 'r', sort: (r) => r.stats.winRate, cell: (r) => <span className="num">{fmtPct(r.stats.winRate, 0)}</span> },
    { key: 'net', header: 'Net P&L', align: 'r', sort: (r) => (r.stats.count ? r.stats.net : null), cell: (r) => (r.stats.count ? <strong className={clsx('num', pnlTone(r.stats.net))}>{fmtINR(r.stats.net, { sign: true })}</strong> : <span className="muted">—</span>) },
    { key: 'pf', header: 'PF', align: 'r', tip: 'Profit factor: gross profit ÷ gross loss', sort: (r) => r.stats.profitFactor, cell: (r) => <span className="num">{fmtNum(r.stats.profitFactor)}</span> },
    { key: 'dd', header: 'Max DD', align: 'r', tip: 'Largest peak-to-trough fall in cumulative net P&L', sort: (r) => (r.stats.count ? -r.stats.maxDrawdown : null), cell: (r) => <span className={clsx('num', r.stats.maxDrawdown < 0 && 'neg')}>{r.stats.count ? fmtINR(r.stats.maxDrawdown) : '—'}</span> },
    { key: 'r', header: 'Avg R', align: 'r', tip: 'Mean R-multiple over trades that recorded a stop', sort: (r) => r.stats.avgR, cell: (r) => <span className="num">{r.stats.avgR == null ? '—' : `${fmtNum(r.stats.avgR)}R`}</span> },
    { key: 'rec', header: 'Recorded', align: 'r', tip: 'Paper trades stored server-side (all lanes, including open), from /kpi/strategies', sort: (r) => r.recorded, cell: (r) => <span className="num muted">{r.recorded ?? '—'}</span> },
    { key: 'last', header: 'Last trade', sort: (r) => r.lastTrade, cell: (r) => <span className="num muted">{r.lastTrade ? fmtDate(r.lastTrade) : '—'}</span> },
  ]

  if (api.status === 'unconfigured') {
    return (
      <>
        <PageHead title="Strategies" sub="Scorecard from the Genie API" />
        <Callout tone="info" title="Not connected.">Set the API URL and key in <Link className="link-btn" to="/settings">Settings</Link> to load strategies.</Callout>
      </>
    )
  }

  return (
    <>
      <PageHead
        title="Strategies"
        sub={
          registered == null
            ? 'Strategy registry, live paper performance and lifecycle'
            : `${registered} registered · ${managedCount} managed · ${researchCount} research · ${totals.active} with paper activity`
        }
        actions={
          <>
            <label className="input-wrap">
              <Search size={14} aria-hidden />
              <input className="input input--search" type="search" placeholder="Filter strategies" aria-label="Filter strategies" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <Seg<LaneFilter>
              label="Lane"
              value={lane}
              onChange={setLane}
              options={[{ value: 'all', label: 'All lanes' }, { value: 'managed', label: 'Managed' }, { value: 'research', label: 'Research' }]}
            />
          </>
        }
      />
      <div className="stack">
        {unsupported && <Callout tone="warn" title="Closed-trade history unavailable.">This API doesn't serve <span className="mono">/console/trades</span>, so performance columns are empty. Registry data below is live.</Callout>}
        {tradesError && !unsupported && <ApiErrorNote error={tradesError} what="closed trades" />}
        {truncated && <Callout tone="info" title="Trade history is capped.">The API returned its maximum rows, so older trades are missing from these statistics.</Callout>}

        <div className="grid cols-4">
          <Stat
            label="Strategies"
            value={reg.loading ? '…' : shown.length}
            foot={reg.data ? `${totals.active} traded · ${shown.filter((r) => r.cfg?.status === 'deactivated').length} deactivated` : 'registry'}
          />
          <Stat
            label="Net P&L (closed)"
            value={fmtINR(totals.stats.net, { sign: true })}
            tone={pnlTone(totals.stats.net)}
            foot={`${totals.stats.count} trades · win ${fmtPct(totals.stats.winRate, 0)} · PF ${fmtNum(totals.stats.profitFactor)}`}
            spark={totals.spark}
            sparkTone={totals.stats.net >= 0 ? 'pos' : 'neg'}
          />
          <Stat label="Max drawdown" value={fmtINR(totals.stats.maxDrawdown)} tone={totals.stats.maxDrawdown < 0 ? 'neg' : undefined} foot="combined, in exit order" help="Peak-to-trough fall of the combined cumulative net P&L of the strategies shown." />
          <Stat
            label="Open positions"
            value={book.state === 'connecting' ? '…' : totals.open}
            foot={book.state === 'error' ? <span className="neg">{book.error}</span> : `MTM ${fmtINR(totals.openPnl, { sign: true })}`}
            tone={pnlTone(totals.openPnl)}
          />
        </div>

        <Panel
          title="Scorecard"
          sub="Statistics are computed from closed paper trades returned by the API; click a row for the equity curve and lifecycle."
          flush
          actions={reg.updatedAt ? <span className="muted num" style={{ fontSize: 11.5 }}>registry {fmtStamp(reg.updatedAt.toISOString())}</span> : undefined}
        >
          {reg.loading || (tradesLoading && !trades.length) ? (
            <div style={{ padding: 16 }} aria-busy="true"><Skeleton height={320} /></div>
          ) : reg.error && !reg.data ? (
            <div style={{ padding: 16 }}><ApiErrorNote error={reg.error} what="the strategy registry" /></div>
          ) : (
            <DataTable<Row>
              rows={shown}
              rowKey={(r) => r.id}
              columns={columns}
              initialSort={{ key: 'net', dir: 'desc' }}
              onRowClick={(r) => setSelected(r.id)}
              emptyTitle={q ? 'No strategies match this filter' : lane === 'all' ? 'No strategies registered' : `No ${lane} strategies`}
              emptyHint={q ? 'Clear the filter to see every strategy.' : 'The API returned none for this view.'}
            />
          )}
        </Panel>

        {kpi.error && (
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            {kpi.error.status === 403 ? 'The API key can’t read /kpi/strategies, so the “Recorded” column is blank.' : `KPI stage data unavailable: ${kpi.error.message}`}
          </p>
        )}
      </div>
      {selected && (
        <StrategyDrawer
          key={selected}
          id={selected}
          cfg={selectedRow?.cfg ?? reg.data?.strategies[selected] ?? null}
          trades={selectedRow?.trades ?? EMPTY_TRADES}
          positions={selectedRow?.open ?? []}
          stats={selectedRow?.stats ?? computeStats([])}
          onClose={close}
        />
      )}
    </>
  )
}
