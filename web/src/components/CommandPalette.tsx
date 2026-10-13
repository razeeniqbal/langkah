import { useEffect, useMemo, useRef, useState } from 'react'
import { useCreateCard } from '../lib/api'
import type { Data } from '../lib/data'
import { singleItem, useUI } from '../lib/store'
import { Icon } from './ui'
import s from './CommandPalette.module.css'

interface Cmd {
  id: string
  group: string
  label: string
  meta?: string
  run: () => void
}

export function CommandPalette({ d }: { d: Data }) {
  const ui = useUI()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const create = useCreateCard()

  useEffect(() => {
    if (ui.palette) {
      setQ('')
      setSel(0)
    }
  }, [ui.palette])

  const cmds = useMemo<Cmd[]>(() => {
    if (!ui.palette) return []
    const query = q.trim().toLowerCase()
    const hit = (...xs: string[]) => !query || xs.some((x) => x.toLowerCase().includes(query))
    const out: Cmd[] = []
    const pid = d.defaultProjectId
    const one = singleItem(ui.filters)
    const filterItem = one ? d.itemById.get(one) : undefined

    if (query && pid && ui.role !== 'view') {
      out.push({
        id: 'new-card-quick', group: 'Create', label: `New card “${q.trim()}”`,
        meta: filterItem ? `in ${filterItem.title}` : `in ${d.projectById.get(pid)?.code}`,
        run: () => create.mutate({ title: q.trim(), status: 'todo', planItemId: filterItem?.id ?? null, projectId: filterItem?.projectId ?? pid }),
      })
    }
    const actions: Cmd[] = [
      { id: 'a-card', group: 'Create', label: 'New card…', meta: 'N', run: () => pid && ui.open({ kind: 'card', draft: { projectId: pid, status: 'todo' } }) },
      { id: 'a-item', group: 'Create', label: 'New plan item…', run: () => pid && ui.open({ kind: 'item', draft: { projectId: pid } }) },
      { id: 'a-project', group: 'Create', label: 'New project…', run: () => ui.open({ kind: 'project' }) },
      { id: 'v-board', group: 'Go to', label: 'Board', meta: '1', run: () => ui.setView('board') },
      { id: 'v-timeline', group: 'Go to', label: 'Timeline', meta: '2', run: () => ui.setView('timeline') },
      { id: 'v-team', group: 'Go to', label: 'Team', meta: '3', run: () => ui.setView('team') },
      { id: 't-me', group: 'Toggle', label: ui.filters.myWork ? 'Show everyone’s work' : 'Show only my work', run: () => ui.setFilter('myWork', !ui.filters.myWork) },
      { id: 't-theme', group: 'Toggle', label: 'Switch theme', meta: ui.theme, run: () => ui.set({ theme: ui.theme === 'dark' ? 'light' : 'dark' }) },
      { id: 't-sheet', group: 'Toggle', label: ui.sheet ? 'Leave drawing-sheet mode' : 'Drawing-sheet mode', run: () => ui.set({ sheet: !ui.sheet, view: 'timeline' }) },
    ]
    out.push(...actions.filter((a) => hit(a.label, a.group) && !(ui.role === 'view' && a.group === 'Create')))

    out.push({ id: 'p-all', group: 'Projects', label: 'All projects', meta: '∑', run: () => ui.setProject('all') })
    for (const p of d.projects) {
      if (hit(p.name, p.code)) out.push({ id: `p-${p.id}`, group: 'Projects', label: p.name, meta: p.code, run: () => ui.setProject(p.id) })
    }
    if (!hit('all projects')) out.splice(out.findIndex((c) => c.id === 'p-all'), 1)

    for (const i of d.items) {
      if (query && hit(i.title, i.section)) {
        out.push({
          id: `i-${i.id}`, group: 'Plan items', label: i.title,
          meta: `${d.projectById.get(i.projectId)?.code} · ${i.section || '—'}`,
          run: () => { ui.setProject(i.projectId); ui.open({ kind: 'item', id: i.id }) },
        })
      }
    }
    for (const p of d.people) {
      if (query && hit(p.name)) {
        out.push({
          id: `m-${p.id}`, group: 'People', label: p.name, meta: p.isMe ? 'me' : 'show cards',
          run: () => { ui.setFilter('assigneeIds', [p.id]); ui.setView('board') },
        })
      }
    }
    for (const c of d.cards) {
      if (query.length > 1 && hit(c.title)) {
        out.push({ id: `c-${c.id}`, group: 'Cards', label: c.title, meta: d.projectById.get(c.projectId)?.code, run: () => ui.open({ kind: 'card', id: c.id }) })
      }
    }
    return out.slice(0, 60)
  }, [ui.palette, q, d, ui.filters, ui.theme, ui.sheet]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setSel(0), [q])
  useEffect(() => {
    list.current?.querySelector('[data-sel]')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  if (!ui.palette) return null

  const run = (c: Cmd | undefined) => {
    if (!c) return
    ui.set({ palette: false })
    c.run()
  }

  let lastGroup = ''
  return (
    <div className={s.overlay} onMouseDown={(e) => e.target === e.currentTarget && ui.set({ palette: false })}>
      <div className={s.box} role="dialog" aria-label="Command palette">
        <div className={s.inputRow}>
          <Icon name="search" />
          <input ref={input} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to a project, plan item or person, or type a new card…"
            role="combobox" aria-expanded="true" aria-controls="wb-cmds" aria-activedescendant={cmds[sel] ? `cmd-${cmds[sel].id}` : undefined}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((x) => Math.min(cmds.length - 1, x + 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel((x) => Math.max(0, x - 1)) }
              if (e.key === 'Enter') { e.preventDefault(); run(cmds[sel]) }
            }} />
          <kbd>Esc</kbd>
        </div>
        <div ref={list} className={s.list} id="wb-cmds" role="listbox">
          {cmds.length === 0 && <div className={`mono muted ${s.none}`}>Nothing matches</div>}
          {cmds.map((c, i) => {
            const header = c.group !== lastGroup ? (lastGroup = c.group) : null
            return (
              <div key={c.id}>
                {header && <div className={`mono muted ${s.group}`}>{header}</div>}
                <div id={`cmd-${c.id}`} role="option" aria-selected={i === sel} data-sel={i === sel || undefined}
                  className={s.item} onMouseMove={() => setSel(i)} onClick={() => run(c)}>
                  <span className={s.label}>{c.label}</span>
                  {c.meta && <span className="mono muted">{c.meta}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
