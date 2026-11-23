import { Activity, BarChart3, FlaskConical, Gauge, LineChart, ScrollText, Settings, ShieldAlert, Target, type LucideIcon } from 'lucide-react'

export interface RouteDef {
  path: string
  label: string
  icon: LucideIcon
  group: 'Monitor' | 'Markets & Risk' | 'Operations' | 'Research' | 'Configure'
  keywords?: string
}

export const ROUTES: RouteDef[] = [
  { path: '/', label: 'Overview', icon: Gauge, group: 'Monitor', keywords: 'dashboard home command center' },
  { path: '/trading', label: 'Trading', icon: Target, group: 'Monitor', keywords: 'positions blotter pnl trades' },
  { path: '/strategies', label: 'Strategies', icon: BarChart3, group: 'Monitor', keywords: 'scorecard catalog alpha' },
  { path: '/market', label: 'Market', icon: LineChart, group: 'Markets & Risk', keywords: 'vix pcr max pain option chain nse' },
  { path: '/risk', label: 'Risk Gate', icon: ShieldAlert, group: 'Markets & Risk', keywords: 'kill switch compliance circuit breaker' },
  { path: '/system', label: 'System Health', icon: Activity, group: 'Operations', keywords: 'broker websocket scheduler resilience' },
  { path: '/logs', label: 'Event Log', icon: ScrollText, group: 'Operations', keywords: 'logs events search' },
  { path: '/backtests', label: 'Backtest Lab', icon: FlaskConical, group: 'Research', keywords: 'walk forward sharpe synthetic' },
  { path: '/about', label: 'Settings & About', icon: Settings, group: 'Configure', keywords: 'theme api provenance' },
]
