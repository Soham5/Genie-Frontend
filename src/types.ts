export type Level = 'info' | 'warning' | 'error' | 'critical'
export type DayStatus = 'healthy' | 'degraded' | 'incident' | 'idle'
export type Lane = 'managed' | 'research'

export interface DaySummary {
  date: string
  status: DayStatus
  hasSession: boolean
  firstTs: string | null
  lastTs: string | null
  events: number
  warnings: number
  errors: number
  cycles: number
  researchCycles: number
  entries: number
  exits: number
  open: number
  wins: number
  net: number
  gross: number
  costs: number
  riskBlocks: number
  killSwitch: number
  vixOpen: number | null
  vixClose: number | null
  vixHigh: number | null
  regime: string | null
  mode: 'paper' | 'live'
}

export interface IssueTotal {
  event: string
  level: Level
  component: string
  count: number
  days: number
  lastDate: string
  sample: string
}

export interface Incident {
  date: string
  t: string
  kind: 'kill-switch' | 'reconciliation' | 'infrastructure'
  severity: 'critical' | 'high'
  title: string
  detail: string
}

export interface DataIndex {
  generatedAt: string
  source: { logFiles: number; firstDate: string; lastDate: string }
  latestSession: string
  days: DaySummary[]
  issueTotals: IssueTotal[]
  incidents: Incident[]
}

export interface Trade {
  id: string
  strategy: string
  lane: Lane
  symbol: string
  exchange: string | null
  action: 'BUY' | 'SELL' | string | null
  qty: number
  entryDate: string | null
  entryT: string | null
  exitDate: string | null
  exitT: string | null
  entryPrice: number
  exitPrice: number | null
  stopLoss: number | null
  target: number | null
  initialRisk: number | null
  reason: string | null
  gross: number | null
  brokerage: number | null
  stt: number | null
  exchCharges: number | null
  gst: number | null
  slippage: number | null
  net: number | null
  circuitState: string | null
  status: 'open' | 'closed'
}

export interface ClosedTrade extends Trade {
  exitDate: string
  exitT: string
  gross: number
  net: number
  brokerage: number
  stt: number
  exchCharges: number
  gst: number
  slippage: number
}

export interface Cycle {
  t: string
  kind: Lane
  strategies: number
  scanned: number
  entries: number
  exits: number
  blocked: number
  errors: number
  unavailable: number
  circuits: number
}

export interface ChainPoint {
  t: string
  index: 'NIFTY' | 'BANKNIFTY' | string
  expiry: string
  strikes: number
  pcr: number
  maxPain: number
}

export interface RiskBlock {
  t: string
  strategy: string
  symbol: string
  reason: string
  category: string
}

export interface RiskSizing {
  t: string
  strategy: string
  mode: string
  capital: number
  riskBudget: number
  finalQty: number
  finalRisk: number
  openRisk: number
  riskLimit: number
  dailyLossRemaining: number
}

export interface Issue {
  event: string
  level: Level
  component: string
  count: number
  first: string
  last: string
  sample: string
}

export interface FeedEvent {
  t: string
  level: Level
  event: string
  component: string
  msg: string
}

export interface ReconEntry {
  t: string
  kind: 'pre-open' | 'intraday' | 'eod'
  ok: boolean
  detail: string
}

export interface DayDetail {
  date: string
  firstTs: string | null
  lastTs: string | null
  counts: { events: number; info: number; warning: number; error: number; critical: number }
  cycles: Cycle[]
  vix: { t: string; v: number }[]
  chain: ChainPoint[]
  trades: Trade[]
  riskBlocks: RiskBlock[]
  riskSizing: RiskSizing[]
  issues: Issue[]
  feed: FeedEvent[]
  components: Record<string, { events: number; warnings: number; errors: number }>
  nse: { fallbackSuccess: number; callFailed: number; circuitOpen: number; circuitRecovered: number; circuitDormant: number; halfOpen: number }
  ws: { connected: number; heartbeatTimeouts: number; stallStarted: number; stallRecovered: number; reconnects: number; errors: number }
  broker: { fillPollFailures: number; candleFetchEmpty: number; candleCircuitOpened: number; rateLimited: number; sessions: number }
  killSwitch: { t: string; reason: string; by: string }[]
  recon: ReconEntry[]
  premarket: { regime: string; vix: number; vixState: string; fnoBan: number; tradable: boolean } | null
  scheduler: Record<string, number>
  preTrade: { passed: number; blocked: number }
  postTradeWarnings: number
  kpi: { strategy: string; mode: string; trades: number; net: number }[]
  modes: string[]
}

export interface BacktestRow {
  id: string
  type: string
  trades: number | null
  winRate: number | null
  payoff: number | null
  sharpe: number | null
  profitFactor: number | null
  maxDrawdownPct: number | null
  netPnl: number | null
}

export interface BacktestData {
  summary: {
    timestamp: string
    period: string
    data_type: string
    strategies_tested: number
    strategies_approved: number
    total_trades: number
    portfolio_net_pnl: number
    portfolio_win_rate: number
    approved_strategy: { name: string }
    stress_testing_results: { monte_carlo: string; walk_forward: string; parameter_sensitivity: string }
  } | null
  rows: BacktestRow[]
  walkForward: { id: string; inSample: number; outOfSample: number }[]
}
