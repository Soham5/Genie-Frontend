import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, Command, Moon, Sun } from 'lucide-react'
import { ROUTES } from '@/routes'
import { useApiState } from '@/api/ApiProvider'
import { ConnectionForm } from '@/api/ConnectionForm'
import { useSessionDate } from '@/api/session'
import { useTheme } from '@/hooks/useTheme'
import { useLiveBook } from '@/hooks/useLiveBook'
import { fmtDate, fmtINR, pnlTone } from '@/lib/format'
import { Badge, Dot } from '@/components/ui/Panel'
import { CommandPalette } from './CommandPalette'
import { clsx } from '@/lib/clsx'

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

export function Shell() {
  const [theme, toggleTheme] = useTheme()
  const [palette, setPalette] = useState(false)
  const loc = useLocation()
  const { status } = useApiState()
  // Until the API is configured every page would be empty, so show the connect screen instead (Settings stays reachable).
  const gated = status === 'unconfigured' && loc.pathname !== '/settings'

  useEffect(() => {
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
    <div className="shell">
      <header className="head">
        <Ticker theme={theme} toggleTheme={toggleTheme} onPalette={() => setPalette(true)} />
        <NavBar />
      </header>
      <div className="main">
        <main className="page" id="content">
          {gated ? <ConnectScreen /> : <Outlet />}
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} theme={theme} toggleTheme={toggleTheme} />
    </div>
  )
}

function ConnectScreen() {
  return (
    <div className="boot" style={{ position: 'static', minHeight: '60vh' }}>
      <div className="boot__card" style={{ textAlign: 'left', width: 'min(460px, 100%)' }}>
        <div className="boot__logo">G</div>
        <h1 style={{ margin: '12px 0 4px' }}>Connect to Genie</h1>
        <p className="muted" style={{ marginTop: 0 }}>This console reads everything from your Genie API — enter its URL and a read-only key.</p>
        <ConnectionForm />
      </div>
    </div>
  )
}

function NavBar() {
  const { search } = useLocation()
  const { kill } = useApiState()
  const [more, setMore] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const loc = useLocation()
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })

  // The navbar scrolls horizontally, which clips absolutely-positioned children, so the menu is fixed to the viewport.
  const openMore = () => {
    const r = moreRef.current?.getBoundingClientRect()
    if (r) setMenuPos({ top: r.bottom, left: Math.max(8, Math.min(r.left, window.innerWidth - 198)) })
    setMore(true)
  }

  useEffect(() => {
    setMore(false)
  }, [loc.pathname])

  useEffect(() => {
    if (!more) return
    const close = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMore(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMore(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [more])

  const link = (r: (typeof ROUTES)[number]) => (
    <NavLink key={r.path} to={{ pathname: r.path, search }} end={r.path === '/'} className={({ isActive }) => clsx('nav__link', isActive && 'active')}>
      <r.icon size={15} />
      <span>{r.label}</span>
      {r.path === '/risk' && kill?.active && <span className="nav__badge"><Badge tone="neg">HALT</Badge></span>}
    </NavLink>
  )
  const secondary = ROUTES.filter((r) => !r.primary)
  const moreActive = secondary.some((r) => r.path === loc.pathname)

  return (
    <nav className="navbar" aria-label="Primary">
      {ROUTES.filter((r) => r.primary).map(link)}
      <div
        className="nav__more"
        ref={moreRef}
        onMouseEnter={openMore}
        onMouseLeave={() => setMore(false)}
      >
        <button type="button" className={clsx('nav__link', moreActive && 'active')} aria-expanded={more} aria-haspopup="menu" onClick={openMore}>
          More <ChevronDown size={14} />
        </button>
        {more && <div className="nav__menu" role="menu" style={{ top: menuPos.top, left: menuPos.left }}>{secondary.map(link)}</div>}
      </div>
    </nav>
  )
}

function Ticker({ theme, toggleTheme, onPalette }: { theme: string; toggleTheme: () => void; onPalette: () => void }) {
  const { date, setDate, dates, today } = useSessionDate()
  const { status, error, health, kill, runner } = useApiState()
  const book = useLiveBook()
  const live = book.state === 'live'
  const mtm = live ? book.totals.open : null
  const statusLabel = { unconfigured: 'NOT CONNECTED', connecting: 'CONNECTING', online: 'LIVE', unauthorized: 'KEY REJECTED', offline: 'API DOWN' }[status]
  const apiTone = { unconfigured: undefined, connecting: 'warn', online: 'pos', unauthorized: 'neg', offline: 'neg' }[status] as 'warn' | 'pos' | 'neg' | undefined
  const idx = dates.indexOf(date)
  const step = (dir: -1 | 1) => {
    const next = dates[idx - dir]
    if (next) setDate(next)
  }

  return (
    <div className="ticker">
      <div className="brand">
        <div className="brand__mark">G</div>
        <span className="brand__name">Genie</span>
      </div>
      {health && <span className="ticker__chip hide-sm" title="Angel One broker session">BROKER <strong style={{ fontFamily: 'inherit' }}>{health.broker_connected ? 'UP' : 'DOWN'}</strong></span>}
      {runner && <span className="ticker__chip hide-sm" title="Paper-trade runner">RUNNER <strong style={{ fontFamily: 'inherit' }}>{runner.running ? 'ON' : 'OFF'}</strong></span>}
      {kill?.active && <span className="ticker__chip" title={kill.reason ?? 'Kill switch active'}><Badge tone="neg">KILL SWITCH</Badge></span>}

      <div className="topbar__spacer" />

      <span className="ticker__chip hide-sm" title={live ? 'Polling the Genie API' : error ?? book.error ?? 'Add the API URL and key in Settings.'}>
        <Dot tone={apiTone} pulse={status === 'connecting'} />
        {statusLabel}
      </span>
      <span className="hide-xs"><Badge tone="outline">PAPER</Badge></span>
      <div className="mtm" title="Live unrealised P&L across open positions">
        <span className="mtm__label">MTM</span>
        <span className={clsx('mtm__value', pnlTone(mtm))}>{mtm == null ? '—' : fmtINR(mtm, { sign: true })}</span>
      </div>

      <div className="row" role="group" aria-label="Session selector">
        <button className="btn btn--ghost btn--icon hide-xs" onClick={() => step(-1)} disabled={idx < 0 || idx >= dates.length - 1} aria-label="Previous session"><ChevronLeft size={16} /></button>
        <select className="select" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Session date" style={{ minWidth: 120, maxWidth: 170 }}>
          {(dates.includes(date) ? dates : [date, ...dates]).map((d) => (
            <option key={d} value={d}>{fmtDate(d, 'long')}{d === today ? ' · today' : ''}</option>
          ))}
        </select>
        <button className="btn btn--ghost btn--icon hide-xs" onClick={() => step(1)} disabled={idx <= 0} aria-label="Next session"><ChevronRight size={16} /></button>
      </div>

      <button className="btn btn--ghost btn--icon" onClick={onPalette} aria-label="Open command palette" title={`Search (${isMac ? '⌘' : 'Ctrl'} K)`}><Command size={16} /></button>
      <button className="btn btn--ghost btn--icon" onClick={toggleTheme} aria-label="Toggle theme">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
    </div>
  )
}
