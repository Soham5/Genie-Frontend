import { Activity, BarChart3, ClipboardList, FlaskConical, Gauge, Layers, LineChart, Settings, ShieldAlert, TrendingUp, type LucideIcon } from 'lucide-react'

export interface RouteDef {
  path: string
  label: string
  icon: LucideIcon
  /** Shown in the top navbar; the rest live under "More". */
  primary: boolean
  keywords?: string
}

export const ROUTES: RouteDef[] = [
  { path: '/', label: 'Dashboard', icon: Gauge, primary: true, keywords: 'overview home funds command center' },
  { path: '/orders', label: 'Orders', icon: ClipboardList, primary: true, keywords: 'order book executed rejected trades' },
  { path: '/positions', label: 'Positions', icon: Layers, primary: true, keywords: 'legs fno options basket mtm open payoff' },
  { path: '/trading', label: 'P&L', icon: TrendingUp, primary: true, keywords: 'profit loss blotter trades analytics realised' },
  { path: '/strategies', label: 'Strategies', icon: BarChart3, primary: true, keywords: 'scorecard catalog alpha' },
  { path: '/market', label: 'Market', icon: LineChart, primary: true, keywords: 'vix pcr max pain option chain nse' },
  { path: '/risk', label: 'Risk', icon: ShieldAlert, primary: true, keywords: 'risk gate kill switch compliance circuit breaker' },
  { path: '/system', label: 'System Health', icon: Activity, primary: false, keywords: 'broker websocket scheduler runner health' },
  { path: '/backtests', label: 'Backtest Lab', icon: FlaskConical, primary: false, keywords: 'strategy backtest run simulate slippage equity curve drawdown calendar transactions csv stored results walk forward sharpe synthetic' },
  { path: '/settings', label: 'Settings', icon: Settings, primary: false, keywords: 'theme api key url connect' },
]
