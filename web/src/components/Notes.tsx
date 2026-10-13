import { useMemo, useState, type FormEvent } from 'react'
import { useNoteOps, useNotes } from '../lib/api'
import { short, todayISO } from '../lib/dates'
import type { Data } from '../lib/data'
import { useUI } from '../lib/store'
import type { Note } from '../lib/types'
import { ConfirmButton, Empty, Icon } from './ui'
import s from './Notes.module.css'

/**
 * Pending items: jot things down first, file them under a project later,
 * then send each one to the board as a card.
 */
export function Notes({ d }: { d: Data }) {
  const ui = useUI()
  const notes = useNotes()
  const ops = useNoteOps()
  const [text, setText] = useState('')
  const [projectId, setProjectId] = useState<string>(d.project?.id ?? '')
  const q = ui.filters.search.trim().toLowerCase()

  // A project shows its own notes plus the unfiled ones, which could belong anywhere.
  const list = useMemo(
    () => (notes.data ?? []).filter((n) =>
      (d.all || n.projectId === d.project?.id || n.projectId === null) && (!q || n.text.toLowerCase().includes(q))),
    [notes.data, d.all, d.project, q],
  )

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    ops.create.mutate({ text: text.trim(), projectId: projectId || null })
    setText('')
  }

  const toBoard = (n: Note) =>
    ui.open({
      kind: 'card', noteId: n.id,
      draft: { title: n.text, projectId: n.projectId ?? d.project?.id ?? d.defaultProjectId ?? undefined, status: 'todo' },
    })

  return (
    <div className={s.wrap}>
      <form className={s.capture} onSubmit={add}>
        <input className={`input ${s.captureInput}`} placeholder="Write down a pending item, press Enter to add"
          value={text} onChange={(e) => setText(e.target.value)} aria-label="New note" maxLength={500} autoFocus />
        <select className={`select ${s.captureProject}`} value={projectId} aria-label="Project for the new note"
          onChange={(e) => setProjectId(e.target.value)}>
          <option value="">No project yet</option>
          {d.projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
        </select>
        <button className="btn primary" disabled={!text.trim()}><Icon name="plus" size={12} /> Add</button>
      </form>

      <div className={s.meta}>
        <span className="mono muted">Pending · {list.length}</span>
        <span className="muted">Send an item to the board to make it a card, with a plan item, assignee and due date.</span>
      </div>

      {notes.isLoading ? null : list.length === 0 ? (
        <Empty art="cards" title={q ? 'No notes match your search' : 'Nothing pending'}
          text={q ? undefined : 'Capture things here first, then send them to the board when you are ready to assign them.'} />
      ) : (
        <ul className={s.list}>
          {list.map((n) => (
            <NoteRow key={n.id} n={n} d={d}
              onText={(t) => ops.update.mutate({ id: n.id, text: t })}
              onProject={(pid) => ops.update.mutate({ id: n.id, projectId: pid })}
              onBoard={() => toBoard(n)}
              onDelete={() => ops.remove.mutate(n.id)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function NoteRow({ n, d, onText, onProject, onBoard, onDelete }: {
  n: Note; d: Data
  onText: (t: string) => void; onProject: (pid: string | null) => void; onBoard: () => void; onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const done = (v: string) => {
    setEditing(false)
    if (v.trim() && v.trim() !== n.text) onText(v.trim())
  }
  return (
    <li className={s.row}>
      {editing ? (
        <input className={`input ${s.edit}`} defaultValue={n.text} autoFocus maxLength={500} aria-label="Edit note"
          onBlur={(e) => done(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') done(e.currentTarget.value)
            if (e.key === 'Escape') setEditing(false)
          }} />
      ) : (
        <button className={s.text} onClick={() => setEditing(true)} title="Click to edit">{n.text}</button>
      )}
      <select className={`select ${s.project}`} value={n.projectId ?? ''} aria-label="Project"
        onChange={(e) => onProject(e.target.value || null)}>
        <option value="">No project</option>
        {d.projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
      </select>
      <span className={`num muted ${s.date}`} title="Added">{short(todayISO(n.createdAt))}</span>
      <button className="btn" onClick={onBoard} title="Make this a card on the board">
        <Icon name="send" size={13} /> <span className={s.boardLabel}>To board</span>
      </button>
      <ConfirmButton onConfirm={onDelete}>Delete</ConfirmButton>
    </li>
  )
}
