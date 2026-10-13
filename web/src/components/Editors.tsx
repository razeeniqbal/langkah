import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  useCreateCard, useCreateItem, useDeleteCard, useDeleteItem, useDeleteProject,
  useNoteOps, useSaveProject, useUpdateCard, useUpdateItem,
} from '../lib/api'
import { addDays, short, span, todayISO } from '../lib/dates'
import { assigneeGroups, isLate, type Data } from '../lib/data'
import { useReadOnly, useUI } from '../lib/store'
import { POINTS, STATUSES, type Card, type PlanItem, type Project } from '../lib/types'
import { ConfirmButton, Counter, Field, Icon, Monogram, ProgressBar } from './ui'
import s from './Editors.module.css'

export function Drawer({ d }: { d: Data }) {
  const editor = useUI((x) => x.editor)
  const close = useUI((x) => x.close)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (editor) panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [editor?.kind, editor && 'id' in editor ? editor.id : null]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!editor) return null
  const key = `${editor.kind}:${editor.id ?? 'new'}`
  return (
    <div className={s.overlay} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={panel} className={s.panel} role="dialog" aria-modal="true">
        {editor.kind === 'card' && <CardEditor key={key} d={d} id={editor.id} draft={editor.draft} noteId={editor.noteId} />}
        {editor.kind === 'item' && <ItemEditor key={key} d={d} id={editor.id} draft={editor.draft} />}
        {editor.kind === 'project' && <ProjectEditor key={key} d={d} id={editor.id} />}
      </div>
    </div>
  )
}

function Head({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  const close = useUI((x) => x.close)
  return (
    <header className={s.head}>
      <div>
        <div className="mono muted">{kicker}</div>
        <h2>{title}</h2>
      </div>
      {children}
      <button type="button" className="btn ghost icon" onClick={close} title="Close (Esc)"><Icon name="close" /></button>
    </header>
  )
}

function Foot({ onDelete, deleteLabel = 'Delete', deleteDisabled, deleteTitle, saveLabel, error }: {
  onDelete?: () => void; deleteLabel?: string; deleteDisabled?: boolean; deleteTitle?: string; saveLabel: string; error?: string | null
}) {
  const close = useUI((x) => x.close)
  if (useReadOnly()) {
    return (
      <footer className={s.foot}>
        <span className="mono muted">View only</span>
        <span className={s.spacer} />
        <button type="button" className="btn" onClick={close}>Close</button>
      </footer>
    )
  }
  return (
    <footer className={s.foot}>
      {onDelete && <ConfirmButton onConfirm={onDelete} disabled={deleteDisabled} title={deleteTitle}>{deleteLabel}</ConfirmButton>}
      {error && <span className={s.error}>{error}</span>}
      <span className={s.spacer} />
      <button type="button" className="btn ghost" onClick={close}>Cancel</button>
      <button type="submit" className="btn primary" title="Ctrl Enter">{saveLabel}</button>
    </footer>
  )
}

const submitOnCtrlEnter = (e: React.KeyboardEvent<HTMLFormElement>) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    e.currentTarget.requestSubmit()
  }
}

/** One project's plan items grouped by section, for the link dropdown. */
function ItemOptions({ d, projectId }: { d: Data; projectId: string | null }) {
  const sections = new Map<string, PlanItem[]>()
  for (const i of d.items) {
    if (i.projectId === projectId) sections.set(i.section, [...(sections.get(i.section) ?? []), i])
  }
  return (
    <>
      {[...sections].map(([section, items]) => (
        <optgroup key={section} label={section || 'No section'}>
          {items.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
        </optgroup>
      ))}
    </>
  )
}

function PersonSelect({ d, projectId, value, onChange, label }: {
  d: Data; projectId: string | null; value: string | null; onChange: (v: string | null) => void; label: string
}) {
  const { team, others } = assigneeGroups(d, projectId)
  return (
    <select className="select" aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Unassigned</option>
      {team.length > 0 && (
        <optgroup label="Team">
          {team.map((p) => <option key={p.id} value={p.id}>{p.name}{p.isMe ? ' (me)' : ''}</option>)}
        </optgroup>
      )}
      {others.length > 0 && (
        <optgroup label="Others">
          {others.map((p) => <option key={p.id} value={p.id}>{p.name}{p.isMe ? ' (me)' : ''}</option>)}
        </optgroup>
      )}
    </select>
  )
}

// Card ------------------------------------------------------------------------
function CardEditor({ d, id, draft, noteId }: { d: Data; id?: string; draft?: Partial<Card>; noteId?: string }) {
  const existing = id ? d.cards.find((c) => c.id === id) : undefined
  const [f, setF] = useState<Partial<Card>>(() => existing ?? {
    title: '', status: 'todo', points: 1, due: null, notes: '', assigneeId: null, planItemId: null, ...draft,
  })
  const set = (p: Partial<Card>) => setF((x) => ({ ...x, ...p }))
  const create = useCreateCard()
  const update = useUpdateCard()
  const del = useDeleteCard()
  const notes = useNoteOps()
  const ui = useUI()
  const ro = useReadOnly()
  const [error, setError] = useState<string | null>(null)
  const item = f.planItemId ? d.itemById.get(f.planItemId) : undefined
  const projectId = item?.projectId ?? f.projectId ?? d.defaultProjectId

  if (id && !existing) return <Head kicker="Card" title="This card no longer exists" />

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (ro) return
    if (!f.title?.trim()) return setError('A card needs a title.')
    const body = {
      title: f.title.trim(), planItemId: f.planItemId ?? null, projectId: projectId ?? undefined,
      assigneeId: f.assigneeId ?? null, status: f.status, due: f.due || null, points: f.points, notes: f.notes ?? '',
    }
    if (existing) update.mutate({ id: existing.id, ...body })
    else if (noteId) notes.promote.mutate({ id: noteId, ...body })
    else create.mutate(body)
    ui.close()
  }

  return (
    <form className={s.form} onSubmit={submit} onKeyDown={submitOnCtrlEnter}>
      <Head kicker={existing ? `Card · ${d.projectById.get(existing.projectId)?.code ?? ''}` : noteId ? 'Note → card' : 'New card'}
        title={existing ? existing.title : noteId ? 'Send to board' : 'New card'}>
        {existing && isLate(existing, d.today) && <span className="tag late">Late</span>}
      </Head>
      <fieldset className={s.body} disabled={ro}>
        <Field label="Title">
          <input className={`input ${s.titleInput}`} data-autofocus value={f.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Project">
          <select className="select" value={projectId ?? ''}
            onChange={(e) => {
              // A plan item belongs to one project, so switching project drops the link.
              const pid = e.target.value
              set({ projectId: pid, planItemId: item && item.projectId !== pid ? null : f.planItemId ?? null })
            }}>
            {d.projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </select>
        </Field>
        <Field label="Plan item" hint={item ? <ItemHint d={d} item={item} /> : 'Fine for work outside the plan; it still counts toward the project %.'}>
          <select className="select" value={f.planItemId ?? ''} onChange={(e) => set({ planItemId: e.target.value || null })}>
            <option value="">No plan item (not on the timeline)</option>
            <ItemOptions d={d} projectId={projectId ?? null} />
          </select>
        </Field>
        <Field label="Status">
          <div className={`seg ${s.wide}`} role="group" aria-label="Status">
            {STATUSES.map((st) => (
              <button type="button" key={st.id} aria-pressed={f.status === st.id} onClick={() => set({ status: st.id })}>{st.label}</button>
            ))}
          </div>
        </Field>
        <div className={s.cols}>
          <Field label="Assignee">
            <PersonSelect d={d} projectId={projectId ?? null} value={f.assigneeId ?? null} onChange={(v) => set({ assigneeId: v })} label="Assignee" />
          </Field>
          <Field label="Due">
            <input type="date" className="input" value={f.due ?? ''} onChange={(e) => set({ due: e.target.value || null })} />
          </Field>
        </div>
        <Field label="Effort (points)">
          <div className="seg" role="group" aria-label="Effort">
            {POINTS.map((p) => (
              <button type="button" key={p} aria-pressed={f.points === p} onClick={() => set({ points: p })}>{p}</button>
            ))}
          </div>
        </Field>
        <Field label="Notes">
          <textarea className="textarea" rows={5} value={f.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </fieldset>
      <Foot saveLabel={existing ? 'Save' : noteId ? 'Add to board' : 'Create card'} error={error}
        onDelete={existing ? () => { del.mutate(existing.id); ui.close() } : undefined} />
    </form>
  )
}

function ItemHint({ d, item }: { d: Data; item: PlanItem }) {
  const p = d.progress.get(item.id)
  return (
    <span className={s.hint}>
      {d.projectById.get(item.projectId)?.code} · {short(item.start)} → {short(item.end)} · {Math.round(p?.progress ?? 0)}% · {p?.cardsDone ?? 0}/{p?.cardCount ?? 0} cards
    </span>
  )
}

// Plan item -------------------------------------------------------------------
function ItemEditor({ d, id, draft }: { d: Data; id?: string; draft?: Partial<PlanItem> }) {
  const existing = id ? d.itemById.get(id) : undefined
  const t = todayISO()
  const [f, setF] = useState<Partial<PlanItem>>(() => existing ?? {
    title: '', section: '', ownerId: null, start: t, end: addDays(t, 13), milestone: false,
    progressMode: 'auto', manualProgress: 0, notes: '', ...draft,
  })
  const set = (p: Partial<PlanItem>) => setF((x) => ({ ...x, ...p }))
  const create = useCreateItem()
  const update = useUpdateItem()
  const del = useDeleteItem()
  const createCard = useCreateCard()
  const ui = useUI()
  const ro = useReadOnly()
  const [error, setError] = useState<string | null>(null)
  const [newCard, setNewCard] = useState('')
  const cards = existing ? d.cardsByItem.get(existing.id) ?? [] : []
  const progress = existing ? d.progress.get(existing.id) : undefined
  const sections = useMemo(
    () => [...new Set(d.items.filter((i) => i.projectId === f.projectId).map((i) => i.section).filter(Boolean))],
    [d.items, f.projectId],
  )

  if (id && !existing) return <Head kicker="Plan item" title="This plan item no longer exists" />

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (ro) return
    if (!f.title?.trim()) return setError('A plan item needs a title.')
    if (!f.start || (!f.milestone && (!f.end || f.end < f.start))) return setError('End must be on or after start.')
    const body = {
      title: f.title.trim(), projectId: f.projectId, section: (f.section ?? '').trim(), ownerId: f.ownerId ?? null,
      start: f.start, end: f.milestone ? f.start : f.end, milestone: !!f.milestone, notes: f.notes ?? '',
    }
    if (existing) update.mutate({ id: existing.id, ...body })
    else create.mutate(body)
    ui.close()
  }

  return (
    <form className={s.form} onSubmit={submit} onKeyDown={submitOnCtrlEnter}>
      <Head kicker={existing ? `Plan item · ${d.projectById.get(existing.projectId)?.code ?? ''}${existing.milestone ? ' · Milestone' : ''}` : 'New plan item'}
        title={existing ? existing.title : 'New plan item'} />
      <div className={s.body}>
        {existing && (
          <div className={s.progress}>
            <div>
              <div className="mono muted">Progress · {cards.length ? `from ${cards.length} card${cards.length === 1 ? '' : 's'}` : 'no cards yet'}</div>
              <ProgressBar value={progress?.progress ?? 0} />
            </div>
            <strong><Counter value={progress?.progress ?? 0} /></strong>
          </div>
        )}
        <fieldset className={s.fields} disabled={ro}>
        <Field label="Title">
          <input className={`input ${s.titleInput}`} data-autofocus value={f.title ?? ''} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <div className={s.cols}>
          <Field label="Project">
            <select className="select" value={f.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value })}>
              {d.projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </select>
          </Field>
          <Field label="Section">
            <input className="input" list="wb-sections" value={f.section ?? ''} onChange={(e) => set({ section: e.target.value })}
              placeholder="e.g. PSC Management" />
            <datalist id="wb-sections">{sections.map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
        </div>
        <Field label="Owner">
          <PersonSelect d={d} projectId={f.projectId ?? null} value={f.ownerId ?? null} onChange={(v) => set({ ownerId: v })} label="Owner" />
        </Field>
        <div className={s.cols}>
          <Field label={f.milestone ? 'Date' : 'Start'}>
            <input type="date" className="input" value={f.start ?? ''} onChange={(e) => set({ start: e.target.value })} />
          </Field>
          {!f.milestone && (
            <Field label="End" hint={f.start && f.end && f.end >= f.start ? `${span(f.start, f.end)} days` : undefined}>
              <input type="date" className="input" value={f.end ?? ''} min={f.start} onChange={(e) => set({ end: e.target.value })} />
            </Field>
          )}
        </div>
        <label className={s.check}>
          <input type="checkbox" checked={!!f.milestone} onChange={(e) => set({ milestone: e.target.checked })} />
          <span>Milestone (a single date, drawn as a diamond)</span>
        </label>
        <Field label="Notes">
          <textarea className="textarea" rows={3} value={f.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        </fieldset>

        {existing && (
          <div className={s.cards}>
            <div className={s.cardsHead}>
              <span className="mono muted">Linked cards · {cards.length}</span>
              <button type="button" className="btn ghost" onClick={() => { ui.setFilter('planItemIds', [existing.id]); ui.setView('board'); ui.close() }}>
                Open on board
              </button>
            </div>
            {cards.map((c) => (
              <button type="button" key={c.id} className={s.cardRow} onClick={() => ui.open({ kind: 'card', id: c.id })}>
                <span className={`mono ${s.status}`} data-status={c.status}>{STATUSES.find((x) => x.id === c.status)?.label}</span>
                <span className={s.cardTitle}>{c.title}</span>
                <span className={`num muted ${isLate(c, d.today) ? s.lateText : ''}`}>{short(c.due)}</span>
                <span className="num muted">{c.points}pt</span>
                <Monogram person={c.assigneeId ? d.personById.get(c.assigneeId) : null} small />
              </button>
            ))}
            {!ro && <div className={s.addCard}>
              <input className="input" placeholder="Add card…" value={newCard} onChange={(e) => setNewCard(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (newCard.trim()) createCard.mutate({ title: newCard.trim(), planItemId: existing.id, status: 'todo' })
                    setNewCard('')
                  }
                }} />
              <button type="button" className="btn" disabled={!newCard.trim()}
                onClick={() => { createCard.mutate({ title: newCard.trim(), planItemId: existing.id, status: 'todo' }); setNewCard('') }}>
                <Icon name="plus" size={12} /> Add card
              </button>
            </div>}
          </div>
        )}
      </div>
      <Foot saveLabel={existing ? 'Save' : 'Create plan item'} error={error}
        deleteTitle="Its cards stay on the board, unlinked"
        onDelete={existing ? () => { del.mutate(existing.id); ui.setFilter('planItemIds', ui.filters.planItemIds.filter((x) => x !== existing.id)); ui.close() } : undefined} />
    </form>
  )
}

// Project ---------------------------------------------------------------------
function ProjectEditor({ d, id }: { d: Data; id?: string }) {
  const existing: Project | undefined = id ? d.projectById.get(id) : undefined
  const [name, setName] = useState(existing?.name ?? '')
  const [code, setCode] = useState(existing?.code ?? '')
  const [codeTouched, setCodeTouched] = useState(!!existing)
  const [error, setError] = useState<string | null>(null)
  const save = useSaveProject()
  const del = useDeleteProject()
  const ui = useUI()
  const ro = useReadOnly()
  const items = existing ? d.items.filter((i) => i.projectId === existing.id).length : 0
  const cards = existing ? d.cards.filter((c) => c.projectId === existing.id).length : 0

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (ro) return
    if (!name.trim()) return setError('Give the project a name.')
    if (!/^[A-Z0-9]{2,3}$/.test(code)) return setError('Code is 2 to 3 letters or digits.')
    try {
      const p = await save.mutateAsync({ id: existing?.id, name: name.trim(), code })
      if (!existing) ui.setProject(p.id)
      ui.close()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form className={s.form} onSubmit={submit} onKeyDown={submitOnCtrlEnter}>
      <Head kicker={existing ? `Project · ${existing.code}` : 'New project'} title={existing ? existing.name : 'New project'} />
      <fieldset className={s.body} disabled={ro}>
        <Field label="Name">
          <input className={`input ${s.titleInput}`} data-autofocus value={name} placeholder="DIC Abandonment"
            onChange={(e) => {
              setName(e.target.value)
              // Suggest a code from the initials until the user types one.
              if (!codeTouched) setCode(e.target.value.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3))
            }} />
        </Field>
        <Field label="Code" hint="2 to 3 letters, shown in the sidebar and on cards.">
          <input className={`input ${s.code}`} value={code} maxLength={3} placeholder="DIC"
            onChange={(e) => { setCodeTouched(true); setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')) }} />
        </Field>
        {existing && (
          <p className="muted">
            {items} plan items · {cards} cards · {d.people.filter((p) => p.projectIds.includes(existing.id)).length} people
          </p>
        )}
      </fieldset>
      <Foot saveLabel={existing ? 'Save' : 'Create project'} error={error}
        deleteDisabled={items + cards > 0}
        deleteTitle={items + cards > 0 ? 'Only empty projects can be deleted' : undefined}
        onDelete={existing ? () => {
          del.mutate(existing.id)
          if (ui.projectId === existing.id) ui.setProject('all')
          ui.close()
        } : undefined} />
    </form>
  )
}
