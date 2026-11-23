import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, Command, Moon, Sun } from 'lucide-react'
import { ROUTES } from '@/routes'
import { useDay, useSelectedDate, useStore } from '@/data/store'
import { useTheme } from '@/hooks/useTheme'
import { useLiveBook } from '@/hooks/useLiveBook'
import { fmtDate, fmtINR, fmtNum, pnlTone } from '@/lib/format'
import { Badge, Dot } from '@/components/ui/Panel'
import { CommandPalette } from './CommandPalette'
import { clsx } from '@/lib/clsx'

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

export function Shell() {
  const [theme, toggleTheme] = useTheme()
  const [palette, setPalette] = useState(false)
  const loc = useLocation()

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
          <Outlet />
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} theme={theme} toggleTheme={toggleTheme} />
    </div>
  )
}

function NavBar() {
  const { search } = useLocation()
  const { index } = useStore()
  const latest = index.days.find((d) => d.date === index.latestSession)
  const [more, setMore] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const loc = useLocation()

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
      {r.path === '/system' && latest && latest.errors > 0 && <span className="nav__badge"><Badge tone="neg">{latest.errors}</Badge></span>}
    </NavLink>
  )
  const secondary = ROUTES.filter((r) => !r.primary)
  const moreActive = secondary.some((r) => r.path === loc.pathname)

  return (
    <nav className="navbar" aria-label="Primary">
      {ROUTES.filter((r) => r.primary).map(link)}
      <div className="nav__more" ref={moreRef}>
        <button type="button" className={clsx('nav__link', moreActive && 'active')} aria-expanded={more} aria-haspopup="menu" onClick={() => setMore((m) => !m)}>
          More <ChevronDown size={14} />
        </button>
        {more && <div className="nav__menu" role="menu">{secondary.map(link)}</div>}
      </div>
    </nav>
  )
}

function Ticker({ theme, toggleTheme, onPalette }: { theme: string; toggleTheme: () => void; onPalette: () => void }) {
  const { index } = useStore()
  const [date, setDate] = useSelectedDate()
  const { day } = useDay(date)
  const book = useLiveBook()
  const sessions = index.days.filter((d) => d.hasSession)
  const other = index.days.filter((d) => !d.hasSession)
  const cur = index.days.find((d) => d.date === date)
  const pos = sessions.findIndex((d) => d.date === date)
  const step = (dir: -1 | 1) => {
    const next = sessions[pos + dir]
    if (next) setDate(next.date)
  }

  const vix = cur?.vixClose ?? cur?.vixOpen ?? null
  const pcr = day?.chain.filter((c) => c.index === 'NIFTY').at(-1)?.pcr ?? null
  const live = book.state === 'live'
  const mtm = live ? book.totals.open : cur?.net ?? null
  const apiTone = { off: undefined, connecting: 'warn', live: 'pos', error: 'neg' }[book.state] as 'warn' | 'pos' | 'neg' | undefined

  return (
    <div className="ticker">
      <div className="brand">
        <div className="brand__mark">G</div>
        <span className="brand__name">Genie</span>
      </div>
      <span className="ticker__chip hide-sm">INDIA VIX <strong>{fmtNum(vix)}</strong></span>
      <span className="ticker__chip hide-sm">NIFTY PCR <strong>{fmtNum(pcr)}</strong></span>
      {cur?.regime && <span className="ticker__chip hide-sm">REGIME <strong style={{ fontFamily: 'inherit' }}>{cur.regime}</strong></span>}

      <div className="topbar__spacer" />

      <span className="ticker__chip hide-sm" title={live ? 'Streaming from the Genie API' : book.error ?? 'Static snapshot of the logs. Add an API URL in Settings for live data.'}>
        <Dot tone={apiTone} pulse={book.state === 'connecting'} />
        {live ? 'LIVE' : book.state === 'off' ? 'SNAPSHOT' : book.state === 'connecting' ? 'CONNECTING' : 'API DOWN'}
      </span>
      <span className="hide-xs"><Badge tone="outline">{(cur?.mode ?? 'paper').toUpperCase()}</Badge></span>
      <div className="mtm" title={live ? 'Live unrealised P&L across open positions' : 'Net realised P&L for the selected session'}>
        <span className="mtm__label">{live ? 'MTM' : 'Day net'}</span>
        <span className={clsx('mtm__value', pnlTone(mtm))}>{mtm == null ? '—' : fmtINR(mtm, { sign: true })}</span>
      </div>

      <div className="row" role="group" aria-label="Session selector">
        <button className="btn btn--ghost btn--icon hide-xs" onClick={() => step(-1)} disabled={pos <= 0} aria-label="Previous session"><ChevronLeft size={16} /></button>
        <select className="select" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Session date" style={{ minWidth: 120, maxWidth: 170 }}>
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
        <button className="btn btn--ghost btn--icon hide-xs" onClick={() => step(1)} disabled={pos < 0 || pos >= sessions.length - 1} aria-label="Next session"><ChevronRight size={16} /></button>
      </div>

      <button className="btn btn--ghost btn--icon" onClick={onPalette} aria-label="Open command palette" title={`Search (${isMac ? '⌘' : 'Ctrl'} K)`}><Command size={16} /></button>
      <button className="btn btn--ghost btn--icon" onClick={toggleTheme} aria-label="Toggle theme">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
    </div>
  )
}
