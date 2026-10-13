import { long, toDay, weekday } from '../lib/dates'
import { assigneeGroups, type Data } from '../lib/data'
import { singleItem, useReadOnly, useUI, type View } from '../lib/store'
import { Counter, Icon, Monogram, MultiSelect } from './ui'
import s from './Header.module.css'

const VIEWS: { id: View; label: string; key: string }[] = [
  { id: 'board', label: 'Board', key: '1' },
  { id: 'timeline', label: 'Timeline', key: '2' },
  { id: 'team', label: 'Team', key: '3' },
  { id: 'notes', label: 'Notes', key: '4' },
]
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function Header({ d }: { d: Data }) {
  const ui = useUI()
  const f = ui.filters
  const { team, others } = assigneeGroups(d, d.project?.id ?? null)
  const anyFilter = f.search || f.planItemIds.length || f.assigneeIds.length || f.hideDone
  const people = d.all ? d.people : team

  return (
    <header className={s.head}>
      <div className={s.top}>
        <div className={s.title}>
          <span className="mono muted">{d.all ? 'Sheet' : `Project · ${d.project!.code}`}</span>
          <h1>{d.all ? 'All projects' : d.project!.name}</h1>
        </div>
        <button className={s.jump} onClick={() => ui.set({ palette: true })} title="Search everything (Ctrl K)">
          <Icon name="search" size={16} />
          <span className={s.jumpText}>Search projects, plan items, cards…</span>
          <kbd>Ctrl</kbd><kbd>K</kbd>
        </button>
        <div className={s.when}>
          <strong>{long(d.today)}</strong>
          <span className="muted">{WEEKDAYS[weekday(toDay(d.today))]}</span>
        </div>
        {ui.role === 'view' && <span className="tag" title="Sign in with the password to make changes">View only</span>}
        {d.me && (
          <div className={s.me} title="You">
            <Monogram person={d.me} />
            <span className={s.meName}>{d.me.name}</span>
          </div>
        )}
      </div>

      <div className={s.filters} role="search">
        <label className={s.search}>
          <Icon name="search" size={15} />
          <span className="sr-only">Search</span>
          <input id="wb-search" placeholder="Search  /" value={f.search} onChange={(e) => ui.setFilter('search', e.target.value)} />
        </label>
        <MultiSelect className={s.sel} label="Plan item" all="All plan items" noun="plan items"
          value={f.planItemIds} onChange={(v) => ui.setFilter('planItemIds', v)}
          options={[
            { value: 'none', label: 'No plan item' },
            ...d.scopeItems.map((i) => ({
              value: i.id, label: i.title,
              group: d.all ? `${d.projectById.get(i.projectId)?.code} · ${i.section || 'No section'}` : i.section || 'No section',
            })),
          ]} />
        <MultiSelect className={s.sel} label="Assignee" all="Anyone" noun="people"
          value={f.assigneeIds} onChange={(v) => ui.setFilter('assigneeIds', v)}
          options={[
            { value: 'none', label: 'Unassigned' },
            ...people.map((p) => ({ value: p.id, label: p.isMe ? `${p.name} (me)` : p.name, group: d.all ? 'People' : 'Team' })),
            ...(d.all ? [] : others.map((p) => ({ value: p.id, label: p.name, group: 'Others' }))),
          ]} />
        <button className="chip" aria-pressed={f.myWork} onClick={() => ui.setFilter('myWork', !f.myWork)}
          title="Only my cards and plan items">
          My work
        </button>
        <button className="chip" aria-pressed={f.hideDone} onClick={() => ui.setFilter('hideDone', !f.hideDone)}>
          Hide done
        </button>
        {anyFilter && (
          <button className="btn ghost" onClick={ui.clearFilters}>
            <Icon name="close" size={12} /> Clear
          </button>
        )}
        <nav className={s.views} aria-label="View">
          {VIEWS.map((v) => (
            <button key={v.id} aria-pressed={ui.view === v.id} onClick={() => ui.setView(v.id)} title={`${v.label} (${v.key})`}>
              <Icon name={v.id} size={17} />
              <span className={s.viewLabel}>{v.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {ui.view !== 'timeline' && d.projects.length > 0 && (
        <div className={s.bar}>
          <Stats d={d} />
          <Actions d={d} />
        </div>
      )}
    </header>
  )
}

/** Sheet totals: progress (from cards), cards done, open and late cards. */
export function Stats({ d }: { d: Data }) {
  const open = d.scopeCards.filter((c) => c.status !== 'done')
  const late = open.filter((c) => c.due && c.due < d.today).length
  return (
    <dl className={s.stats}>
      <div><dt className="mono muted">Complete</dt><dd className={s.big}><Counter value={d.overall} /></dd></div>
      <div className={s.optional}>
        <dt className="mono muted">Cards done</dt>
        <dd className="num">{d.scopeCards.length - open.length}/{d.scopeCards.length}</dd>
      </div>
      <div>
        <dt className="mono muted">Open cards</dt>
        <dd className="num">{open.length}{late > 0 && <span className={s.late}> · {late} late</span>}</dd>
      </div>
    </dl>
  )
}

/** New card / new plan item, shown on every view. */
export function Actions({ d }: { d: Data }) {
  const ui = useUI()
  if (useReadOnly()) return null
  return (
    <div className={s.actions}>
      <button className="btn" disabled={!d.defaultProjectId}
        onClick={() => ui.open({ kind: 'card', draft: { projectId: d.defaultProjectId!, planItemId: singleItem(ui.filters), status: 'todo' } })}
        title="New card (N)" aria-label="New card">
        <Icon name="plus" size={14} /> <span className={s.actLabel}>Card</span>
      </button>
      <button className="btn primary" disabled={!d.defaultProjectId}
        onClick={() => ui.open({ kind: 'item', draft: { projectId: d.defaultProjectId! } })} aria-label="New plan item">
        <Icon name="plus" size={14} /> <span className={s.actLabel}>Plan item</span>
      </button>
    </div>
  )
}
