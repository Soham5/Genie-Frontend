import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PIPELINE } from '@/data/catalog'
import { useStore } from '@/data/store'
import { Badge, Callout, Empty, PageHead, Panel } from '@/components/ui/Panel'
import { DayGate } from '@/components/ui/bits'
import { DataTable } from '@/components/ui/DataTable'
import { AXIS, ChartTooltip, GRID } from '@/components/charts/chartKit'
import { fmtCount, fmtDate, fmtINR, fmtPct, prettyStrategy } from '@/lib/format'
import { groupBy } from '@/lib/stats'
import type { DayDetail } from '@/types'

export default function Risk() {
  return (
    <>
      <PageHead title="Risk Gate" sub="Every order passes seven controls before execution. Counts below are for the selected session." />
      <DayGate>{(day, date) => <RiskBody day={day} date={date} />}</DayGate>
    </>
  )
}

type State = 'ok' | 'warn' | 'alert' | undefined

function RiskBody({ day, date }: { day: DayDetail; date: string }) {
  const { index } = useStore()
  const entries = day.trades.filter((t) => t.entryDate === date).length

  const nodes: Record<string, { metric: string; label: string; state: State }> = {
    strategy: { metric: fmtCount(day.cycles.reduce((a, c) => a + c.scanned, 0)), label: 'symbols scanned', state: day.cycles.length ? 'ok' : undefined },
    risk: { metric: fmtCount(day.riskBlocks.length), label: 'entries blocked', state: day.riskBlocks.length ? 'warn' : day.cycles.length ? 'ok' : undefined },
    pretrade: { metric: `${day.preTrade.passed} / ${day.preTrade.blocked}`, label: 'passed / blocked', state: day.preTrade.blocked ? 'warn' : day.preTrade.passed ? 'ok' : undefined },
    portfolio: { metric: fmtCount(day.riskSizing.length), label: 'sizing decisions', state: day.riskSizing.length ? 'ok' : undefined },
    compliance: { metric: fmtCount(day.postTradeWarnings), label: 'post-trade warnings', state: day.postTradeWarnings ? 'warn' : undefined },
    kill: { metric: fmtCount(day.killSwitch.length), label: 'activations', state: day.killSwitch.length ? 'alert' : day.cycles.length ? 'ok' : undefined },
    execution: { metric: fmtCount(entries), label: 'entries filled', state: entries ? 'ok' : undefined },
  }

  const categories = useMemo(
    () => Object.entries(groupBy(day.riskBlocks, (b) => b.category)).map(([name, bs]) => ({ name, count: bs.length })).sort((a, b) => b.count - a.count),
    [day.riskBlocks],
  )
  const sizing = useMemo(() => {
    const latest = new Map<string, (typeof day.riskSizing)[number]>()
    for (const s of day.riskSizing) latest.set(s.strategy, s)
    return [...latest.values()]
  }, [day])

  const history = useMemo(() => index.incidents.filter((i) => i.kind !== 'infrastructure').slice(0, 40), [index.incidents])

  return (
    <div className="stack">
      {day.killSwitch.length > 0 && (
        <Callout tone="neg" title="Kill switch activated.">
          {day.killSwitch.map((k) => `${k.t.slice(0, 5)} · ${k.reason} (${k.by})`).join(' | ')}
        </Callout>
      )}

      <Panel title="Control pipeline" sub="Signal → execution. Red = a hard stop fired, amber = vetoes or warnings, green = active and clear." help="Portfolio-level and compliance modules mostly act silently; their counts reflect only logged decisions/warnings.">
        <div className="pipe">
          {PIPELINE.map((p, i) => {
            const n = nodes[p.key]
            return (
              <div className="pipe__node" key={p.key} data-state={n.state}>
                <div className="pipe__title">{i + 1}. {p.title}</div>
                <div className="pipe__blurb">{p.blurb}</div>
                <div className="pipe__metric num">{n.metric}</div>
                <div className="pipe__metric-label">{n.label}</div>
              </div>
            )
          })}
        </div>
      </Panel>

      <div className="grid cols-2">
        <Panel title="Blocks by category" sub={`${day.riskBlocks.length} vetoed entries`}>
          {categories.length === 0 ? <Empty title="No risk blocks">Nothing was vetoed this session.</Empty> : (
            <div className="chart" style={{ height: Math.max(160, categories.length * 44 + 30) }} role="img" aria-label="Risk blocks by category">
              <ResponsiveContainer>
                <BarChart data={categories} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid {...GRID} horizontal={false} vertical />
                  <XAxis type="number" {...AXIS} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" {...AXIS} width={150} />
                  <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip format={(v) => `${v} blocks`} />} />
                  <Bar dataKey="count" name="Blocks" fill="var(--warn)" radius={2} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Risk budget utilisation" sub="Latest sizing decision per strategy" help="Open risk ÷ portfolio risk limit at the last pre-trade evaluation.">
          {sizing.length === 0 ? <Empty title="No sizing decisions">Pre-trade sizing events were not logged this session.</Empty> : (
            <div className="stack" style={{ gap: 12 }}>
              {sizing.map((s) => {
                const pct = s.riskLimit > 0 ? (s.openRisk / s.riskLimit) * 100 : 0
                return (
                  <div key={s.strategy}>
                    <div className="row row--between" style={{ fontSize: 12.5, marginBottom: 4 }}>
                      <span>{prettyStrategy(s.strategy)}</span>
                      <span className="num muted">{fmtINR(s.openRisk)} / {fmtINR(s.riskLimit)} · {fmtPct(pct, 0)}</span>
                    </div>
                    <div className="bar"><span style={{ width: `${Math.min(100, pct)}%`, background: pct > 80 ? 'var(--neg)' : pct > 50 ? 'var(--warn)' : 'var(--accent)' }} /></div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Blocked entries" sub="Why candidate trades were rejected" flush>
        <DataTable
          dense
          maxHeight={320}
          rows={day.riskBlocks}
          rowKey={(b) => `${b.t}-${b.strategy}-${b.symbol}-${b.reason}`}
          emptyTitle="No blocked entries"
          columns={[
            { key: 't', header: 'Time', sort: (b) => b.t, cell: (b) => <span className="num">{b.t.slice(0, 8)}</span> },
            { key: 'cat', header: 'Category', sort: (b) => b.category, cell: (b) => <Badge tone="warn">{b.category}</Badge> },
            { key: 's', header: 'Strategy', sort: (b) => b.strategy, cell: (b) => prettyStrategy(b.strategy) },
            { key: 'sym', header: 'Symbol', cell: (b) => <span className="mono">{b.symbol}</span> },
            { key: 'why', header: 'Detail', wrap: true, cell: (b) => <span className="muted">{b.reason}</span> },
          ]}
        />
      </Panel>

      {sizing.length > 0 && (
        <Panel title="Position sizing" sub="Capital, budget and resulting quantity" flush>
          <DataTable
            dense
            rows={sizing}
            rowKey={(s) => s.strategy}
            columns={[
              { key: 's', header: 'Strategy', cell: (s) => prettyStrategy(s.strategy) },
              { key: 'm', header: 'Mode', cell: (s) => <Badge tone="outline">{s.mode}</Badge> },
              { key: 'c', header: 'Capital', align: 'r', cell: (s) => <span className="num">{fmtINR(s.capital)}</span> },
              { key: 'b', header: 'Risk budget', align: 'r', cell: (s) => <span className="num">{fmtINR(s.riskBudget)}</span> },
              { key: 'q', header: 'Final qty', align: 'r', cell: (s) => <span className="num">{s.finalQty}</span> },
              { key: 'fr', header: 'Final risk', align: 'r', cell: (s) => <span className="num">{fmtINR(s.finalRisk)}</span> },
              { key: 'dl', header: 'Daily loss left', align: 'r', cell: (s) => <span className="num">{fmtINR(s.dailyLossRemaining)}</span> },
            ]}
          />
        </Panel>
      )}

      <Panel title="Reconciliation & kill-switch history" sub="Critical risk events across all logged sessions" flush>
        <DataTable
          dense
          maxHeight={360}
          rows={history}
          rowKey={(i) => `${i.date}-${i.t}-${i.title}`}
          emptyTitle="No incidents recorded"
          columns={[
            { key: 'd', header: 'When', sort: (i) => `${i.date} ${i.t}`, cell: (i) => <span className="num">{fmtDate(i.date)} {i.t.slice(0, 5)}</span> },
            { key: 'k', header: 'Type', cell: (i) => <Badge tone={i.kind === 'kill-switch' ? 'neg' : 'warn'}>{i.kind}</Badge> },
            { key: 't', header: 'Event', cell: (i) => i.title },
            { key: 'x', header: 'Detail', wrap: true, cell: (i) => <span className="muted">{i.detail}</span> },
          ]}
          initialSort={{ key: 'd', dir: 'desc' }}
        />
      </Panel>
    </div>
  )
}
