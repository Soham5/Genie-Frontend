import { useState } from 'react'
import { Callout, Badge } from '@/components/ui/Panel'
import { getApiBase, getApiKey, isKeyRemembered, setApiBase, setApiKey } from './client'
import { useApiState, type ApiStatus } from './ApiProvider'

const TONE: Record<ApiStatus, 'pos' | 'neg' | 'warn' | 'outline'> = { online: 'pos', offline: 'neg', unauthorized: 'neg', connecting: 'warn', unconfigured: 'outline' }

export function ConnectionForm() {
  const { status, error } = useApiState()
  const [url, setUrl] = useState(getApiBase())
  const [key, setKey] = useState(getApiKey())
  const [remember, setRemember] = useState(isKeyRemembered())

  return (
    <div className="stack" style={{ gap: 10 }}>
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
          <button className="btn btn--primary" type="submit">Connect</button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setUrl('')
              setKey('')
              setApiBase('')
              setApiKey('', false)
            }}
          >
            Disconnect
          </button>
          <Badge tone={TONE[status]}>{status}</Badge>
        </div>
      </form>
      {error && <p className="neg" style={{ margin: 0 }}>{error}</p>}
      <Callout tone="warn" title="Prefer a read-only key.">The key is held in your browser and sent to your API. A read-only key can browse everything; only Backtest Lab's Strategy Backtest (a dry run that saves nothing) needs a trader-role key, which can also start and stop trading — use one only on a device you trust.</Callout>
      <Callout tone="info">GitHub Pages is HTTPS, so the API must be HTTPS too (plain <code>http://</code> is blocked as mixed content) and must allow this origin via <code>CORS_ALLOW_ORIGINS</code>.</Callout>
    </div>
  )
}
