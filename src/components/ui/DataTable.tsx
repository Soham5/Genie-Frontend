import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { clsx } from '@/lib/clsx'
import { Empty } from './Panel'

export interface Column<T> {
  key: string
  header: ReactNode
  /** `open` is true while the row's `expand` detail is showing. */
  cell: (row: T, ctx: { open: boolean }) => ReactNode
  /** Provide to make the column sortable. */
  sort?: (row: T) => number | string | null
  align?: 'r' | 'c'
  wrap?: boolean
  tip?: string
}

export function DataTable<T>({ rows, columns, rowKey, initialSort, maxHeight, onRowClick, expand, canExpand, emptyTitle = 'Nothing to show', emptyHint, dense }: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  maxHeight?: number
  onRowClick?: (row: T) => void
  /** When provided, rows toggle an expanded detail row on click. */
  expand?: (row: T) => ReactNode
  /** Limits `expand` to the rows this accepts; the others behave as if `expand` were not set. */
  canExpand?: (row: T) => boolean
  emptyTitle?: string
  emptyHint?: ReactNode
  dense?: boolean
}) {
  const [sort, setSort] = useState(initialSort ?? null)
  const [open, setOpen] = useState<string | null>(null)

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key)
    if (!col?.sort || !sort) return rows
    const f = col.sort
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = f(a)
      const y = f(b)
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      return (x < y ? -1 : x > y ? 1 : 0) * dir
    })
  }, [rows, columns, sort])

  if (!rows.length) return <Empty title={emptyTitle}>{emptyHint}</Empty>

  const toggle = (key: string) => setSort((s) => (s?.key === key ? (s.dir === 'desc' ? { key, dir: 'asc' } : null) : { key, dir: 'desc' }))

  return (
    <div className="tbl-wrap" style={maxHeight ? ({ '--tbl-max': `${maxHeight}px` } as CSSProperties) : undefined}>
      <table className={clsx('tbl', dense && 'tbl--dense')}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={clsx(c.align, c.sort && 'sortable')}
                onClick={c.sort ? () => toggle(c.key) : undefined}
                aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                data-tip={c.tip}
              >
                {c.header}
                {sort?.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="sort" size={11} /> : <ArrowDown className="sort" size={11} />)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const k = rowKey(row)
            const expandable = !!expand && (canExpand?.(row) ?? true)
            const isOpen = expandable && open === k
            const clickable = expandable || !!onRowClick
            return (
              <Fragment key={k}>
                <tr
                  className={clsx(clickable && 'clickable', isOpen && 'expanded')}
                  onClick={() => (expandable ? setOpen(isOpen ? null : k) : onRowClick?.(row))}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={clsx(c.align, c.wrap && 'wrap')}>
                      {c.cell(row, { open: isOpen })}
                    </td>
                  ))}
                </tr>
                {isOpen && expand && (
                  <tr className="expanded">
                    <td colSpan={columns.length} style={{ padding: '12px 16px' }}>
                      {expand(row)}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
