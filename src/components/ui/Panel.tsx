import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, Inbox, OctagonAlert } from 'lucide-react'
import { clsx } from '@/lib/clsx'

export function Panel({ title, sub, actions, children, flush, className, help }: {
  title?: ReactNode
  sub?: ReactNode
  actions?: ReactNode
  children: ReactNode
  flush?: boolean
  className?: string
  help?: string
}) {
  return (
    <section className={clsx('panel', flush && 'panel--flush', className)}>
      {(title || actions) && (
        <header className="panel__head">
          <div>
            <h3 className="panel__title">
              {title}
              {help && <InfoTip text={help} />}
            </h3>
            {sub && <p className="panel__sub">{sub}</p>}
          </div>
          {actions && <div className="panel__actions">{actions}</div>}
        </header>
      )}
      <div className="panel__body">{children}</div>
    </section>
  )
}

export function InfoTip({ text }: { text: string }) {
  return (
    <span className="muted" data-tip={text} data-tip-align="left" tabIndex={0} role="img" aria-label={text} style={{ display: 'inline-flex' }}>
      <Info size={13} />
    </span>
  )
}

type Tone = 'pos' | 'neg' | 'warn' | 'info' | 'accent' | 'violet' | 'outline' | 'muted'

export function Badge({ tone = 'muted', children, dot, title }: { tone?: Tone; children: ReactNode; dot?: boolean; title?: string }) {
  return (
    <span className={clsx('badge', tone !== 'muted' && `badge--${tone}`)} title={title}>
      {dot && <span className={clsx('dot', tone !== 'muted' && tone !== 'outline' && `dot--${tone}`)} />}
      {children}
    </span>
  )
}

export function Dot({ tone, pulse }: { tone?: 'pos' | 'neg' | 'warn' | 'info'; pulse?: boolean }) {
  return <span className={clsx('dot', tone && `dot--${tone}`, pulse && 'dot--pulse')} aria-hidden />
}

export function Callout({ tone = 'info', children, title }: { tone?: 'info' | 'warn' | 'neg' | 'pos'; children: ReactNode; title?: string }) {
  const Icon = { info: Info, warn: AlertTriangle, neg: OctagonAlert, pos: CheckCircle2 }[tone]
  return (
    <div className={clsx('callout', `callout--${tone}`)} role={tone === 'neg' || tone === 'warn' ? 'alert' : 'note'}>
      <Icon size={16} />
      <div>
        {title && <strong style={{ color: 'var(--text)' }}>{title} </strong>}
        {children}
      </div>
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={22} />
      <strong style={{ color: 'var(--text-2)' }}>{title}</strong>
      {children && <span style={{ maxWidth: 420 }}>{children}</span>}
    </div>
  )
}

export function Seg<T extends string>({ value, onChange, options, label }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  label: string
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="seg__btn" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page__head">
      <div>
        <h1 className="page__title">{title}</h1>
        {sub && <p className="page__sub">{sub}</p>}
      </div>
      {actions && <div className="page__actions">{actions}</div>}
    </div>
  )
}

export function Skeleton({ height = 200 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} aria-hidden />
}
