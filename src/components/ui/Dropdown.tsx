import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { usePopover } from '@/hooks/usePopover'

/** Enter inside the popover's inputs would otherwise submit a surrounding form. */
const blockEnterSubmit = (e: KeyboardEvent<HTMLElement>) => {
  if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault()
}

export interface MultiOption {
  value: string
  label: ReactNode
  hint?: ReactNode
  /** Lower-cased text the search box matches against. */
  search: string
}

/** Checkbox dropdown with search. Options beyond `max` are disabled once the limit is reached. */
export function MultiSelect({ options, value, onChange, max, label, placeholder = 'Select', loading, emptyText = 'Nothing to choose from.' }: {
  options: MultiOption[]
  value: string[]
  onChange: (next: string[]) => void
  max?: number
  /** Accessible name for the trigger and the list. */
  label: string
  placeholder?: string
  loading?: boolean
  emptyText?: string
}) {
  const { open, setOpen, ref } = usePopover()
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  useEffect(() => {
    if (open) searchRef.current?.focus()
    else setQuery('')
  }, [open])

  const q = query.trim().toLowerCase()
  const shown = useMemo(() => (q ? options.filter((o) => o.search.includes(q)) : options), [options, q])
  const picked = useMemo(() => new Set(value), [value])
  const full = max != null && value.length >= max
  const toggle = (v: string) => onChange(picked.has(v) ? value.filter((x) => x !== v) : [...value, v])

  return (
    <div className="dd" ref={ref}>
      <button
        type="button"
        className="input dd__trigger"
        data-popover-trigger
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{value.length ? `${value.length} Selected` : placeholder}</span>
        <ChevronDown size={15} className="dd__chev" />
      </button>
      {open && (
        <div className="dd__pop" onKeyDown={blockEnterSubmit}>
          <div className="dd__search">
            <div className="input-wrap">
              <Search size={14} />
              <input
                ref={searchRef}
                className="input input--search"
                type="search"
                placeholder="Search strategies"
                aria-label={`Search ${label.toLowerCase()}`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="dd__list" id={listId} role="group" aria-label={label}>
            {loading && <div className="dd__empty">Loading…</div>}
            {!loading && shown.length === 0 && <div className="dd__empty">{q ? `No match for “${query.trim()}”.` : emptyText}</div>}
            {shown.map((o) => {
              const checked = picked.has(o.value)
              const blocked = full && !checked
              return (
                <label key={o.value} className="dd__opt" aria-disabled={blocked || undefined}>
                  <input type="checkbox" checked={checked} disabled={blocked} onChange={() => toggle(o.value)} />
                  <span className="dd__opt-main">{o.label}</span>
                  {o.hint && <span className="dd__opt-hint">{o.hint}</span>}
                </label>
              )
            })}
          </div>
          <div className="dd__foot">
            <span className="num">
              {value.length}
              {max != null ? ` / ${max}` : ''} selected
            </span>
            <button type="button" className="link-btn" disabled={value.length === 0} onClick={() => onChange([])}>
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  disabled?: boolean
}

/** Button that opens a short list of actions. */
export function ActionMenu({ label, icon, items, disabled, align = 'left' }: {
  label: string
  icon?: ReactNode
  items: MenuItem[]
  disabled?: boolean
  align?: 'left' | 'right'
}) {
  const { open, setOpen, ref } = usePopover()
  return (
    <div className="dd" ref={ref}>
      <button type="button" className="btn" data-popover-trigger aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        {icon}
        {label}
        <ChevronDown size={14} className="dd__chev" />
      </button>
      {open && (
        <div className={align === 'right' ? 'dd__pop dd__pop--right' : 'dd__pop'}>
          <div className="dd__menu" role="menu" aria-label={label}>
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="dd__item"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
