import { useState } from 'react'
import { PageHead, Panel, Callout, Badge } from '@/components/ui/Panel'
import { useStore } from '@/data/store'
import { useTheme } from '@/hooks/useTheme'
import { getApiBase, getApiKey, isKeyRemembered, setApiBase, setApiKey } from '@/hooks/useLiveApi'
import { useLiveBook } from '@/hooks/useLiveBook'
import { fmtDate } from '@/lib/format'

export default function About() {
  const { index } = useStore()
  const [theme, toggleTheme] = useTheme()
  const [url, setUrl] = useState(getApiBase())
  const [key, setKey] = useState(getApiKey())
  const [remember, setRemember] = useState(isKeyRemembered())
  const book = useLiveBook()

  return (
    <>
      <PageHead title="Settings" sub="Appearance, live API connection and data provenance" />
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

          <Panel title="Live API (optional)" sub="Real leg LTPs and mark-to-market P&L on the Positions page.">
            <form
              className="stack"
              style={{ gap: 10 }}
              onSubmit={(e) => {
                e.preventDefault()
                setApiBase(url)
                setApiKey(key, remember)
              }}
            >
              <input className="input" placeholder="https://your-genie-host" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Genie API base URL" />
              <input className="input" type="password" autoComplete="off" placeholder="Read-only API key (X-API-Key) or JWT" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Genie API key" />
              <label className="row muted" style={{ fontSize: 12.5 }}>
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember the key on this device (otherwise it clears when the tab closes)
              </label>
              <div className="row">
                <button className="btn btn--primary" type="submit">Save</button>
                <button className="btn" type="button" onClick={() => { setUrl(''); setKey(''); setApiBase(''); setApiKey('', false) }}>Disconnect</button>
              </div>
            </form>
            <p style={{ margin: '10px 0' }} className="muted">
              Status: <Badge tone={book.state === 'live' ? 'pos' : book.state === 'error' ? 'neg' : 'outline'}>{book.state}</Badge> · polls <code>/api/v1/papertrade/pnl</code> every 4s while this tab is visible.
              {book.state === 'error' && <><br /><span className="neg">{book.error}</span></>}
            </p>
            <Callout tone="warn" title="Use a read-only key.">The key is held in your browser and sent to your API; anyone with browser access to this device could read it. Never use a key that can start or stop trading.</Callout>
            <div style={{ height: 8 }} />
            <Callout tone="info">GitHub Pages is HTTPS, so the API must be HTTPS too (plain <code>http://</code> is blocked as mixed content) and must allow this origin via <code>CORS_ALLOW_ORIGINS</code>.</Callout>
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
            <li>Snapshot P&amp;L is realised and net of brokerage, STT, exchange charges, GST and modelled slippage. Open positions are only marked-to-market in Live mode, because the logs carry no quotes.</li>
            <li>F&amp;O legs in the snapshot are recovered from truncated database log lines and labelled <em>logged</em>, <em>derived</em> or <em>not logged</em>.</li>
            <li>Sensitive fields (client IDs, raw broker positions, tracebacks, request IDs, IPs) are removed when the snapshot is built.</li>
            <li>Refresh the snapshot with <code>npm run data</code>, commit <code>public/data</code>, and push to redeploy.</li>
            <li>Nothing here is investment advice.</li>
          </ul>
        </Panel>
      </div>
    </>
  )
}
