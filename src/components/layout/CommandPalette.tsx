import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, CornerDownLeft, Moon, Sun } from 'lucide-react'
import { ROUTES } from '@/routes'
import { useSessionDate } from '@/api/session'
import { fmtDate } from '@/lib/format'
import type { Theme } from '@/hooks/useTheme'

interface Item {
  id: string
  group: string
  label: string
  hint?: string
  icon: React.ReactNode
  keywords?: string
  run: () => void
}

export function CommandPalette({ open, onClose, theme, toggleTheme }: { open: boolean; onClose: () => void; theme: Theme; toggleTheme: () => void }) {
  const { dates, today, setDate } = useSessionDate()
  const navigate = useNavigate()
  const loc = useLocation()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const items = useMemo<Item[]>(() => {
    const search = loc.search
    const nav: Item[] = ROUTES.map((r) => ({
      id: r.path,
      group: 'Go to',
      label: r.label,
      keywords: r.keywords,
      icon: <r.icon size={16} />,
      run: () => navigate({ pathname: r.path, search }),
    }))
    const days: Item[] = dates.slice(0, 40).map((d) => ({
      id: `d-${d}`,
      group: 'Sessions',
      label: fmtDate(d, 'long'),
      hint: d === today ? 'today' : undefined,
      keywords: `${d} session day`,
      icon: <CalendarDays size={16} />,
      run: () => setDate(d),
    }))
    const actions: Item[] = [
      {
        id: 'theme',
        group: 'Actions',
        label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        icon: theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />,
        keywords: 'theme appearance dark light',
        run: toggleTheme,
      },
    ]
    return [...nav, ...actions, ...days]
  }, [dates, today, loc.search, navigate, setDate, theme, toggleTheme])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items.slice(0, 18)
    return items.filter((i) => `${i.label} ${i.keywords ?? ''} ${i.group}`.toLowerCase().includes(needle)).slice(0, 30)
  }, [items, q])

  useEffect(() => {
    setSel(0)
  }, [q])

  if (!open) return null

  const run = (i: Item | undefined) => {
    if (!i) return
    onClose()
    i.run()
  }

  let lastGroup = ''
  return (
    <div className="palette-scrim" onMouseDown={onClose} role="presentation">
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette__input"
          placeholder="Jump to a page or session…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
            else if (e.key === 'Enter') run(filtered[sel])
            else if (e.key === 'Escape') onClose()
          }}
          aria-label="Search commands"
        />
        <div className="palette__list" role="listbox">
          {filtered.length === 0 && <div className="empty">No matches</div>}
          {filtered.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null
            lastGroup = item.group
            return (
              <div key={item.id}>
                {header && <div className="palette__group">{header}</div>}
                <button className="palette__item" role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => run(item)}>
                  {item.icon}
                  <span>{item.label}</span>
                  {item.hint ? <small>{item.hint}</small> : i === sel ? <small><CornerDownLeft size={13} /></small> : null}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
