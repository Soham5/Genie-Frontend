import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { SCHEDULER_JOBS } from '@/data/catalog'
import { useStore } from '@/data/store'
import { Badge, Empty, PageHead, Panel } from '@/components/ui/Panel'
import { DayGate, LEVEL_TONE } from '@/components/ui/bits'
import { DataTable } from '@/components/ui/DataTable'
import { AXIS, COLORS, ChartTooltip, GRID, Legend } from '@/components/charts/chartKit'
import { fmtCount, fmtDate, prettyEvent } from '@/lib/format'
import type { DayDetail } from '@/types'

export default function System() {
  return (
    <>
      <PageHead title="System Health" sub="Subsystem activity, connectivity, scheduled jobs and the issues that need attention" />
      <DayGate>{(day, date) => <SystemBody day={day} date={date} />}</DayGate>
    </>
  )
}

function SystemBody({ day, date }: { day: DayDetail; date: string }) {
  const { index } = useStore()
  const comps = Object.entries(day.components).sort((a, b) => b[1].errors - a[1].errors || b[1].warnings - a[1].warnings)
  const trend = useMemo(() => index.days.filter((d) => d.hasSession).map((d) => ({ date: d.date, errors: d.errors, warnings: d.warnings })), [index.days])
  const jobs = Object.entries(day.scheduler).sort((a, b) => b[1] - a[1])
  const incidents = index.incidents.filter((i) => i.kind === 'infrastructure' || i.date === date).slice(0, 50)

  const wsHealthy = day.ws.heartbeatTimeouts === 0 && day.ws.errors === 0
  const wsStalled = day.ws.stallStarted > day.ws.stallRecovered

  return (
    <div className="stack">
      <div className="grid cols-4">
        {comps.slice(0, 8).map(([name, c]) => (
          <div className="stat" key={name} style={{ gap: 4 }}>
            <div className="stat__label">{name}</div>
            <div className="row" style={{ gap: 8 }}>
              <span className={`dot ${c.errors ? 'dot--neg' : c.warnings ? 'dot--warn' : 'dot--pos'}`} />
              <span className="stat__value num" style={{ fontSize: 18 }}>{c.errors ? 'Errors' : c.warnings ? 'Warnings' : 'Healthy'}</span>
            </div>
            <div className="stat__foot num">{fmtCount(c.events)} events · {c.warnings} warn · {c.errors} err</div>
          </div>
        ))}
      </div>

      <div className="grid cols-3">
        <Panel title="WebSocket feed" sub="Market-data stream" actions={<Badge tone={wsStalled ? 'neg' : wsHealthy ? 'pos' : 'warn'} dot>{wsStalled ? 'Stalled' : wsHealthy ? 'Stable' : 'Unstable'}</Badge>}>
          <dl className="kv">
            <dt>Connections</dt><dd className="num">{fmtCount(day.ws.connected)}</dd>
            <dt>Reconnects</dt><dd className="num">{fmtCount(day.ws.reconnects)}</dd>
            <dt>Heartbeat timeouts</dt><dd className={`num ${day.ws.heartbeatTimeouts ? 'neg' : ''}`}>{fmtCount(day.ws.heartbeatTimeouts)}</dd>
            <dt>Stalls (start / recovered)</dt><dd className="num">{day.ws.stallStarted} / {day.ws.stallRecovered}</dd>
            <dt>Errors</dt><dd className="num">{fmtCount(day.ws.errors)}</dd>
          </dl>
        </Panel>
        <Panel title="Broker (Angel One)" sub="Order & candle APIs">
          <dl className="kv">
            <dt>Sessions</dt><dd className="num">{fmtCount(day.broker.sessions)}</dd>
            <dt>Fill-poll failures</dt><dd className={`num ${day.broker.fillPollFailures ? 'neg' : ''}`}>{fmtCount(day.broker.fillPollFailures)}</dd>
            <dt>Empty candle fetches</dt><dd className="num">{fmtCount(day.broker.candleFetchEmpty)}</dd>
            <dt>Candle circuits opened</dt><dd className="num">{fmtCount(day.broker.candleCircuitOpened)}</dd>
            <dt>Rate limited</dt><dd className="num">{fmtCount(day.broker.rateLimited)}</dd>
          </dl>
        </Panel>
        <Panel title="Reconciliation" sub="Broker ↔ internal positions">
          {day.recon.length === 0 ? <Empty title="No reconciliation runs" /> : (
            <div className="stack" style={{ gap: 8 }}>
              {day.recon.map((r, i) => (
                <div key={`${r.t}-${i}`} className="row" style={{ alignItems: 'flex-start', fontSize: 12.5 }}>
                  <span className={`dot ${r.ok ? 'dot--pos' : 'dot--neg'}`} style={{ marginTop: 5 }} />
                  <div>
                    <div><span className="num muted">{r.t.slice(0, 5)}</span> · {r.kind}</div>
                    <div className="muted">{r.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Errors & warnings per session" sub="Platform noise over time" actions={<Legend items={[{ label: 'Errors', color: COLORS.neg }, { label: 'Warnings', color: COLORS.warn }]} />}>
        <div className="chart" style={{ height: 220 }} role="img" aria-label="Errors and warnings by session">
          <ResponsiveContainer>
            <BarChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="date" {...AXIS} tickFormatter={(d: string) => fmtDate(d)} minTickGap={28} />
              <YAxis {...AXIS} width={40} />
              <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip format={(v) => fmtCount(v)} title={(l) => fmtDate(String(l), 'long')} />} />
              <Bar dataKey="warnings" name="Warnings" stackId="a" fill="var(--warn)" isAnimationActive={false} />
              <Bar dataKey="errors" name="Errors" stackId="a" fill="var(--neg)" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid cols-2">
        <Panel title="Issues this session" sub="Grouped by event" flush>
          <DataTable
            dense
            maxHeight={360}
            rows={day.issues}
            rowKey={(i) => i.event}
            initialSort={{ key: 'n', dir: 'desc' }}
            emptyTitle="No warnings or errors"
            columns={[
              { key: 'lvl', header: 'Level', cell: (i) => <Badge tone={LEVEL_TONE[i.level]}>{i.level}</Badge> },
              { key: 'e', header: 'Event', sort: (i) => i.event, wrap: true, cell: (i) => <><strong>{prettyEvent(i.event)}</strong><div className="muted" style={{ fontSize: 11.5 }}>{i.component} · {i.sample}</div></> },
              { key: 'n', header: 'Count', align: 'r', sort: (i) => i.count, cell: (i) => <span className="num">{fmtCount(i.count)}</span> },
            ]}
          />
        </Panel>

        <Panel title="Top issues — all sessions" sub="Most frequent warnings/errors over the logged window" flush>
          <DataTable
            dense
            maxHeight={360}
            rows={index.issueTotals.slice(0, 25)}
            rowKey={(i) => i.event}
            columns={[
              { key: 'lvl', header: 'Level', cell: (i) => <Badge tone={LEVEL_TONE[i.level]}>{i.level}</Badge> },
              { key: 'e', header: 'Event', wrap: true, cell: (i) => <><strong>{prettyEvent(i.event)}</strong><div className="muted" style={{ fontSize: 11.5 }}>{i.component} · seen on {i.days} sessions</div></> },
              { key: 'n', header: 'Count', align: 'r', cell: (i) => <span className="num">{fmtCount(i.count)}</span> },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Scheduled jobs" sub="APScheduler executions this session vs. expected cadence" flush>
        <DataTable
          dense
          rows={jobs}
          rowKey={([k]) => k}
          emptyTitle="No scheduler activity"
          columns={[
            { key: 'j', header: 'Job', cell: ([k]) => <span className="mono">{k}</span> },
            { key: 'p', header: 'Purpose', wrap: true, cell: ([k]) => <span className="muted">{SCHEDULER_JOBS[k]?.purpose ?? '—'}</span> },
            { key: 'c', header: 'Schedule', cell: ([k]) => <span className="muted">{SCHEDULER_JOBS[k]?.cron ?? '—'}</span> },
            { key: 'n', header: 'Runs', align: 'r', cell: ([, n]) => <span className="num">{fmtCount(n)}</span> },
          ]}
        />
      </Panel>

      <Panel title="Incident timeline" sub="Infrastructure incidents (all sessions) plus anything on the selected day" flush>
        {incidents.length === 0 ? <Empty title="No incidents" /> : (
          <div className="feed">
            {incidents.map((i, n) => (
              <div className="feed__row" key={`${i.date}-${i.t}-${n}`} style={{ gridTemplateColumns: '100px 100px 220px minmax(0,1fr)' }}>
                <span className="num muted">{fmtDate(i.date)} {i.t.slice(0, 5)}</span>
                <Badge tone={i.severity === 'critical' ? 'neg' : 'warn'}>{i.severity}</Badge>
                <span className="feed__event">{i.title}</span>
                <span className="feed__msg">{i.detail}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
