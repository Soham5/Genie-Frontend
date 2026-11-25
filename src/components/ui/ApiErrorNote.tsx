import type { ApiError } from '@/api/client'
import { Callout } from './Panel'

/** Honest failure message for a Genie API call: a 403 means the key's role lacks access, not that the API is down. */
export function ApiErrorNote({ error, what, compact }: { error: ApiError; what: string; compact?: boolean }) {
  let tone: 'warn' | 'neg' = 'neg'
  let title = `Couldn't load ${what}.`
  let body: string = error.message
  if (error.status === 403) {
    tone = 'warn'
    title = `Not permitted to view ${what}.`
    body = `The API key's role doesn't have access to this endpoint. ${error.message}`
  } else if (error.status === 401) {
    title = 'The API rejected the key.'
    body = 'Check the key in Settings.'
  } else if (error.status === 404) {
    tone = 'warn'
    title = `No ${what} found.`
    body = 'The API answered 404 for this request.'
  }
  if (compact) return <p className={tone === 'warn' ? 'muted' : 'neg'} role="alert" style={{ fontSize: 12.5, margin: 0 }}><strong>{title}</strong> {body}</p>
  return <Callout tone={tone} title={title}>{body}</Callout>
}
