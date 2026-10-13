import { useState } from 'react'
import { usePeopleOps } from '../lib/api'
import { isLate, type Data } from '../lib/data'
import { useUI } from '../lib/store'
import type { Person } from '../lib/types'
import { ConfirmButton, Empty, Icon, Monogram } from './ui'
import s from './Team.module.css'

export function Team({ d }: { d: Data }) {
  const ui = useUI()
  const ops = usePeopleOps()
  const [name, setName] = useState('')
  const people = ui.filters.myWork ? d.team.filter((p) => p.isMe) : d.team
  const outside = d.project ? d.people.filter((p) => !p.projectIds.includes(d.project!.id)) : []

  const stats = people.map((p) => {
    const open = d.scopeCards.filter((c) => c.assigneeId === p.id && c.status !== 'done')
    return {
      person: p,
      open: open.length,
      points: open.reduce((n, c) => n + c.points, 0),
      late: open.filter((c) => isLate(c, d.today)).length,
      owned: d.scopeItems.filter((i) => i.ownerId === p.id).length,
    }
  })
  const maxPoints = Math.max(8, ...stats.map((x) => x.points))

  const showCards = (p: Person) => {
    ui.setFilter('assigneeId', p.id)
    ui.setView('board')
  }

  return (
    <div className={s.wrap}>
      {d.project && (
        <form className={s.add} onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) ops.create.mutate({ name: name.trim(), projectIds: [d.project!.id] })
          setName('')
        }}>
          <input className="input" placeholder={`Add a new person to ${d.project.code}`} value={name}
            onChange={(e) => setName(e.target.value)} aria-label="New person name" />
          <button className="btn primary" disabled={!name.trim()}><Icon name="plus" size={12} /> Add</button>
          {outside.length > 0 && (
            <select className={`select ${s.existing}`} value="" aria-label="Add an existing person"
              onChange={(e) => e.target.value && ops.join.mutate({ id: e.target.value, projectId: d.project!.id })}>
              <option value="">Add someone from another project…</option>
              {outside.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </form>
      )}
      {d.all && (
        <p className={`muted ${s.note}`}>
          Everyone across all projects. Pick a project in the sidebar to add or remove people from its team.
        </p>
      )}

      {stats.length === 0 ? (
        <Empty art="team" title="No one on this team yet" text="Add people above to assign cards and plan items." />
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr className="mono">
                <th>Person</th>
                {d.all && <th className={s.hideSm}>Projects</th>}
                <th className={s.n}>Open cards</th>
                <th className={s.n}>Open pts</th>
                <th className={s.n}>Late</th>
                <th className={`${s.n} ${s.hideSm}`}>Items owned</th>
                <th className={s.load}>Workload</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {stats.map(({ person: p, open, points, late, owned }) => (
                <tr key={p.id}>
                  <td>
                    <div className={s.person}>
                      <Monogram person={p} />
                      <NameCell person={p} onSave={(n) => ops.rename.mutate({ id: p.id, name: n })} />
                      {p.isMe && <span className="tag me">Me</span>}
                    </div>
                  </td>
                  {d.all && (
                    <td className={`mono muted ${s.hideSm}`}>
                      {p.projectIds.map((id) => d.projectById.get(id)?.code).filter(Boolean).join(' · ')}
                    </td>
                  )}
                  <td className={s.n}>
                    <button className={s.link} onClick={() => showCards(p)} title="Show on board">{open}</button>
                  </td>
                  <td className={`num ${s.n}`}>{points}</td>
                  <td className={`num ${s.n} ${late ? s.late : ''}`}>{late}</td>
                  <td className={`num ${s.n} ${s.hideSm}`}>{owned}</td>
                  <td className={s.load}>
                    <div className={s.loadBar} title={`${points} open points`}>
                      <i style={{ transform: `scaleX(${points / maxPoints})` }} />
                    </div>
                  </td>
                  <td className={s.actions}>
                    {d.project ? (
                      <ConfirmButton onConfirm={() => ops.leave.mutate({ id: p.id, projectId: d.project!.id })}
                        title={`Remove from ${d.project.code}; their ${d.project.code} cards and items become unassigned`}>
                        Remove
                      </ConfirmButton>
                    ) : (
                      <ConfirmButton disabled={p.isMe} onConfirm={() => ops.remove.mutate(p.id)}
                        title={p.isMe ? 'You cannot delete yourself' : 'Delete everywhere; all their work becomes unassigned'}>
                        Delete
                      </ConfirmButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function NameCell({ person, onSave }: { person: Person; onSave: (n: string) => void }) {
  const [editing, setEditing] = useState(false)
  if (!editing) {
    return (
      <button className={s.name} onClick={() => setEditing(true)} title="Click to rename">{person.name}</button>
    )
  }
  const done = (v: string) => {
    setEditing(false)
    if (v.trim() && v.trim() !== person.name) onSave(v.trim())
  }
  return (
    <input className={`input ${s.nameInput}`} defaultValue={person.name} autoFocus
      onBlur={(e) => done(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done(e.currentTarget.value)
        if (e.key === 'Escape') setEditing(false)
      }} />
  )
}
