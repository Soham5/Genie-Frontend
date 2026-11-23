#!/usr/bin/env node
/**
 * Builds the static JSON snapshot that powers the dashboard.
 *
 *   node scripts/build-data.mjs [--logs <dir>] [--repo <dir>] [--out <dir>]
 *
 * Reads the Genie structlog JSONL files (logs/ec2/*.jsonl) plus the backtest report
 * and emits a sanitised, allow-listed dataset under public/data. Broker identifiers,
 * raw broker positions, tracebacks, request ids and IPs are deliberately never copied,
 * because the output is published on a public GitHub Pages site.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith('--') ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []),
)
const repoDir = path.resolve(args.repo ?? path.join(here, '..', '..', 'Genie'))
const logsDir = path.resolve(args.logs ?? path.join(repoDir, 'logs', 'ec2'))
const outDir = path.resolve(args.out ?? path.join(here, '..', 'public', 'data'))

// Approved/managed strategies carry a version suffix (nifty_straddle_v5); everything else is the research lane.
const MANAGED_RE = /_v\d+$/
const NOISY = new Set([
  'nse_circuit_primary_dormant',
  'websocket_heartbeat_timeout',
  'websocket_token_stall_started',
  'websocket_token_stall_recovered',
  'candles_fetch_empty',
  'auth_bypass_enabled',
  'nse_option_chain_pnsea_fallback_success',
])
const FEED_INFO = new Set([
  'papertrade_entry',
  'papertrade_exit',
  'kill_switch_activated',
  'market_open_sequence_complete',
  'market_close_sequence_complete',
  'papertrade_runner_started',
  'papertrade_runner_stopped',
  'premarket_snapshot_built',
  'pre_open_recon_clean',
  'eod_reconcile_ok',
  'circuit_reduced',
  'circuit_reducing',
  'nse_circuit_recovered',
  'websocket_reconnected',
  'app_starting',
  'sigterm_received_initiating_graceful_shutdown',
  'manual_status_override',
  'strategy_deployment_created',
  'papertrade_risk_stack_toggled',
  'broker_connected',
])
const DROP_KEYS = new Set([
  'event', 'level', 'logger', 'timestamp', 'exception', 'request_id', 'path', 'method', 'subject', 'role', 'client_id',
  'positions', 'broker_open', 'internal_open', 'symbol_drift', 'ts', 'git_commit', 'build_timestamp',
])

const COMPONENTS = [
  ['app.engines.papertrade_engine', 'Paper Trading'],
  ['app.engines', 'Engine'],
  ['app.data.nse_provider', 'NSE Provider'],
  ['app.data.resilience', 'NSE Provider'],
  ['app.data.option_chain_snapshot', 'Option Chain'],
  ['app.data.vix_provider', 'Market Data'],
  ['app.data', 'Market Data'],
  ['app.broker.angel_one.market_data', 'Market Data'],
  ['app.broker.angel_one.websocket', 'WebSocket'],
  ['app.broker', 'Broker'],
  ['app.risk', 'Risk'],
  ['app.kpi', 'KPI'],
  ['app.strategies', 'Strategies'],
  ['app.context', 'Premarket'],
  ['app.main', 'Scheduler'],
  ['app.api', 'API'],
]
const componentOf = (logger = '') => COMPONENTS.find(([p]) => logger.startsWith(p))?.[1] ?? 'Other'

const round = (n, d = 2) => (n == null || Number.isNaN(+n) ? null : Math.round(+n * 10 ** d) / 10 ** d)
const hhmmss = (ts) => ts.slice(11, 19)
const sanitize = (s) => String(s).replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '•.•.•.•').replace(/\s+/g, ' ')

function describe(d) {
  const parts = []
  for (const [k, v] of Object.entries(d)) {
    if (DROP_KEYS.has(k) || v == null || typeof v === 'object') continue
    parts.push(`${k}=${typeof v === 'number' ? round(v, 4) : v}`)
  }
  if (typeof d.exception === 'string') {
    const last = d.exception.trim().split('\n').filter(Boolean).pop() ?? ''
    parts.push(`cause=${last.slice(0, 140)}`)
  }
  return sanitize(parts.join(' ')).slice(0, 220)
}

function categorizeBlock(reason = '') {
  if (/cooldown/i.test(reason)) return 'Cooldown'
  if (/daily trade cap/i.test(reason)) return 'Daily trade cap'
  if (/circuit breaker/i.test(reason)) return 'Circuit breaker'
  if (/loss budget/i.test(reason)) return 'Daily loss budget'
  if (/ban/i.test(reason)) return 'F&O ban list'
  return 'Other'
}

const emptyDay = (date) => ({
  date,
  firstTs: null,
  lastTs: null,
  counts: { events: 0, info: 0, warning: 0, error: 0, critical: 0 },
  cycles: [],
  vix: [],
  chain: [],
  trades: [],
  riskBlocks: [],
  riskSizing: [],
  issues: {},
  feed: [],
  components: {},
  nse: { fallbackSuccess: 0, callFailed: 0, circuitOpen: 0, circuitRecovered: 0, circuitDormant: 0, halfOpen: 0 },
  ws: { connected: 0, heartbeatTimeouts: 0, stallStarted: 0, stallRecovered: 0, reconnects: 0, errors: 0 },
  broker: { fillPollFailures: 0, candleFetchEmpty: 0, candleCircuitOpened: 0, rateLimited: 0, sessions: 0 },
  killSwitch: [],
  recon: [],
  premarket: null,
  scheduler: {},
  preTrade: { passed: 0, blocked: 0 },
  postTradeWarnings: 0,
  kpi: [],
  modes: new Set(),
})

const LOT_SIZES = { NIFTY: 65, BANKNIFTY: 30, FINNIFTY: 60, MIDCPNIFTY: 120 }
const MONTHS = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' }
const OPT_SYMBOL = /^([A-Z]+?)(\d{2})([A-Z]{3})(\d{2})(\d+)(CE|PE)$/
const LEG_RE = /"(BUY|SELL)", "option_type": "(CE|PE)", "strike": (\d+), "lot_size": (\d+), "price": ([\d.]+), "symbol": "([A-Z0-9]+)"/g
// SQLAlchemy echoes the INSERT of an opened F&O position: (UUID, strategy, symbol, side, qty, ..., datetime(...), date, '<meta json>').
const SQL_POSITION = /UUID\('[^']+'\), '([^']+)', '([^']+)', '(?:BUY|SELL)', (\d+), [\d.]+,.*?datetime\.datetime\((\d+), (\d+), (\d+), (\d+), (\d+), (\d+)/

/** Pulls whatever leg detail survives SQLAlchemy's parameter truncation (long meta values lose their middle). */
function parseSqlPosition(ev) {
  if (!ev.includes('option_type')) return null
  const m = ev.match(SQL_POSITION)
  if (!m) return null
  const [, strategy, symbol, qty, y, mo, d, h, mi, s] = m
  const legs = [...ev.matchAll(LEG_RE)].map((x) => {
    const sym = OPT_SYMBOL.exec(x[6])
    return {
      action: x[1], type: x[2], strike: Number(x[3]), lotSize: Number(x[4]), price: Number(x[5]), symbol: x[6],
      underlying: sym?.[1] ?? null,
      expiry: sym ? `20${sym[4]}-${MONTHS[sym[3]] ?? '01'}-${sym[2]}` : null,
    }
  })
  const credit = ev.match(/"net_credit": ([\d.]+)/)
  const pad = (n) => String(n).padStart(2, '0')
  return {
    strategy, symbol, qty: Number(qty), date: `${y}-${pad(mo)}-${pad(d)}`, sec: Number(h) * 3600 + Number(mi) * 60 + Number(s),
    legs, netCredit: credit ? Number(credit[1]) : null,
  }
}

const flip = (a) => (a === 'BUY' ? 'SELL' : 'BUY')
const swapType = (sym, from, to) => (sym ? sym.replace(new RegExp(`${from}$`), to) : null)

/**
 * Builds the F&O leg table for an entry. Every leg carries `source`:
 *   logged  – printed in full in the log
 *   derived – recomputed from the logged net credit and the strategy's structure
 *   unknown – the structure says the leg exists but its strike/price was truncated out of the log
 */
function buildLegs(entry, sql) {
  const sym = entry.symbol
  const qty = entry.qty
  const logged = sql?.legs ?? []
  const first = logged[0]
  const underlying = first?.underlying ?? (/^(BANKNIFTY|NIFTY|FINNIFTY|MIDCPNIFTY)/.exec(sym)?.[1] ?? null)
  if (!underlying && !logged.length) return null
  const lotSize = first?.lotSize ?? LOT_SIZES[underlying] ?? 1
  const expiry = first?.expiry ?? null
  const credit = sql?.netCredit ?? null
  const mk = (no, action, type, strike, price, symbol, source) => ({ no, action, type, strike, price, symbol, qty, lots: Math.round((qty / lotSize) * 100) / 100, source })
  const known = (l, no, source = 'logged') => mk(no, l.action, l.type, l.strike, l.price, l.symbol, source)
  const r2 = (n) => Math.round(n * 100) / 100
  let legs = []

  if (/STRADDLE/.test(sym) && logged.length === 1 && credit != null) {
    const pe = logged[0]
    const ce = { ...pe, type: pe.type === 'PE' ? 'CE' : 'PE', price: r2(credit - pe.price), symbol: swapType(pe.symbol, pe.type, pe.type === 'PE' ? 'CE' : 'PE') }
    legs = pe.type === 'PE' ? [known(ce, 1, 'derived'), known(pe, 2)] : [known(pe, 1), known(ce, 2, 'derived')]
  } else if (/CREDIT_SPREAD/.test(sym) && logged.length === 1 && credit != null) {
    const hedge = logged[0]
    legs = [mk(1, flip(hedge.action), hedge.type, null, r2(credit + hedge.price), null, 'derived'), known(hedge, 2)]
  } else if (/IRON_CONDOR/.test(sym)) {
    const byNo = [mk(1, 'SELL', 'CE', null, null, null, 'unknown'), mk(2, 'BUY', 'CE', null, null, null, 'unknown'), mk(3, 'SELL', 'PE', null, null, null, 'unknown'), mk(4, 'BUY', 'PE', null, null, null, 'unknown')]
    for (const l of logged) {
      const slot = byNo.findIndex((x) => x.action === l.action && x.type === l.type && x.source === 'unknown')
      if (slot >= 0) byNo[slot] = known(l, slot + 1)
    }
    legs = byNo
  } else if (logged.length) {
    legs = logged.map((l, i) => known(l, i + 1))
  } else if (/^(BANKNIFTY|NIFTY)_(CE|PE)$/.test(sym)) {
    // Single-leg option buy (range-breakout scalp): the strike is chosen at fill time and not logged.
    legs = [mk(1, entry.action, sym.slice(-2), null, entry.entryPrice, null, 'derived')]
  } else {
    return null
  }
  return { underlying, expiry, netCredit: credit, lotSize, legs }
}

function parseLogs() {
  const days = new Map()
  const sqlPositions = [] // F&O position inserts, matched to entries once the file is read
  const get = (date) => days.get(date) ?? days.set(date, emptyDay(date)).get(date)
  const pendingEntries = [] // chronological across files, matched FIFO on exit
  const files = fs.readdirSync(logsDir).filter((f) => f.endsWith('.jsonl')).sort()

  for (const file of files) {
    const text = fs.readFileSync(path.join(logsDir, file), 'utf8')
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      let d
      try { d = JSON.parse(line) } catch { continue }
      const ts = d.timestamp
      if (typeof ts !== 'string' || ts.length < 19) continue
      const logger = String(d.logger ?? '')
      const ev = String(d.event ?? '')
      const date = ts.slice(0, 10)
      const day = get(date)
      const t = hhmmss(ts)
      day.firstTs ??= t
      day.lastTs = t

      if (logger.startsWith('sqlalchemy')) {
        const p = parseSqlPosition(ev)
        if (p) sqlPositions.push(p)
        continue
      }
      if (logger.startsWith('apscheduler')) {
        const m = ev.match(/^Running job "(\w+)/)
        if (m) day.scheduler[m[1]] = (day.scheduler[m[1]] ?? 0) + 1
        continue
      }

      const level = ['info', 'warning', 'error', 'critical'].includes(d.level) ? d.level : 'info'
      day.counts.events++
      day.counts[level]++
      const comp = componentOf(logger)
      const c = (day.components[comp] ??= { events: 0, warnings: 0, errors: 0 })
      c.events++
      if (level === 'warning') c.warnings++
      if (level === 'error' || level === 'critical') c.errors++

      if (level !== 'info') {
        const key = `${level}|${ev}`
        const issue = (day.issues[key] ??= { event: ev, level, component: comp, count: 0, first: t, last: t, sample: describe(d) })
        issue.count++
        issue.last = t
      }
      if ((level !== 'info' && !NOISY.has(ev)) || FEED_INFO.has(ev)) {
        if (day.feed.length < 400) day.feed.push({ t, level, event: ev, component: comp, msg: describe(d) })
      }

      switch (ev) {
        case 'papertrade_cycle_completed':
        case 'papertrade_research_cycle_completed':
          day.cycles.push({
            t,
            kind: ev === 'papertrade_cycle_completed' ? 'managed' : 'research',
            strategies: d.strategies ?? 0,
            scanned: d.symbols_scanned ?? 0,
            entries: d.entries ?? 0,
            exits: d.exits ?? 0,
            blocked: d.risk_blocked ?? 0,
            errors: d.errors ?? 0,
            unavailable: d.data_unavailable ?? 0,
            circuits: d.candle_circuits_open ?? 0,
          })
          break
        case 'india_vix_refreshed':
          if (typeof d.vix === 'number') day.vix.push({ t, v: round(d.vix, 3) })
          break
        case 'option_snapshot_persisted':
          day.chain.push({ t, index: d.index, expiry: d.expiry, strikes: d.strikes, pcr: round(d.pcr, 4), maxPain: d.max_pain })
          break
        case 'papertrade_entry':
          pendingEntries.push({
            date, t, strategy: d.strategy_id, symbol: d.symbol, exchange: d.exchange, action: d.action,
            qty: d.qty, entryPrice: d.fill_price, stopLoss: d.stop_loss, target: d.target, initialRisk: d.initial_risk,
          })
          break
        case 'papertrade_exit': {
          const i = pendingEntries.findIndex((e) => e.strategy === d.strategy_id && e.symbol === d.symbol)
          const entry = i >= 0 ? pendingEntries.splice(i, 1)[0] : null
          day.trades.push({
            id: `${date}-${d.strategy_id}-${t}`,
            strategy: d.strategy_id,
            lane: MANAGED_RE.test(d.strategy_id) ? 'managed' : 'research',
            symbol: d.symbol,
            exchange: entry?.exchange ?? null,
            action: entry?.action ?? null,
            qty: d.qty,
            entryDate: entry?.date ?? null,
            entryT: entry?.t ?? null,
            exitDate: date,
            exitT: t,
            entryPrice: d.entry_price,
            exitPrice: d.exit_price,
            stopLoss: entry?.stopLoss ?? null,
            target: entry?.target ?? null,
            initialRisk: entry?.initialRisk ?? null,
            reason: d.reason,
            gross: d.gross_pnl,
            brokerage: d.brokerage,
            stt: d.stt,
            exchCharges: d.exchange_charges,
            gst: d.gst,
            slippage: d.slippage,
            net: d.net_pnl,
            circuitState: d.circuit_state,
            status: 'closed',
          })
          break
        }
        case 'papertrade_risk_blocked':
          day.riskBlocks.push({ t, strategy: d.strategy_id, symbol: d.symbol, reason: String(d.reason ?? '').slice(0, 160), category: categorizeBlock(d.reason) })
          break
        case 'pre_trade_passed':
          day.preTrade.passed++
          day.riskSizing.push({
            t, strategy: d.strategy_id, mode: d.risk_mode, capital: d.capital, riskBudget: d.risk_budget,
            finalQty: d.final_qty, finalRisk: d.final_risk, openRisk: d.portfolio_open_risk, riskLimit: d.portfolio_risk_limit,
            dailyLossRemaining: d.daily_loss_budget_remaining,
          })
          break
        case 'pre_trade_blocked':
          day.preTrade.blocked++
          break
        case 'papertrade_post_trade_warning':
          day.postTradeWarnings++
          break
        case 'nse_option_chain_pnsea_fallback_success': day.nse.fallbackSuccess++; break
        case 'nse_call_failed': day.nse.callFailed++; break
        case 'nse_circuit_open': day.nse.circuitOpen++; break
        case 'nse_circuit_recovered': day.nse.circuitRecovered++; break
        case 'nse_circuit_primary_dormant': day.nse.circuitDormant++; break
        case 'nse_circuit_half_open': day.nse.halfOpen++; break
        case 'websocket_connected': day.ws.connected++; break
        case 'websocket_heartbeat_timeout': day.ws.heartbeatTimeouts++; break
        case 'websocket_token_stall_started': day.ws.stallStarted++; break
        case 'websocket_token_stall_recovered': day.ws.stallRecovered++; break
        case 'websocket_reconnected': day.ws.reconnects++; break
        case 'websocket_error': day.ws.errors++; break
        case 'fill_poll_orderbook_failed': day.broker.fillPollFailures++; break
        case 'candles_fetch_empty': day.broker.candleFetchEmpty++; break
        case 'candle_circuit_opened': day.broker.candleCircuitOpened++; break
        case 'rate_limited_retrying': day.broker.rateLimited++; break
        case 'broker_session_created': day.broker.sessions++; break
        case 'kill_switch_activated':
          day.killSwitch.push({ t, reason: sanitize(d.reason ?? ''), by: d.activated_by ?? 'UNKNOWN' })
          break
        case 'pre_open_recon_clean': day.recon.push({ t, kind: 'pre-open', ok: true, detail: 'Broker and internal positions agree' }); break
        case 'pre_open_recon_stale_positions': day.recon.push({ t, kind: 'pre-open', ok: false, detail: `${d.count ?? '?'} stale broker position(s) carried over` }); break
        case 'eod_reconcile_ok': day.recon.push({ t, kind: 'eod', ok: true, detail: `PnL discrepancy ₹${round(d.discrepancy ?? 0)} (tol ₹${d.tolerance})` }); break
        case 'intraday_recon_ok': day.recon.push({ t, kind: 'intraday', ok: true, detail: 'Positions reconciled' }); break
        case 'intraday_recon_mismatch': day.recon.push({ t, kind: 'intraday', ok: false, detail: `Position drift on ${d.symbol_drift?.length ?? '?'} symbol(s); PnL gap ₹${round(d.pnl_discrepancy ?? 0)}` }); break
        case 'pnl_discrepancy': day.recon.push({ t, kind: 'eod', ok: false, detail: `PnL discrepancy ₹${round(d.discrepancy)} exceeds tolerance ₹${d.tolerance}` }); break
        case 'premarket_snapshot_built':
          day.premarket = { regime: d.regime, vix: round(d.vix, 2), vixState: d.vix_state, fnoBan: d.fno_ban_count, tradable: d.tradable }
          break
        case 'kpi_computed':
          day.kpi.push({ strategy: d.strategy_id, mode: d.mode, trades: d.total_trades, net: d.net_pnl })
          break
        case 'market_open_sequence_complete': if (d.mode) day.modes.add(d.mode); break
        default:
      }
    }
  }

  // Entries that never saw an exit are still-open positions (attributed to their entry day).
  for (const e of pendingEntries) {
    get(e.date).trades.push({
      id: `${e.date}-${e.strategy}-${e.t}-open`,
      strategy: e.strategy, lane: MANAGED_RE.test(e.strategy) ? 'managed' : 'research', symbol: e.symbol,
      exchange: e.exchange, action: e.action, qty: e.qty, entryDate: e.date, entryT: e.t, exitDate: null, exitT: null,
      entryPrice: e.entryPrice, exitPrice: null, stopLoss: e.stopLoss, target: e.target, initialRisk: e.initialRisk,
      reason: null, gross: null, brokerage: null, stt: null, exchCharges: null, gst: null, slippage: null, net: null,
      circuitState: null, status: 'open',
    })
  }
  // Attach F&O leg tables (legs, underlying, expiry, net credit) to every trade with a recoverable structure.
  const toSec = (t) => { const [h, m, s] = t.split(':').map(Number); return h * 3600 + m * 60 + s }
  for (const day of days.values()) {
    for (const tr of day.trades) {
      if (!tr.entryDate || !tr.entryT || tr.exchange !== 'NFO') continue
      const es = toSec(tr.entryT)
      const sql = sqlPositions.find((p) => p.strategy === tr.strategy && p.symbol === tr.symbol && p.date === tr.entryDate && Math.abs(p.sec - es) <= 5)
      const built = buildLegs({ symbol: tr.symbol, qty: tr.qty, action: tr.action, entryPrice: tr.entryPrice }, sql)
      if (built) Object.assign(tr, built)
    }
  }
  return days
}

function finalizeDay(day) {
  const closed = day.trades.filter((t) => t.status === 'closed')
  const net = closed.reduce((s, t) => s + t.net, 0)
  const wins = closed.filter((t) => t.net > 0).length
  const managedCycles = day.cycles.filter((c) => c.kind === 'managed')
  const hasSession = day.cycles.length > 0
  const vixVals = day.vix.map((v) => v.v)
  const issues = Object.values(day.issues).sort((a, b) => b.count - a.count)
  const status = day.counts.critical > 0 || day.killSwitch.length ? 'incident' : day.counts.error > 0 ? 'degraded' : hasSession ? 'healthy' : 'idle'
  return {
    ...day,
    modes: [...day.modes],
    issues,
    summary: {
      date: day.date,
      status,
      hasSession,
      firstTs: day.firstTs,
      lastTs: day.lastTs,
      events: day.counts.events,
      warnings: day.counts.warning,
      errors: day.counts.error + day.counts.critical,
      cycles: managedCycles.length,
      researchCycles: day.cycles.length - managedCycles.length,
      entries: day.trades.length,
      exits: closed.length,
      open: day.trades.length - closed.length,
      wins,
      net: round(net),
      gross: round(closed.reduce((s, t) => s + t.gross, 0)),
      costs: round(closed.reduce((s, t) => s + t.brokerage + t.stt + t.exchCharges + t.gst, 0)),
      riskBlocks: day.riskBlocks.length,
      killSwitch: day.killSwitch.length,
      vixOpen: vixVals[0] ?? null,
      vixClose: vixVals.at(-1) ?? null,
      vixHigh: vixVals.length ? Math.max(...vixVals) : null,
      regime: day.premarket?.regime ?? null,
      mode: day.modes.has('live') ? 'live' : 'paper',
    },
  }
}

function parseBacktest() {
  const summaryPath = path.join(repoDir, 'backtest_2yr_summary.json')
  const reportPath = path.join(repoDir, 'BACKTEST_2YR_COMPREHENSIVE_REPORT.md')
  const summary = fs.existsSync(summaryPath) ? JSON.parse(fs.readFileSync(summaryPath, 'utf8')) : null
  const rows = []
  const walkForward = []
  if (fs.existsSync(reportPath)) {
    const md = fs.readFileSync(reportPath, 'utf8')
    const section = md.split('### Individual Strategy Performance')[1]?.split('**Legend')[0] ?? ''
    const parse = (s) => (/^[-+]?[\d,]+(\.\d+)?%?$/.test(s.trim()) ? Number(s.replace(/[,%+]/g, '')) : null)
    for (const line of section.split('\n')) {
      const m = line.match(/^\|\s*\*\*(\w+)\*\*\s*\|\s*([^|]+)\|(.*)\|[^|]*\|\s*$/)
      if (!m) continue
      const cells = m[3].split('|').map((c) => c.trim())
      if (cells.length < 7) continue
      const [trades, winRate, payoff, sharpe, profitFactor, maxDrawdownPct, netPnl] = cells.map(parse)
      rows.push({ id: m[1], type: m[2].trim(), trades, winRate, payoff, sharpe, profitFactor, maxDrawdownPct, netPnl })
    }
    const wfSection = md.split('In-Sample Sharpe')[1]?.split('\n\n')[0] ?? ''
    for (const line of wfSection.split('\n')) {
      const m = line.match(/^\|\s*(\w+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/)
      if (m) walkForward.push({ id: m[1], inSample: Number(m[2]), outOfSample: Number(m[3]) })
    }
  }
  return { summary, rows, walkForward }
}

function main() {
  if (!fs.existsSync(logsDir)) {
    console.error(`Log directory not found: ${logsDir}`)
    process.exit(1)
  }
  const raw = parseLogs()
  const days = [...raw.keys()].sort().map((d) => finalizeDay(raw.get(d)))

  fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(path.join(outDir, 'days'), { recursive: true })

  // Hold back days that carry no information (a handful of boot lines).
  const kept = days.filter((d) => d.counts.events >= 5 || d.cycles.length || d.trades.length)
  for (const { summary: _summary, ...detail } of kept) {
    fs.writeFileSync(path.join(outDir, 'days', `${detail.date}.json`), JSON.stringify(detail))
  }

  const sortKey = (t) => `${t.exitDate ?? t.entryDate}${t.exitT ?? t.entryT}`
  const allTrades = kept.flatMap((d) => d.trades).sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const latest = kept.filter((d) => d.summary.hasSession).at(-1)?.date ?? kept.at(-1)?.date

  const issueTotals = {}
  const incidents = []
  for (const d of kept) {
    for (const i of d.issues) {
      const k = `${i.level}|${i.event}`
      const g = (issueTotals[k] ??= { event: i.event, level: i.level, component: i.component, count: 0, days: 0, lastDate: d.date, sample: i.sample })
      g.count += i.count
      g.days++
      g.lastDate = d.date
    }
    for (const k of d.killSwitch) incidents.push({ date: d.date, t: k.t, kind: 'kill-switch', severity: 'critical', title: `Kill switch: ${k.reason}`, detail: `Activated by ${k.by}` })
    for (const r of d.recon.filter((x) => !x.ok)) incidents.push({ date: d.date, t: r.t, kind: 'reconciliation', severity: 'critical', title: `${r.kind} reconciliation failed`, detail: r.detail })
    for (const key of ['websocket_error', 'kill_switch_square_off_failed', 'candle_circuit_opened', 'papertrade_open_positions_restore_failed', 'papertrade_reconcile_db_error']) {
      const i = d.issues.find((x) => x.event === key)
      if (i) incidents.push({ date: d.date, t: i.first, kind: 'infrastructure', severity: i.level === 'critical' ? 'critical' : 'high', title: `${key.replaceAll('_', ' ')}${i.count > 1 ? ` ×${i.count}` : ''}`, detail: i.sample })
    }
  }
  incidents.sort((a, b) => `${b.date}${b.t}`.localeCompare(`${a.date}${a.t}`))

  const index = {
    generatedAt: new Date().toISOString(),
    source: { logFiles: fs.readdirSync(logsDir).filter((f) => f.endsWith('.jsonl')).length, firstDate: kept[0]?.date, lastDate: kept.at(-1)?.date },
    latestSession: latest,
    days: kept.map((d) => d.summary),
    issueTotals: Object.values(issueTotals).sort((a, b) => b.count - a.count).slice(0, 60),
    incidents: incidents.slice(0, 150),
  }
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index))
  fs.writeFileSync(path.join(outDir, 'trades.json'), JSON.stringify(allTrades))
  fs.writeFileSync(path.join(outDir, 'backtest.json'), JSON.stringify(parseBacktest()))

  const bytes = fs.readdirSync(outDir, { recursive: true }).reduce((s, f) => {
    const p = path.join(outDir, f)
    return s + (fs.statSync(p).isFile() ? fs.statSync(p).size : 0)
  }, 0)
  console.log(`Wrote ${kept.length} day files, ${allTrades.length} trades, ${(bytes / 1e6).toFixed(2)} MB → ${outDir}`)
}

main()
