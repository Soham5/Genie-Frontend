export type Segment = 'Equity intraday' | 'Swing' | 'F&O'

export interface StrategyMeta {
  /** Backtest report id (also the canonical base id). */
  id: string
  name: string
  className: string
  segment: Segment
  summary: string
  /** Strategy ids seen in the live/paper logs that map to this entry (version/test suffixes stripped). */
  liveBase?: string[]
}

export const CATALOG: StrategyMeta[] = [
  { id: 'ema_momentum', name: 'EMA Momentum Breakout', className: 'EMAMomentumBreakout', segment: 'Equity intraday', summary: 'Momentum breakout confirmed by EMA stack and volume spike.', liveBase: ['ema_momentum'] },
  { id: 'orb_breakout', name: 'Opening Range Breakout', className: 'ORBBreakout', segment: 'Equity intraday', summary: 'Trades breaks of the opening-range high/low with volume filter.', liveBase: ['orb_breakout'] },
  { id: 'supertrend_rsi', name: 'Supertrend + RSI', className: 'SupertrendRSI', segment: 'Equity intraday', summary: 'Trend-following on Supertrend flips gated by RSI.', liveBase: ['supertrend_rsi'] },
  { id: 'vwap_reversion', name: 'VWAP Mean Reversion', className: 'VWAPMeanReversion', segment: 'Equity intraday', summary: 'Fades stretches away from VWAP back toward the mean.', liveBase: ['vwap_reversion'] },
  { id: 'vwap_pullback_trend', name: 'VWAP Pullback Trend', className: 'VWAPPullbackTrend', segment: 'Equity intraday', summary: 'Buys pullbacks to VWAP inside an established intraday trend.', liveBase: ['vwap_pullback_trend'] },
  { id: 'swing_ema_trend', name: 'Swing EMA Trend', className: 'SwingEMATrend', segment: 'Swing', summary: 'Multi-day trend following on EMA 20/50 alignment.', liveBase: ['swing_ema_trend'] },
  { id: 'swing_pullback', name: 'Swing Pullback', className: 'SwingPullback', segment: 'Swing', summary: 'Enters shallow pullbacks within a daily uptrend.', liveBase: ['swing_pullback'] },
  { id: 'swing_breakout', name: 'Swing Breakout (Donchian)', className: 'SwingBreakout', segment: 'Swing', summary: 'Donchian channel breakouts on daily bars.', liveBase: ['swing_breakout'] },
  { id: 'rsi_mean_reversion', name: 'RSI Mean Reversion', className: 'RSIMeanReversion', segment: 'Swing', summary: 'Connors RSI(2) oversold bounce within a long-term uptrend.', liveBase: ['rsi_mean_reversion'] },
  { id: 'bollinger_squeeze', name: 'Bollinger Squeeze Breakout', className: 'BollingerSqueezeBreakout', segment: 'Swing', summary: 'Volatility contraction followed by band expansion breakout.', liveBase: ['bollinger_squeeze'] },
  { id: 'nifty_short_straddle', name: 'Nifty Short Straddle', className: 'ShortStraddle', segment: 'F&O', summary: 'Sells the ATM Nifty CE+PE at 09:30 when India VIX < 22.', liveBase: ['nifty_straddle'] },
  { id: 'banknifty_iron_condor', name: 'Bank Nifty Iron Condor', className: 'BankNiftyIronCondor', segment: 'F&O', summary: 'Defined-risk premium selling with OTM wings on Bank Nifty.', liveBase: ['banknifty_condor'] },
  { id: 'banknifty_range_scalp', name: 'Bank Nifty Range Breakout Scalp', className: 'RangeBreakoutScalp', segment: 'F&O', summary: 'Trades the break of the first-15-minute Bank Nifty range.', liveBase: ['banknifty_scalp'] },
  { id: 'nifty_credit_spread', name: 'Nifty Credit Spread', className: 'ATMHedgedCreditSpread', segment: 'F&O', summary: 'Directional vertical credit spread: sell ATM, buy OTM hedge.', liveBase: ['nifty_credit_spread'] },
  { id: 'banknifty_credit_spread', name: 'Bank Nifty Credit Spread', className: 'ATMHedgedCreditSpread', segment: 'F&O', summary: 'Same engine as the Nifty spread, instantiated on Bank Nifty.' },
  { id: 'equity_short_strangle', name: 'Equity Monthly Short Strangle', className: 'EquityMonthlyShortStrangle', segment: 'F&O', summary: 'Monthly short strangle on single-stock F&O, held up to max_hold_days.', liveBase: ['equity_short_strangle'] },
  { id: 'nifty_option_buying', name: 'Nifty Option Buying', className: 'NiftyOptionBuying', segment: 'F&O', summary: 'Directional long-premium Nifty option strategy.', liveBase: ['nifty_option_buying'] },
]

export const baseId = (id: string) => id.replace(/_(v\d+|test)$/, '')

export function catalogFor(liveId: string): StrategyMeta | undefined {
  const b = baseId(liveId)
  return CATALOG.find((c) => c.id === b || c.liveBase?.includes(b))
}

export const PIPELINE = [
  { key: 'strategy', title: 'Strategy', blurb: 'Signals & trade intents', module: 'app/strategies' },
  { key: 'risk', title: 'Risk Engine', blurb: 'Circuit breaker · sizing', module: 'risk_manager' },
  { key: 'pretrade', title: 'Pre-Trade', blurb: 'F&O ban · position caps · loss halt', module: 'pre_trade' },
  { key: 'portfolio', title: 'Portfolio Risk', blurb: 'Aggregate exposure', module: 'portfolio_risk' },
  { key: 'compliance', title: 'Compliance', blurb: 'SEBI/NSE algo-ID · OTR · wash/spoof', module: 'compliance' },
  { key: 'kill', title: 'Kill Switch', blurb: 'Manual & automatic triggers', module: 'kill_switch' },
  { key: 'execution', title: 'Execution', blurb: 'OMS state machine · algos', module: 'engines' },
] as const

export const SCHEDULER_JOBS: Record<string, { cron: string; purpose: string }> = {
  _poll_broker_fills: { cron: 'Mon–Fri · 09–15h · every 1 min', purpose: 'Poll broker order-book for fills' },
  _snapshot_option_chains: { cron: 'Mon–Fri · 09–15h · every 3 min', purpose: 'Persist NIFTY/BANKNIFTY option-chain snapshots' },
  _refresh_vix: { cron: 'Mon–Fri · 09–15h · every 5 min', purpose: 'Refresh India VIX' },
  _scheduled_intraday_recon: { cron: 'Mon–Fri · hourly', purpose: 'Intraday broker ↔ internal reconciliation' },
  _scheduled_pre_open_recon: { cron: 'Mon–Fri · 09:10', purpose: 'Pre-open reconciliation' },
  _scheduled_premarket_build: { cron: 'Mon–Fri · 09:05', purpose: 'Premarket intelligence snapshot' },
  _scheduled_market_open_sequence: { cron: 'Mon–Fri · 09:00', purpose: 'Broker bring-up and runner start' },
  _refresh_fno_ban_list: { cron: 'Mon–Fri · 08:55', purpose: 'Refresh NSE F&O ban list' },
  _refresh_broker_token: { cron: 'Mon–Fri · 08:55', purpose: 'Refresh broker session token' },
}
