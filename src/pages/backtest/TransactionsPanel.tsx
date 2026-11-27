import { useEffect, useId, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { ChevronDown, Download, Printer } from 'lucide-react'
import { Badge, Empty, Panel, Seg } from '@/components/ui/Panel'
import { SideChip } from '@/components/ui/bits'
import { downloadText } from '@/lib/download'
import { fmtINR, fmtNum, pnlTone, prettyEvent, prettyStrategy } from '@/lib/format'
import { clsx } from '@/lib/clsx'
import { csvFilename, fmtIsoDay, fmtIsoShort, groupTrades, tradesToCsv, type DayGroup, type StrategyBacktestResponse, type TradeRow } from '@/lib/strategyBacktest'

const PAGE = 50
type Order = 'asc' | 'desc'

/** Time of day, with the date added when a trade was entered on an earlier day than it exited. */
function when(iso: string, exitDay: string): string {
  const time = iso.slice(11, 16)
  return iso.slice(0, 10) === exitDay ? time : `${fmtIsoShort(iso)} ${time}`
}

function TradeTable({ trades, day }: { trades: TradeRow[]; day: string }) {
  if (!trades.length) return <p className="sb-note" style={{ padding: '8px 14px' }}>No trade details for this day.</p>
  return (
    <div className="tbl-wrap">
      <table className="tbl tbl--dense">
        <thead>
          <tr>
            <th>Strategy</th>
            <th>Symbol</th>
            <th>Side</th>
            <th className="r">Qty</th>
            <th>Entry</th>
            <th>Exit</th>
            <th className="r">Entry ₹</th>
            <th className="r">Exit ₹</th>
            <th className="r">Gross</th>
            <th className="r">Costs</th>
            <th className="r">Net</th>
            <th>Exit reason</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => (
            <tr key={`${t.strategy_id}-${t.symbol}-${t.entry_time}-${i}`}>
              <td title={t.strategy_id}>{prettyStrategy(t.strategy_id)}</td>
              <td className="num">{t.symbol}</td>
              <td><SideChip side={t.action} /></td>
              <td className="r num">{fmtNum(t.quantity, 0)}</td>
              <td className="num muted">{when(t.entry_time, day)}</td>
              <td className="num muted">{when(t.exit_time, day)}</td>
              <td className="r num">{fmtNum(t.entry_price)}</td>
              <td className="r num">{fmtNum(t.exit_price)}</td>
              <td className={clsx('r num', pnlTone(t.gross_pnl))}>{fmtINR(t.gross_pnl, { sign: true, decimals: true })}</td>
              <td className="r num muted" title={`Slippage ${fmtINR(t.slippage_cost, { decimals: true })} · Brokerage ${fmtINR(t.brokerage_cost, { decimals: true })}`}>
                {fmtINR(t.slippage_cost + t.brokerage_cost, { decimals: true })}
              </td>
              <td className={clsx('r num', pnlTone(t.net_pnl))}><strong>{fmtINR(t.net_pnl, { sign: true, decimals: true })}</strong></td>
              <td><Badge tone="outline">{prettyEvent(t.exit_reason || '—')}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TxnDay({ group, open, onToggle, forceOpen }: { group: DayGroup; open: boolean; onToggle: () => void; forceOpen: boolean }) {
  const id = useId()
  const tone = pnlTone(group.pnl)
  const shown = open || forceOpen
  return (
    <div className="sb-txn">
      <button type="button" className="sb-txn__head" aria-expanded={shown} aria-controls={id} onClick={onToggle}>
        <span className="num sb-txn__date">{fmtIsoDay(group.date)}</span>
        <span className="muted sb-txn__count">
          {group.trades.length} {group.trades.length === 1 ? 'trade' : 'trades'}
        </span>
        <span className="sb-txn__spacer" />
        <span className="muted">{tone === 'pos' ? 'Profit' : tone === 'neg' ? 'Loss' : 'Breakeven'}</span>
        <span className={clsx('sb-pill', tone === 'pos' && 'sb-pill--pos', tone === 'neg' && 'sb-pill--neg')}>{fmtINR(group.pnl, { sign: true, decimals: true })}</span>
        <ChevronDown size={16} className="sb-txn__chev" aria-hidden />
      </button>
      {shown && (
        <div id={id} className="sb-txn__body">
          <TradeTable trades={group.trades} day={group.date} />
        </div>
      )}
    </div>
  )
}

export function TransactionsPanel({ report }: { report: StrategyBacktestResponse }) {
  const { daily, trades, request, summary } = report
  const [order, setOrder] = useState<Order>('asc')
  const [visible, setVisible] = useState(PAGE)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [printing, setPrinting] = useState(false)

  const groups = useMemo(() => {
    const g = groupTrades(daily, trades)
    return order === 'asc' ? g : g.reverse()
  }, [daily, trades, order])
  const rows = printing ? groups : groups.slice(0, visible)

  useEffect(() => {
    const done = () => {
      document.body.classList.remove('sb-printing')
      setPrinting(false)
    }
    window.addEventListener('afterprint', done)
    return () => {
      window.removeEventListener('afterprint', done)
      document.body.classList.remove('sb-printing')
    }
  }, [])

  const toggle = (date: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(date)) next.add(date)
      return next
    })

  const printPdf = () => {
    // Everything has to be in the DOM before the browser lays out the page for printing.
    flushSync(() => setPrinting(true))
    document.body.classList.add('sb-printing')
    window.print()
  }

  const allOpen = groups.length > 0 && open.size >= groups.length

  return (
    <Panel
      className="sb-transactions"
      title="Transaction Details"
      sub={`${trades.length} ${trades.length === 1 ? 'trade' : 'trades'} across ${daily.length} trading ${daily.length === 1 ? 'day' : 'days'}, grouped by the day they closed.`}
      actions={
        <>
          <button type="button" className="btn" disabled={!trades.length} onClick={() => downloadText(csvFilename('trades', request), tradesToCsv(trades))}>
            <Download size={14} /> Download CSV
          </button>
          <button type="button" className="btn" disabled={!trades.length} onClick={printPdf} title="Opens the print dialog; choose “Save as PDF”.">
            <Printer size={14} /> Download PDF
          </button>
        </>
      }
    >
      <div className="sb-print-head">
        <h2>Strategy Backtest · Transaction Details</h2>
        <p>
          {fmtIsoDay(request.start_date)} → {fmtIsoDay(request.end_date)} · {report.strategies.map((s) => prettyStrategy(s.strategy_id)).join(', ')}
        </p>
        <p>
          Net P&amp;L {fmtINR(summary.net_pnl, { decimals: true })} · {summary.total_trades} trades · {summary.trading_days} trading days
        </p>
      </div>

      {groups.length === 0 ? (
        <Empty title="No transactions">No trades closed in this range.</Empty>
      ) : (
        <>
          <div className="sb-txn-bar">
            <Seg
              label="Order"
              value={order}
              onChange={setOrder}
              options={[
                { value: 'asc', label: 'Oldest first' },
                { value: 'desc', label: 'Latest first' },
              ]}
            />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(allOpen ? new Set() : new Set(groups.map((g) => g.date)))}>
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          </div>
          <div className="sb-txns">
            {rows.map((g) => (
              <TxnDay key={g.date} group={g} open={open.has(g.date)} forceOpen={printing} onToggle={() => toggle(g.date)} />
            ))}
          </div>
          {rows.length < groups.length && (
            <div className="sb-more">
              <span className="muted">
                Showing {rows.length} of {groups.length} days
              </span>
              <button type="button" className="btn btn--sm" onClick={() => setVisible((v) => v + 100)}>
                Show 100 more
              </button>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}
