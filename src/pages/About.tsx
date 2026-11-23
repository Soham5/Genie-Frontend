import { useState } from 'react'
import { PageHead, Panel, Callout, Badge } from '@/components/ui/Panel'
import { useStore } from '@/data/store'
import { useTheme } from '@/hooks/useTheme'
import { getApiBase, setApiBase, useLiveApi } from '@/hooks/useLiveApi'
import { fmtDate } from '@/lib/format'

export default function About() {
  const { index } = useStore()
  const [theme, toggleTheme] = useTheme()
  const [url, setUrl] = useState(getApiBase())
  const live = useLiveApi()

  return (
    <>
      <PageHead title="Settings & About" sub="Appearance, optional live-API probe and data provenance" />
      <div className="stack">
        <div className="grid cols-2">
          <Panel title="Appearance">
            <div className="row row--between">
              <span>Theme</span>
              <button className="btn" onClick={toggleTheme}>{theme === 'dark' ? 'Dark' : 'Light'} · switch</button>
            </div>
            <div className="divider" />
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Shortcuts: <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd> opens the command palette to jump between pages and sessions.</p>
          </Panel>

          <Panel title="Live API (optional)" sub="Shows an API status pill in the top bar; data stays a static snapshot.">
            <form className="row" onSubmit={(e) => { e.preventDefault(); setApiBase(url) }}>
              <input className="input grow" placeholder="https://your-genie-host" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Genie API base URL" />
              <button className="btn btn--primary" type="submit">Save</button>
            </form>
            <p style={{ margin: '10px 0 0', fontSize: 12.5 }} className="muted">
              Status: <Badge tone={live.state === 'up' ? 'pos' : live.state === 'down' ? 'neg' : 'outline'}>{live.state}</Badge> · probes <code>/api/v1/health/live</code> every 30s.
            </p>
            <Callout tone="info">GitHub Pages is served over HTTPS, so browsers block calls to a plain <code>http://</code> API (mixed content). Use an HTTPS endpoint and allow this origin in the API's CORS settings.</Callout>
          </Panel>
        </div>

        <Panel title="Data provenance">
          <dl className="kv">
            <dt>Source</dt><dd>Genie structlog JSONL (EC2)</dd>
            <dt>Log files</dt><dd className="num">{index.source.logFiles}</dd>
            <dt>Coverage</dt><dd className="num">{fmtDate(index.source.firstDate, 'long')} → {fmtDate(index.source.lastDate, 'long')}</dd>
            <dt>Latest session</dt><dd className="num">{fmtDate(index.latestSession, 'long')}</dd>
            <dt>Generated</dt><dd className="num">{new Date(index.generatedAt).toLocaleString('en-GB')}</dd>
            <dt>Mode</dt><dd>Paper trading</dd>
          </dl>
          <div className="divider" />
          <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }}>
            <li>P&amp;L is realised and net of brokerage, STT, exchange charges, GST and modelled slippage. Open positions are not marked-to-market because the logs carry no live quotes.</li>
            <li>Sensitive fields (client IDs, raw broker positions, tracebacks, request IDs, IPs) are removed when the snapshot is built.</li>
            <li>Refresh the snapshot with <code>npm run data</code>, commit <code>public/data</code>, and push to redeploy.</li>
            <li>Nothing here is investment advice.</li>
          </ul>
        </Panel>
      </div>
    </>
  )
}
