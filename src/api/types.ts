export type Lane = 'managed' | 'research'

export interface HealthPayload {
  status: string
  broker_connected: boolean
  last_token_refresh: string | null
  circuit_breaker: unknown
  kill_switch_active: boolean
  websocket_state: string
  scheduler: unknown
  broker_fills_ingested_total?: number
}

export interface KillStatus {
  active: boolean
  reason: string | null
  activated_at: string | null
}

export interface RunnerStatus {
  running: boolean
  cycle_in_progress: boolean
  interval_sec: number
  last_cycle_at: string | null
  last_cycle_error: string | null
  last_cycle_stats: Record<string, unknown> | null
  risk?: unknown
  kill_switch?: unknown
  risk_stack_enabled?: boolean
}

/** `/risk/session`. Most numeric fields arrive as strings — parse with `num()`. */
export interface RiskSession {
  session_date: string
  circuit_state: string
  risk_mode: string
  trades_today: number | string
  daily_pnl: number | string
  weekly_pnl: number | string
  consecutive_losses: number | string
  current_capital: number | string
  peak_capital: number | string
  cooldown_until: string | null
  open_equity_positions: number | string
  open_fno_positions: number | string
  config: {
    total_capital: number | string
    trading_capital: number | string
    risk_pct: number | string
    max_daily_loss: number | string
    max_weekly_loss: number | string
  }
}

export interface ApiTrade {
  id: string
  strategy_id: string
  deployment_mode: Lane
  symbol: string
  session_date: string
  entry_time: string | null
  exit_reason: string | null
  qty: number
  entry_price: number
  exit_price: number | null
  net_pnl: number | null
  gross_pnl: number | null
  side: string | null
  exit_time: string | null
  exchange: string | null
  stop_loss: number | null
  target: number | null
  underlying: string | null
  expiry: string | null
  net_credit: number | null
  legs: ApiTradeLeg[] | null
  charges: { brokerage?: number; stt?: number; exchange_charges?: number; gst?: number; other?: number; slippage?: number } | null
}

export interface ApiTradeLeg {
  leg_no?: number
  leg_id?: number
  action: string
  option_type: 'CE' | 'PE' | null
  strike: number | null
  lot_size?: number
  price?: number | null
  ltp?: number | null
  qty?: number
  symbol?: string | null
}

export interface TradesPayload {
  count: number
  trades: ApiTrade[]
}
