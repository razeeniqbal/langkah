import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { memo, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCreateCard, useUpdateCard } from '../lib/api'
import { short } from '../lib/dates'
import { isLate, type Data } from '../lib/data'
import { singleItem, uiZoom, useUI } from '../lib/store'
import { STATUSES, type Card, type Status } from '../lib/types'
import { Counter, Icon, Monogram, ProgressBar } from './ui'
import s from './Board.module.css'

export function Board({ d }: { d: Data }) {
  const update = useUpdateCard()
  const [active, setActive] = useState<Card | null>(null)
  // Drag with mouse or keyboard (Space to pick up, arrows, Space to drop).
  // On touch, status changes from the card editor (B2).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  )

  const onStart = (e: DragStartEvent) => setActive(d.cards.find((c) => c.id === e.active.id) ?? null)
  const onEnd = (e: DragEndEvent) => {
    setActive(null)
    const card = d.cards.find((c) => c.id === e.active.id)
    const status = e.over?.id as Status | undefined
    if (card && status && card.status !== status) {
      useUI.getState().set({ settling: card.id })
      update.mutate({ id: card.id, status })
    }
  }

  return (
    <div className={s.wrap}>
      <ItemStrip d={d} />
      <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
        <div className={s.columns}>
          {STATUSES.map((st) => (
            <Column key={st.id} d={d} status={st.id} label={st.label} credit={st.credit}
              cards={d.visibleCards.filter((c) => c.status === st.id)} />
          ))}
        </div>
        {/* Outside the zoomed #root so the overlay follows the pointer in screen pixels. */}
        {createPortal(
          <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
            {active && <div style={{ zoom: uiZoom() }}><CardTile d={d} card={active} overlay /></div>}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
    </div>
  )
}

/** B6: a plan item's progress strip on top of the filtered board. */
function ItemStrip({ d }: { d: Data }) {
  const ui = useUI()
  const id = singleItem(ui.filters)
  const item = id ? d.itemById.get(id) : undefined
  if (!item) return null
  const p = d.progress.get(item.id)
  const behind = item.end < d.today && (p?.progress ?? 0) < 100
  return (
    <div className={s.strip}>
      <div className={s.stripMain}>
        <span className="mono muted">
          {d.projectById.get(item.projectId)?.code} · {item.section || 'No section'} · {short(item.start)} → {short(item.end)}
          {behind && <span className="tag late" style={{ marginLeft: 8 }}>Behind</span>}
        </span>
        <button className={s.stripTitle} onClick={() => ui.open({ kind: 'item', id: item.id })}>{item.title}</button>
      </div>
      <div className={s.stripBar}>
        <ProgressBar value={p?.progress ?? 0} />
        <span className="mono muted">{p?.cardsDone ?? 0}/{p?.cardCount ?? 0} cards · {p?.mode ?? 'auto'}</span>
      </div>
      <strong className={s.stripPct}><Counter value={p?.progress ?? 0} /></strong>
      <button className="btn ghost icon" title="Clear plan item filter" onClick={() => ui.setFilter('planItemIds', [])}>
        <Icon name="close" size={12} />
      </button>
    </div>
  )
}

function Column({ d, status, label, credit, cards }: {
  d: Data; status: Status; label: string; credit: number; cards: Card[]
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const points = cards.reduce((n, c) => n + c.points, 0)
  return (
    <section className={s.col} data-status={status} data-over={isOver || undefined} aria-label={label}>
      <header className={s.colHead}>
        <div className={s.colTitle}>
          <h2>{label}</h2>
          <span className={`num ${s.count}`}>{cards.length}</span>
        </div>
        <div className={`mono muted ${s.colMeta}`}>
          <span>{points} pt</span>
          <span title="How much a card in this column counts toward progress">counts {Math.round(credit * 100)}%</span>
        </div>
      </header>
      <div ref={setNodeRef} className={s.colBody}>
        <QuickAdd d={d} status={status} />
        {cards.map((c) => <DraggableCard key={c.id} d={d} card={c} />)}
      </div>
    </section>
  )
}

function DraggableCard({ d, card }: { d: Data; card: Card }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id })
  const open = useUI((x) => x.open)
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={s.slot} data-dragging={isDragging || undefined}
      aria-roledescription="card"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) open({ kind: 'card', id: card.id })
        else listeners?.onKeyDown?.(e)
      }}>
      <CardTile d={d} card={card} />
    </div>
  )
}

const CardTile = memo(function CardTile({ d, card, overlay }: { d: Data; card: Card; overlay?: boolean }) {
  const ui = useUI.getState()
  const settling = useUI((x) => x.settling === card.id)
  const update = useUpdateCard()
  const [editing, setEditing] = useState<'title' | 'due' | null>(null)
  const item = card.planItemId ? d.itemById.get(card.planItemId) : undefined
  const project = d.projectById.get(card.projectId)
  const late = isLate(card, d.today)

  useEffect(() => {
    if (!settling) return
    const t = setTimeout(() => useUI.getState().set({ settling: null }), 700)
    return () => clearTimeout(t)
  }, [settling])

  const stop = { onMouseDown: (e: React.MouseEvent) => e.stopPropagation(), onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation() }

  return (
    <article className={s.card} data-overlay={overlay || undefined} data-settle={settling || undefined}
      data-done={card.status === 'done' || undefined}
      onClick={(e) => {
        if (!editing && !(e.target as HTMLElement).closest('button,input')) ui.open({ kind: 'card', id: card.id })
      }}>
      {editing === 'title' ? (
        <InlineInput initial={card.title} {...stop}
          onDone={(v) => { setEditing(null); if (v && v !== card.title) update.mutate({ id: card.id, title: v }) }} />
      ) : (
        <h3 className={s.title} onDoubleClick={() => setEditing('title')} title="Double-click to rename">{card.title}</h3>
      )}

      <div className={s.ref}>
        {item ? (
          <button className={s.refBtn} title={`Show only “${item.title}”`} {...stop}
            onClick={() => ui.setFilter('planItemIds', [item.id])}>
            {d.all && <b>{project?.code}</b>}{item.title}
          </button>
        ) : (
          <span className="muted" title="Not on the timeline; counts toward the project %">{d.all && <b>{project?.code} </b>}No plan item</span>
        )}
      </div>

      <footer className={s.foot}>
        <Monogram person={card.assigneeId ? d.personById.get(card.assigneeId) : null} small />
        {editing === 'due' ? (
          <InlineInput type="date" initial={card.due ?? ''} {...stop}
            onDone={(v) => { setEditing(null); if (v !== (card.due ?? '')) update.mutate({ id: card.id, due: v || null }) }} />
        ) : (
          <button className={`${s.due} ${late ? s.lateDue : ''}`} {...stop} onClick={() => setEditing('due')}
            title="Change due date">
            {card.due ? short(card.due) : 'No date'}
          </button>
        )}
        {late && <span className="tag late">Late</span>}
        <span className={s.spacer} />
        <span className={`num ${s.pts}`} title={`${card.points} effort points`}>{card.points}</span>
      </footer>
    </article>
  )
})

function InlineInput({ initial, onDone, type = 'text', ...rest }: {
  initial: string; onDone: (v: string) => void; type?: string
  onMouseDown: (e: React.MouseEvent) => void; onKeyDown: (e: React.KeyboardEvent) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  const finish = (v: string) => {
    if (done.current) return
    done.current = true
    onDone(v.trim())
  }
  useEffect(() => {
    ref.current?.focus()
    if (type === 'text') ref.current?.select()
  }, [type])
  return (
    <input ref={ref} type={type} defaultValue={initial} className={`input ${s.inline}`}
      onMouseDown={rest.onMouseDown}
      onKeyDown={(e) => {
        rest.onKeyDown(e)
        if (e.key === 'Enter') finish(e.currentTarget.value)
        if (e.key === 'Escape') finish(initial)
      }}
      onBlur={(e) => finish(e.currentTarget.value)} />
  )
}

function QuickAdd({ d, status }: { d: Data; status: Status }) {
  const [on, setOn] = useState(false)
  const create = useCreateCard()
  const planItemId = useUI((x) => singleItem(x.filters))
  const me = useUI((x) => x.filters.myWork) ? d.me : null
  if (!d.defaultProjectId) return null
  if (!on) {
    return (
      <button className={s.add} onClick={() => setOn(true)}>
        <Icon name="plus" size={11} /> Add card
      </button>
    )
  }
  return (
    <InlineInput initial="" onMouseDown={() => {}} onKeyDown={() => {}}
      onDone={(title) => {
        setOn(false)
        if (!title) return
        const item = planItemId ? d.itemById.get(planItemId) : undefined
        create.mutate({ title, status, planItemId: item?.id ?? null, projectId: item?.projectId ?? d.defaultProjectId!, assigneeId: me?.id ?? null })
      }} />
  )
}
