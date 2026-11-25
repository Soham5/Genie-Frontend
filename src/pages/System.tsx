import type { ReactNode } from 'react'
import { useApiState } from '@/api/ApiProvider'
import type { RunnerStatus } from '@/api/types'
import { useApi } from '@/api/useApi'
import { Badge, Callout, PageHead, Panel, Skeleton } from '@/components/ui/Panel'
import { Stat } from '@/components/ui/Stat'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { ApiNote, clock, fmtRel, fmtStamp, KvList, Load, RefreshButton } from './ops/shared'

interface SchedulerStatus { running: boolean; jobs: { id: string; next_run_time: string | null }[] }

const flat = (v: unknown): ReactNode => {
  if (v == null) return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
const pretty = (k: string) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

function RunnerPanel({ title, sub, res }: { title: string; sub: string; res: ReturnType<typeof useApi<RunnerStatus>> }) {
  return (
    <Panel title={title} sub={sub} actions={res.data ? <Badge tone={res.data.running ? 'pos' : 'muted'} dot>{res.data.running ? 'Running' : 'Stopped'}</Badge> : undefined}>
      <Load res={res} what={title.toLowerCase()}>
        {(r) => (
          <>
            <KvList
              rows={[
                ['Scan interval', `${r.interval_sec}s`],
                ['Cycle in progress', r.cycle_in_progress ? 'Yes' : 'No'],
                ['Last cycle', r.last_cycle_at ? `${fmtStamp(r.last_cycle_at)} (${fmtRel(r.last_cycle_at) || '—'})` : 'never'],
                ...(r.risk_stack_enabled != null ? ([['Risk stack', r.risk_stack_enabled ? 'On' : 'Off']] as [string, ReactNode][]) : []),
                ...Object.entries(r.last_cycle_stats ?? {}).map(([k, v]) => [`Cycle · ${pretty(k)}`, flat(v)] as [string, ReactNode]),
              ]}
            />
            {r.last_cycle_error && <Callout tone="neg" title="Last cycle error.">{r.last_cycle_error}</Callout>}
          </>
        )}
      </Load>
    </Panel>
  )
}

export default function System() {
  const { status, base, health, kill, error, refresh } = useApiState()
  const enabled = status === 'online'
  const sched = useApi<SchedulerStatus>('/health/scheduler', { poll: 30000, enabled })
  const ws = useApi<{ state: string }>('/health/websocket', { poll: 15000, enabled })
  const paper = useApi<RunnerStatus>('/papertrade/runner', { poll: 10000, enabled })
  const live = useApi<RunnerStatus>('/live/runner', { poll: 15000, enabled })

  const wsState = ws.data?.state ?? health?.websocket_state ?? null
  const schedData = sched.data ?? (health?.scheduler && typeof health.scheduler === 'object' && 'jobs' in health.scheduler ? (health.scheduler as SchedulerStatus) : undefined)
  const checks: [string, boolean | null, string][] = [
    ['Broker session', health ? health.broker_connected : null, health?.broker_connected ? 'connected' : 'not connected'],
    ['Market-data websocket', wsState ? /connected/i.test(wsState) && !/dis/i.test(wsState) : null, wsState ?? 'unknown'],
    ['Scheduler', schedData ? schedData.running : null, schedData ? (schedData.running ? `${schedData.jobs.length} jobs scheduled` : 'not running') : 'unknown'],
    ['Kill switch clear', kill ? !kill.active : null, kill?.active ? `active${kill.reason ? ` · ${kill.reason}` : ''}` : 'off'],
  ]
  const allOk = checks.every(([, ok]) => ok === true)

  const jobCols: Column<SchedulerStatus['jobs'][number]>[] = [
    { key: 'id', header: 'Job', sort: (j) => j.id, cell: (j) => <span className="mono">{j.id}</span> },
    { key: 'next', header: 'Next run', sort: (j) => j.next_run_time ?? '', cell: (j) => <span className="num">{fmtStamp(j.next_run_time)}</span> },
    { key: 'in', header: 'In', align: 'r', cell: (j) => <span className="muted">{fmtRel(j.next_run_time) || '—'}</span> },
  ]

  return (
    <>
      <PageHead title="System" sub="Service health, scheduler and algo runner status from the Genie API." actions={<RefreshButton onClick={() => { refresh(); sched.refresh(); ws.refresh(); paper.refresh(); live.refresh() }} />} />
      <div className="stack">
        {status === 'offline' && <Callout tone="neg" title="API unreachable.">{error ?? 'The health check is failing.'} Showing the last known values.</Callout>}

        <div className="grid cols-4">
          <Stat label="API" value={status === 'online' ? 'Online' : status} tone={status === 'online' ? 'pos' : status === 'offline' ? 'neg' : undefined} foot={base || 'no URL'} />
          <Stat label="Broker" value={health ? (health.broker_connected ? 'Connected' : 'Disconnected') : '—'} tone={health ? (health.broker_connected ? 'pos' : 'neg') : undefined} foot={health?.last_token_refresh ? `token ${fmtStamp(health.last_token_refresh)}` : 'no token refresh'} />
          <Stat label="WebSocket" value={wsState ?? '—'} tone={wsState ? (/^connected$/i.test(wsState) ? 'pos' : 'neg') : undefined} foot={`fills ingested ${health?.broker_fills_ingested_total ?? '—'}`} />
          <Stat label="Scheduler" value={schedData ? (schedData.running ? 'Running' : 'Stopped') : '—'} tone={schedData ? (schedData.running ? 'pos' : 'neg') : undefined} foot={schedData ? `${schedData.jobs.length} jobs` : undefined} />
        </div>

        <Panel title="Readiness" sub="Derived from /health, /health/websocket and /health/scheduler" actions={<Badge tone={allOk ? 'pos' : 'warn'} dot>{allOk ? 'All systems go' : 'Attention needed'}</Badge>}>
          {!health && status !== 'offline' ? <Skeleton height={96} /> : (
            <KvList rows={checks.map(([name, ok, text]) => [name, <span key={name}><Badge tone={ok == null ? 'muted' : ok ? 'pos' : 'neg'} dot>{ok == null ? 'unknown' : ok ? 'OK' : 'FAIL'}</Badge> <span className="muted">{text}</span></span>])} />
          )}
        </Panel>

        <div className="grid cols-2">
          <RunnerPanel title="Paper runner" sub="/papertrade/runner" res={paper} />
          <RunnerPanel title="Live runner" sub="/live/runner" res={live} />
        </div>

        <Panel flush title="Scheduled jobs" sub={`/health/scheduler · updated ${clock(sched.updatedAt)}`}>
          {sched.error && !sched.data ? <div style={{ padding: 12 }}><ApiNote error={sched.error} what="scheduler status" /></div> : !sched.data ? <Skeleton height={120} /> : (
            <DataTable dense rows={sched.data.jobs} columns={jobCols} rowKey={(j) => j.id} initialSort={{ key: 'next', dir: 'asc' }} emptyTitle="No scheduled jobs" emptyHint={sched.data.running ? 'The scheduler is running with no jobs.' : 'The scheduler is not running.'} />
          )}
        </Panel>
      </div>
    </>
  )
}
