import type { KeyboardEvent, ReactNode } from 'react'
import { nextTabIndex } from '@/lib/tabs'
import { Dot } from './Panel'

export interface TabDef<T extends string> {
  value: T
  label: ReactNode
  /** Pulses a dot on the tab, e.g. while work started from it is still running. */
  busy?: boolean
}

const tabId = (id: string, value: string) => `${id}-tab-${value}`
const panelId = (id: string, value: string) => `${id}-panel-${value}`

/** Accessible tab strip (arrow keys, Home/End). Pair each tab with a `TabPanel` using the same `id`. */
export function Tabs<T extends string>({ id, label, value, onChange, tabs }: {
  id: string
  label: string
  value: T
  onChange: (v: T) => void
  tabs: TabDef<T>[]
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = nextTabIndex(tabs.findIndex((t) => t.value === value), e.key, tabs.length)
    if (next === null) return
    e.preventDefault()
    onChange(tabs[next].value)
    document.getElementById(tabId(id, tabs[next].value))?.focus()
  }

  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((t) => {
        const selected = t.value === value
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            id={tabId(id, t.value)}
            className="tab"
            aria-selected={selected}
            aria-controls={panelId(id, t.value)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.value)}
          >
            {t.label}
            {t.busy && (
              <>
                <Dot tone="info" pulse />
                <span className="sr-only">(running)</span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Panel for one tab. Keep inactive panels mounted (`active={false}` only hides them) to preserve their state. */
export function TabPanel({ id, value, active, children }: { id: string; value: string; active: boolean; children: ReactNode }) {
  return (
    <div role="tabpanel" id={panelId(id, value)} aria-labelledby={tabId(id, value)} hidden={!active} className="tabpanel">
      {children}
    </div>
  )
}
