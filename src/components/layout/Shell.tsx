import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Command, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-react'
import { ROUTES } from '@/routes'
import { useSelectedDate, useStore } from '@/data/store'
import { useTheme } from '@/hooks/useTheme'
import { useLiveApi } from '@/hooks/useLiveApi'
import { fmtAgo, fmtDate } from '@/lib/format'
import { Badge, Dot } from '@/components/ui/Panel'
import { CommandPalette } from './CommandPalette'
import { clsx } from '@/lib/clsx'

const GROUPS = ['Monitor', 'Markets & Risk', 'Operations', 'Research', 'Configure'] as const
const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

export function Shell() {
  const [theme, toggleTheme] = useTheme()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('genie-nav-collapsed') === '1')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [palette, setPalette] = useState(false)
  const loc = useLocation()

  useEffect(() => {
    localStorage.setItem('genie-nav-collapsed', collapsed ? '1' : '0')
  }, [collapsed])
  useEffect(() => {
    setMobileOpen(false)
    window.scrollTo({ top: 0 })
  }, [loc.pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="shell" data-collapsed={collapsed} data-mobile-open={mobileOpen}>
      <Sidebar collapsed={collapsed} />
      {mobileOpen && <div style={{ position: 'fixed', inset: 0, zIndex: 25 }} onClick={() => setMobileOpen(false)} aria-hidden />}
      <div className="main">
        <Topbar
          theme={theme}
          toggleTheme={toggleTheme}
          collapsed={collapsed}
          onCollapse={() => setCollapsed((c) => !c)}
          onMenu={() => setMobileOpen((o) => !o)}
          onPalette={() => setPalette(true)}
        />
        <main className="page" id="content">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} theme={theme} toggleTheme={toggleTheme} />
    </div>
  )
}

function Sidebar({ collapsed }: { collapsed: boolean }) {
  const { search } = useLocation()
  const { index } = useStore()
  const latest = index.days.find((d) => d.date === index.latestSession)
  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="brand">
        <div className="brand__mark">G</div>
        <div className="brand__text">
          <div className="brand__name">Genie</div>
          <div className="brand__sub">Quant console</div>
        </div>
      </div>
      <nav className="nav">
        {GROUPS.map((g) => (
          <div key={g}>
            <div className="nav__label">{g}</div>
            {ROUTES.filter((r) => r.group === g).map((r) => (
              <NavLink
                key={r.path}
                to={{ pathname: r.path, search }}
                end={r.path === '/'}
                className={({ isActive }) => clsx('nav__link', isActive && 'active')}
                title={collapsed ? r.label : undefined}
              >
                <r.icon size={18} />
                <span className="nav__text">{r.label}</span>
                {r.path === '/system' && latest && latest.errors > 0 && <span className="nav__badge"><Badge tone="neg">{latest.errors}</Badge></span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar__foot">
        <p className="sidebar__note">Paper-trading snapshot derived from EC2 structlog output. Not investment advice.</p>
      </div>
    </aside>
  )
}

function Topbar({ theme, toggleTheme, collapsed, onCollapse, onMenu, onPalette }: {
  theme: string
  toggleTheme: () => void
  collapsed: boolean
  onCollapse: () => void
  onMenu: () => void
  onPalette: () => void
}) {
  const { index } = useStore()
  const [date, setDate] = useSelectedDate()
  const live = useLiveApi()
  const sessions = index.days.filter((d) => d.hasSession)
  const other = index.days.filter((d) => !d.hasSession)
  const cur = index.days.find((d) => d.date === date)
  const pos = sessions.findIndex((d) => d.date === date)

  const step = (dir: -1 | 1) => {
    const next = sessions[pos + dir]
    if (next) setDate(next.date)
  }

  const tone = { healthy: 'pos', degraded: 'warn', incident: 'neg', idle: 'muted' }[cur?.status ?? 'idle'] as 'pos' | 'warn' | 'neg' | 'muted'
  const label = { healthy: 'Healthy', degraded: 'Degraded', incident: 'Incident', idle: 'No session' }[cur?.status ?? 'idle']

  return (
    <header className="topbar">
      <button className="btn btn--ghost btn--icon show-sm-only" onClick={onMenu} aria-label="Open navigation"><Menu size={18} /></button>
      <button className="btn btn--ghost btn--icon hide-sm" onClick={onCollapse} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>

      <div className="row" role="group" aria-label="Session selector">
        <button className="btn btn--ghost btn--icon" onClick={() => step(-1)} disabled={pos <= 0} aria-label="Previous session"><ChevronLeft size={16} /></button>
        <select className="select" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Session date" style={{ minWidth: 150 }}>
          <optgroup label="Sessions">
            {[...sessions].reverse().map((d) => (
              <option key={d.date} value={d.date}>{fmtDate(d.date, 'long')}{d.date === index.latestSession ? ' · latest' : ''}</option>
            ))}
          </optgroup>
          <optgroup label="No trading session">
            {[...other].reverse().map((d) => (
              <option key={d.date} value={d.date}>{fmtDate(d.date, 'long')}</option>
            ))}
          </optgroup>
        </select>
        <button className="btn btn--ghost btn--icon" onClick={() => step(1)} disabled={pos < 0 || pos >= sessions.length - 1} aria-label="Next session"><ChevronRight size={16} /></button>
      </div>

      <Badge tone={tone} dot>{label}</Badge>
      <Badge tone="outline">{(cur?.mode ?? 'paper').toUpperCase()}</Badge>

      <div className="topbar__spacer" />

      <span className="muted hide-sm" style={{ fontSize: 12 }} title={`Dataset generated ${index.generatedAt}`}>
        Snapshot · {fmtAgo(index.generatedAt)}
      </span>
      {live.state !== 'off' && (
        <span className="row hide-sm" style={{ fontSize: 12 }} title={`${live.base}/api/v1/health/live`}>
          <Dot tone={live.state === 'up' ? 'pos' : live.state === 'down' ? 'neg' : 'warn'} pulse={live.state === 'checking'} />
          API {live.state}
        </span>
      )}
      <button className="btn hide-sm" onClick={onPalette} aria-label="Open command palette">
        <Command size={14} /> <span className="muted">Search</span> <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
      </button>
      <button className="btn btn--ghost btn--icon show-sm-only" onClick={onPalette} aria-label="Open command palette"><Command size={16} /></button>
      <button className="btn btn--ghost btn--icon" onClick={toggleTheme} aria-label="Toggle theme">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
    </header>
  )
}
