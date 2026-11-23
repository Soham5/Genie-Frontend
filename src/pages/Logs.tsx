import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { PageHead, Panel, Empty } from '@/components/ui/Panel'
import { DayGate, FeedList } from '@/components/ui/bits'
import { fmtCount, fmtDate } from '@/lib/format'
import type { DayDetail, Level } from '@/types'
import { clsx } from '@/lib/clsx'

const LEVELS: Level[] = ['critical', 'error', 'warning', 'info']
const LIMIT = 300

export default function Logs() {
  return (
    <>
      <PageHead title="Event Log" sub="Notable events extracted from the structured logs (warnings, errors, trades, risk decisions)" />
      <DayGate>{(day, date) => <LogsBody day={day} date={date} />}</DayGate>
    </>
  )
}

function LogsBody({ day, date }: { day: DayDetail; date: string }) {
  const [levels, setLevels] = useState<Set<Level>>(new Set(['critical', 'error', 'warning']))
  const [q, setQ] = useState('')
  const [comp, setComp] = useState('all')

  const components = useMemo(() => [...new Set(day.feed.map((f) => f.component))].sort(), [day.feed])
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return day.feed
      .filter((f) => levels.has(f.level) && (comp === 'all' || f.component === comp) && (!needle || `${f.event} ${f.msg} ${f.component}`.toLowerCase().includes(needle)))
      .reverse()
  }, [day.feed, levels, q, comp])

  const toggle = (l: Level) => setLevels((s) => { const n = new Set(s); if (n.has(l)) n.delete(l); else n.add(l); return n })
  const count = (l: Level) => (l === 'warning' ? day.counts.warning : l === 'error' ? day.counts.error : l === 'critical' ? day.counts.critical : day.counts.info)

  return (
    <Panel
      title={fmtDate(date, 'long')}
      sub={`${fmtCount(day.counts.events)} raw events · ${fmtCount(day.feed.length)} retained in the feed${filtered.length > LIMIT ? ` · showing latest ${LIMIT}` : ''}`}
      flush
      actions={
        <div className="row row--wrap">
          {LEVELS.map((l) => (
            <button key={l} className={clsx('chip')} aria-pressed={levels.has(l)} onClick={() => toggle(l)}>{l} <span className="num muted">{fmtCount(count(l))}</span></button>
          ))}
          <select className="select" value={comp} onChange={(e) => setComp(e.target.value)} aria-label="Component">
            <option value="all">All components</option>
            {components.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="input-wrap">
            <Search size={14} />
            <input className="input input--search" placeholder="Filter text…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter events" />
          </span>
        </div>
      }
    >
      {filtered.length === 0 ? <Empty title="No events match">Adjust the level, component or text filter.</Empty> : <FeedList events={filtered.slice(0, LIMIT)} />}
    </Panel>
  )
}
