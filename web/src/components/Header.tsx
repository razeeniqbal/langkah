import { long } from '../lib/dates'
import { assigneeGroups, type Data } from '../lib/data'
import { useUI, type View } from '../lib/store'
import { Counter, Icon } from './ui'
import s from './Header.module.css'

const VIEWS: { id: View; label: string; key: string }[] = [
  { id: 'board', label: 'Board', key: '1' },
  { id: 'timeline', label: 'Timeline', key: '2' },
  { id: 'team', label: 'Team', key: '3' },
]

export function Header({ d }: { d: Data }) {
  const ui = useUI()
  const f = ui.filters
  const open = d.scopeCards.filter((c) => c.status !== 'done')
  const late = open.filter((c) => c.due && c.due < d.today).length
  const { team, others } = assigneeGroups(d, d.project?.id ?? null)
  const anyFilter = f.search || f.planItemId || f.assigneeId || f.hideDone

  return (
    <header className={s.head}>
      {/* Title block, like the corner of a drawing sheet. */}
      <div className={s.block}>
        <div className={`${s.cell} ${s.title}`}>
          <span className="mono muted">{d.all ? 'Sheet' : `Project · ${d.project!.code}`}</span>
          <h1>{d.all ? 'All projects' : d.project!.name}</h1>
        </div>
        <div className={s.cell}>
          <span className="mono muted">Complete</span>
          <strong className={s.big}><Counter value={d.overall} /></strong>
        </div>
        <div className={`${s.cell} ${s.optional}`}>
          <span className="mono muted">Plan items</span>
          <strong className="num">{d.scopeItems.length}</strong>
        </div>
        <div className={`${s.cell} ${s.optional}`}>
          <span className="mono muted">Open cards</span>
          <strong className="num">{open.length}{late > 0 && <span className={s.late}> · {late} late</span>}</strong>
        </div>
        <div className={`${s.cell} ${s.optional}`}>
          <span className="mono muted">Date</span>
          <strong className="num">{long(d.today)}</strong>
        </div>
        <nav className={s.views} aria-label="View">
          {VIEWS.map((v) => (
            <button key={v.id} aria-pressed={ui.view === v.id} onClick={() => ui.setView(v.id)} title={`${v.label} (${v.key})`}>
              <Icon name={v.id} size={13} />
              <span className={s.viewLabel}>{v.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className={s.filters} role="search">
        <label className={s.search}>
          <Icon name="search" size={13} />
          <span className="sr-only">Search</span>
          <input id="wb-search" placeholder="Search  /" value={f.search} onChange={(e) => ui.setFilter('search', e.target.value)} />
        </label>
        <select className={`select ${s.sel}`} aria-label="Plan item" value={f.planItemId ?? ''}
          onChange={(e) => ui.setFilter('planItemId', e.target.value || null)}>
          <option value="">All plan items</option>
          {d.scopeItems.map((i) => (
            <option key={i.id} value={i.id}>
              {d.all ? `${d.projectById.get(i.projectId)?.code} · ` : ''}{i.title}
            </option>
          ))}
        </select>
        <select className={`select ${s.sel}`} aria-label="Assignee" value={f.assigneeId ?? ''}
          onChange={(e) => ui.setFilter('assigneeId', e.target.value || null)}>
          <option value="">Anyone</option>
          <option value="none">Unassigned</option>
          <optgroup label={d.all ? 'People' : 'Team'}>
            {(d.all ? d.people : team).map((p) => <option key={p.id} value={p.id}>{p.name}{p.isMe ? ' (me)' : ''}</option>)}
          </optgroup>
          {!d.all && others.length > 0 && (
            <optgroup label="Others">
              {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </optgroup>
          )}
        </select>
        <button className={`btn ${f.myWork ? 'on' : ''}`} aria-pressed={f.myWork} onClick={() => ui.setFilter('myWork', !f.myWork)}
          title="Only my cards and plan items">
          My work
        </button>
        <button className={`btn ${f.hideDone ? 'on' : ''}`} aria-pressed={f.hideDone} onClick={() => ui.setFilter('hideDone', !f.hideDone)}>
          Hide done
        </button>
        {anyFilter && (
          <button className="btn ghost" onClick={ui.clearFilters}>
            <Icon name="close" size={11} /> Clear
          </button>
        )}
        <div className={s.spacer} />
        <button className="btn primary" disabled={!d.defaultProjectId}
          onClick={() => ui.open({ kind: 'card', draft: { projectId: d.defaultProjectId!, planItemId: f.planItemId, status: 'todo' } })}
          title="New card (N)">
          <Icon name="plus" size={12} /> Card
        </button>
        <button className="btn" disabled={!d.defaultProjectId}
          onClick={() => ui.open({ kind: 'item', draft: { projectId: d.defaultProjectId! } })}>
          <Icon name="plus" size={12} /> Plan item
        </button>
      </div>
    </header>
  )
}
