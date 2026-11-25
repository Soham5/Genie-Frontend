import { PageHead, Panel, Badge } from '@/components/ui/Panel'
import { ConnectionForm } from '@/api/ConnectionForm'
import { useApiState } from '@/api/ApiProvider'
import { useLiveBook } from '@/hooks/useLiveBook'
import { useTheme } from '@/hooks/useTheme'
import { useTrades } from '@/api/TradesProvider'

export default function Settings() {
  const [theme, toggleTheme] = useTheme()
  const { base, status, health } = useApiState()
  const book = useLiveBook()
  const { trades, unsupported, truncated, updatedAt } = useTrades()

  return (
    <>
      <PageHead title="Settings" sub="Appearance and the connection to your Genie API" />
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

          <Panel title="Genie API" sub="Every screen reads from this API — nothing is loaded from logs.">
            <ConnectionForm />
          </Panel>
        </div>

        <Panel title="Connection">
          <dl className="kv">
            <dt>API URL</dt><dd className="num">{base || '—'}</dd>
            <dt>Status</dt><dd><Badge tone={status === 'online' ? 'pos' : status === 'connecting' ? 'warn' : 'outline'}>{status}</Badge></dd>
            <dt>Broker</dt><dd>{health ? (health.broker_connected ? 'Connected' : 'Disconnected') : '—'}</dd>
            <dt>Live book</dt><dd>{book.state}{book.asOf ? ` · ${book.asOf.toLocaleTimeString('en-GB')}` : ''}</dd>
            <dt>Closed trades loaded</dt><dd className="num">{unsupported ? 'endpoint missing' : trades.length}{updatedAt ? ` · ${updatedAt.toLocaleTimeString('en-GB')}` : ''}</dd>
          </dl>
          <div className="divider" />
          <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }}>
            <li>Polled endpoints: <code>/health</code>, <code>/kill/status</code>, <code>/papertrade/runner</code>, <code>/papertrade/pnl</code> and <code>/console/trades</code>, plus page-specific reads.</li>
            <li>This console is read-only: it never sends orders, starts the runner or flips the kill switch.</li>
            {unsupported && <li className="neg"><code>/console/trades</code> returned 404 — update the Genie backend to a version that includes the console router.</li>}
            {truncated && <li>The API returned its row limit; older trades are not shown.</li>}
            <li>Nothing here is investment advice.</li>
          </ul>
        </Panel>
      </div>
    </>
  )
}
