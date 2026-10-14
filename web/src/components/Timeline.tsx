import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useUpdateItem } from '../lib/api'
import { fromDay, isoWeek, long, monthName, parts, short, toDay, weekday } from '../lib/dates'
import { isBehind, isLate, type Data } from '../lib/data'
import { uiZoom, useReadOnly, useUI, type Zoom } from '../lib/store'
import type { PlanItem, Project } from '../lib/types'
import { Actions, Stats } from './Header'
import { Empty, Icon, Monogram } from './ui'
import s from './Timeline.module.css'

const PPD: Record<Zoom, number> = { week: 30, month: 9, quarter: 3 } // pixels per day
const PAD: Record<Zoom, number> = { week: 10, month: 28, quarter: 60 } // days either side
const HEAD = 44
const LEFT_MIN = 200, LEFT_MAX = 900
const SCALE_MIN = 0.1, SCALE_MAX = 5
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// Follows one pointer drag on window until release.
function track(e: React.PointerEvent, cursor: string, onMove: (dx: number) => void) {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  const x0 = e.clientX
  const k = uiZoom()
  const body = document.body.style
  body.cursor = cursor
  body.userSelect = 'none'
  const move = (ev: PointerEvent) => onMove((ev.clientX - x0) / k)
  const end = () => {
    body.cursor = ''
    body.userSelect = ''
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
}

type Row =
  | { kind: 'project'; key: string; project: Project; items: PlanItem[] }
  | { kind: 'section'; key: string; projectId: string; section: string; items: PlanItem[] }
  | { kind: 'item'; key: string; item: PlanItem }

interface Drag {
  id: string
  mode: 'move' | 'start' | 'end' | 'knob'
  x0: number
  start: number
  end: number
  progress: number
  hasCards: boolean
  dStart: number
  dEnd: number
  dProgress: number
  moved: boolean
}

function useNarrow() {
  const q = '(max-width: 720px)'
  const [n, setN] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setN(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return n
}

export function Timeline({ d }: { d: Data }) {
  const ui = useUI()
  const { zoom, sheet, collapsed, leftWidth } = ui
  const scale = ui.timeScale?.[zoom] ?? 1
  const ppd = PPD[zoom] * scale
  const ROW = sheet ? 26 : 34
  const narrow = useNarrow()
  const LEFT = narrow ? 150 : leftWidth
  const leftRef = useRef<HTMLDivElement>(null)
  const update = useUpdateItem()
  const ro = useReadOnly()
  const scroller = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  dragRef.current = drag
  // Holds a knob value until the server's summary catches up, so the bar
  // doesn't flick back to the old value for a frame.
  const [pending, setPending] = useState<Record<string, number>>({})
  useEffect(() => setPending({}), [d.progress])

  // Rows: project (All projects only) → section → items.
  const rows = useMemo(() => {
    const out: Row[] = []
    const projects = d.all ? d.projects : d.project ? [d.project] : []
    for (const project of projects) {
      const items = d.visibleItems.filter((i) => i.projectId === project.id)
      if (d.all && items.length === 0) continue
      const pKey = `p:${project.id}`
      if (d.all) {
        out.push({ kind: 'project', key: pKey, project, items })
        if (collapsed[pKey]) continue
      }
      const sections = new Map<string, PlanItem[]>()
      for (const i of items) sections.set(i.section, [...(sections.get(i.section) ?? []), i])
      for (const [section, list] of sections) {
        const sKey = `s:${project.id}:${section}`
        out.push({ kind: 'section', key: sKey, projectId: project.id, section, items: list })
        if (!collapsed[sKey]) for (const item of list) out.push({ kind: 'item', key: item.id, item })
      }
    }
    return out
  }, [d.all, d.projects, d.project, d.visibleItems, collapsed])

  // Date range of the sheet, Monday-aligned.
  const today = toDay(d.today)
  const [d0, d1] = useMemo(() => {
    let lo = today, hi = today
    for (const i of d.visibleItems) {
      lo = Math.min(lo, toDay(i.start))
      hi = Math.max(hi, toDay(i.end))
    }
    lo -= PAD[zoom]
    hi += PAD[zoom]
    lo -= weekday(lo)
    return [lo, hi + (6 - weekday(hi))]
  }, [d.visibleItems, today, zoom])
  const W = (d1 - d0 + 1) * ppd
  const H = Math.max(rows.length * ROW, 1)
  const x = useCallback((day: number) => (day - d0) * ppd, [d0, ppd])

  // Keep the same date under the viewport when the range grows.
  const prevD0 = useRef(d0)
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && prevD0.current !== d0) el.scrollLeft += (prevD0.current - d0) * ppd
    prevD0.current = d0
  }, [d0, ppd])

  // Timeline scale: keep the anchored date at the same screen position after re-render.
  const anchor = useRef<{ day: number; px: number } | null>(null)
  useLayoutEffect(() => {
    const el = scroller.current, a = anchor.current
    if (el && a) el.scrollLeft = Math.max(0, (a.day - d0) * ppd - a.px)
    anchor.current = null
  }, [ppd, d0])

  // Rescale around a screen x (default: middle of the chart viewport).
  const setScale = useCallback((next: number, clientX?: number) => {
    const el = scroller.current
    if (el) {
      const r = el.getBoundingClientRect()
      const px = Math.max(0, clientX === undefined ? (el.clientWidth - LEFT) / 2 : (clientX - r.left) / uiZoom() - LEFT)
      anchor.current = { day: d0 + (el.scrollLeft + px) / ppd, px }
    }
    useUI.getState().setTimeScale(zoom, clamp(next, SCALE_MIN, SCALE_MAX))
  }, [d0, ppd, LEFT, zoom])

  const fitAll = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const avail = el.clientWidth - LEFT - 12
    anchor.current = { day: d0, px: 0 }
    useUI.getState().setTimeScale(zoom, clamp(avail / ((d1 - d0 + 1) * PPD[zoom]), SCALE_MIN, SCALE_MAX))
  }, [LEFT, d0, d1, zoom])

  // Ctrl / Cmd + wheel zooms the timeline around the pointer.
  const setScaleRef = useRef(setScale)
  setScaleRef.current = setScale
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const on = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const st = useUI.getState()
      setScaleRef.current((st.timeScale?.[st.zoom] ?? 1) * Math.exp(-e.deltaY * 0.0025), e.clientX)
    }
    el.addEventListener('wheel', on, { passive: false })
    return () => el.removeEventListener('wheel', on)
  }, [])

  // Drag the date header to stretch / compress around the grabbed date.
  const beginStretch = (e: React.PointerEvent) => {
    const el = scroller.current
    if (!el) return
    const px = Math.max(0, (e.clientX - el.getBoundingClientRect().left) / uiZoom() - LEFT)
    const day = d0 + (el.scrollLeft + px) / ppd
    const s0 = scale
    track(e, 'ew-resize', (dx) => {
      anchor.current = { day, px }
      useUI.getState().setTimeScale(zoom, clamp(s0 * Math.exp(dx / 180), SCALE_MIN, SCALE_MAX))
    })
  }

  // Drag the column edge to resize "Plan item"; double-click fits the longest name.
  const beginResize = (e: React.PointerEvent) => {
    const w0 = leftWidth
    track(e, 'col-resize', (dx) => useUI.getState().set({ leftWidth: clamp(w0 + dx, LEFT_MIN, LEFT_MAX) }))
  }
  const fitNames = () => {
    let need = 0
    leftRef.current?.querySelectorAll<HTMLElement>('[data-clip]').forEach((el) => {
      need = Math.max(need, el.scrollWidth - el.clientWidth)
    })
    ui.set({ leftWidth: clamp(need > 0 ? leftWidth + need + 8 : 340, LEFT_MIN, LEFT_MAX) })
  }
  const resizeKeys = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 64 : 16
    if (e.key === 'ArrowLeft') ui.set({ leftWidth: clamp(leftWidth - step, LEFT_MIN, LEFT_MAX) })
    else if (e.key === 'ArrowRight') ui.set({ leftWidth: clamp(leftWidth + step, LEFT_MIN, LEFT_MAX) })
    else return
    e.preventDefault()
  }
  const handle = !narrow && (
    <div className={s.colHandle} role="separator" aria-orientation="vertical" aria-label="Resize plan item column"
      aria-valuenow={leftWidth} aria-valuemin={LEFT_MIN} aria-valuemax={LEFT_MAX} tabIndex={0}
      title="Drag to resize · double-click to fit names"
      onPointerDown={beginResize} onDoubleClick={fitNames} onKeyDown={resizeKeys} />
  )

  const scrollToToday = useCallback(() => {
    const el = scroller.current
    if (el) el.scrollTo({ left: Math.max(0, x(today) - (el.clientWidth - LEFT) * 0.3), behavior: 'smooth' })
  }, [x, today, LEFT])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = Math.max(0, x(today) - (el.clientWidth - LEFT) * 0.3)
  }, [zoom])

  // Pointer dragging: move, resize, milestone, progress knob.
  useEffect(() => {
    if (!drag) return
    const move = (e: PointerEvent) => {
      const g = dragRef.current!
      const dx = (e.clientX - g.x0) / uiZoom()
      const dd = Math.round(dx / ppd)
      const next = { ...g, moved: g.moved || Math.abs(dx) > 3 }
      if (g.mode === 'move') Object.assign(next, { dStart: g.start + dd, dEnd: g.end + dd })
      if (g.mode === 'start') next.dStart = Math.min(g.start + dd, g.end)
      if (g.mode === 'end') next.dEnd = Math.max(g.end + dd, g.start)
      if (g.mode === 'knob') {
        const w = (g.end - g.start + 1) * ppd
        next.dProgress = Math.max(0, Math.min(100, Math.round((g.progress + (dx / w) * 100) / 5) * 5))
      }
      setDrag(next)
    }
    const up = () => {
      const g = dragRef.current!
      setDrag(null)
      if (!g.moved) {
        if (g.mode !== 'knob') useUI.getState().open({ kind: 'item', id: g.id })
        return
      }
      if (g.mode === 'knob') {
        setPending((p) => ({ ...p, [g.id]: g.dProgress }))
        // Dragging the knob on an item with cards switches it to manual (T4).
        update.mutate({ id: g.id, manualProgress: g.dProgress, ...(g.hasCards ? { progressMode: 'manual' as const } : {}) })
      } else if (g.dStart !== g.start || g.dEnd !== g.end) {
        update.mutate({ id: g.id, start: fromDay(g.dStart), end: fromDay(g.dEnd) })
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
    window.addEventListener('pointercancel', () => setDrag(null), { once: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    // Only (re)bind when a drag starts or ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag === null])

  const begin = (e: React.PointerEvent, item: PlanItem, mode: Drag['mode'], progress: number, hasCards: boolean) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    if (ro) return ui.open({ kind: 'item', id: item.id })
    const start = toDay(item.start), end = toDay(item.end)
    setDrag({ id: item.id, mode, x0: e.clientX, start, end, progress, hasCards, dStart: start, dEnd: end, dProgress: progress, moved: false })
  }

  const span = (items: PlanItem[]) =>
    items.length ? [Math.min(...items.map((i) => toDay(i.start))), Math.max(...items.map((i) => toDay(i.end)))] : null

  if (!d.all && d.project && d.scopeItems.length === 0) {
    return (
      <div className={s.emptyWrap}>
        <Toolbar d={d} zoom={zoom} sheet={sheet} onToday={scrollToToday} />
        <Empty art="timeline" title="No plan items yet" text={`Add the first plan item to put ${d.project.name} on the timeline.`}>
          <button className="btn primary" onClick={() => ui.open({ kind: 'item', draft: { projectId: d.project!.id } })}>
            <Icon name="plus" size={15} /> Plan item
          </button>
        </Empty>
      </div>
    )
  }

  const scaleW = Math.max(ppd, 3)

  return (
    <div className={s.wrap}>
      <Toolbar d={d} zoom={zoom} sheet={sheet} onToday={scrollToToday}
        scale={scale} onScale={(f) => setScale(f === 0 ? 1 : scale * f)} onFit={fitAll} />
      <div className={`${s.frame} ${sheet ? s.sheet : ''}`}>
        <div ref={scroller} className={s.scroller} data-dragging={drag?.mode ?? undefined}>
          <div className={s.grid} style={{ gridTemplateColumns: `${LEFT}px ${W}px`, paddingBottom: sheet ? 96 : 24 }}>
            <div className={s.corner} style={{ height: HEAD }}>
              <span className="mono muted">Plan item</span>
              <span className="mono muted">{narrow ? '' : 'Cards · Owner'}</span>
              {handle}
            </div>
            <svg className={s.scale} width={W} height={HEAD} aria-hidden="true" onPointerDown={beginStretch}
              onDoubleClick={fitAll}>
              <title>Drag to stretch the timeline · double-click to fit · Ctrl + scroll to zoom</title>
              <Scale d0={d0} d1={d1} x={x} ppd={ppd} zoom={zoom} today={today} sheet={sheet} />
            </svg>

            <div ref={leftRef} className={s.left} style={{ width: LEFT }}>
              {handle}
              {rows.map((r) => (
                <LeftRow key={r.key} row={r} d={d} height={ROW} narrow={narrow} />
              ))}
            </div>

            <svg className={s.chart} width={W} height={H} role="img" aria-label="Timeline">
              <defs>
                <pattern id="wb-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="5" height="5" fill="var(--bar-track)" />
                  <line x1="0" y1="0" x2="0" y2="5" stroke="var(--hatch)" strokeWidth="1.1" />
                </pattern>
              </defs>
              <Grid d0={d0} d1={d1} x={x} ppd={ppd} zoom={zoom} H={H} sheet={sheet} rows={rows} ROW={ROW} />
              {/* today: highlighter band with a hairline */}
              <rect x={x(today) + ppd / 2 - scaleW / 2} y={0} width={scaleW} height={H} fill="var(--gold)" opacity={0.06} />
              <line x1={x(today) + ppd / 2} x2={x(today) + ppd / 2} y1={0} y2={H} stroke="var(--gold)" strokeWidth={1.25} strokeDasharray="4 4" />

              {rows.map((r, idx) => {
                const y = idx * ROW
                if (r.kind !== 'item') {
                  const sp = span(r.items.filter((i) => !i.milestone).length ? r.items.filter((i) => !i.milestone) : r.items)
                  if (!sp) return null
                  const p = r.kind === 'project' ? d.projectProgress.get(r.project.id) ?? 0 : d.sectionProgress.get(`${r.projectId}:${r.section}`) ?? 0
                  return <SummaryBar key={r.key} x1={x(sp[0])} x2={x(sp[1] + 1)} y={y} ROW={ROW} progress={p} strong={r.kind === 'project'} />
                }
                const item = r.item
                const ip = d.progress.get(item.id)
                const cards = d.cardsByItem.get(item.id) ?? []
                const g = drag?.id === item.id ? drag : null
                const start = g ? g.dStart : toDay(item.start)
                const end = g ? g.dEnd : toDay(item.end)
                const hasCards = cards.length > 0
                const progress = g?.mode === 'knob' ? g.dProgress : pending[item.id] ?? ip?.progress ?? item.manualProgress
                // Knob only where the % is typed: no cards, or switched to manual.
                const knob = !ro && (!hasCards || item.progressMode === 'manual')
                const behind = isBehind(item, progress, d.today)
                return (
                  <ItemBar key={item.id} item={item} y={y} ROW={ROW} x={x} ppd={ppd} start={start} end={end}
                    progress={progress} behind={behind} knob={knob} dragging={g} sheet={sheet}
                    markers={cards.filter((c) => c.due).map((c) => ({
                      id: c.id, x: x(toDay(c.due!)) + ppd / 2, title: `${c.title} · due ${short(c.due)}`,
                      tone: c.status === 'done' ? 'done' : isLate(c, d.today) ? 'late' : 'open',
                    }))}
                    onBegin={(e, mode) => begin(e, item, mode, progress, hasCards)} />
                )
              })}
            </svg>
          </div>
        </div>
        {sheet && <TitleBlock d={d} zoom={zoom} />}
      </div>
    </div>
  )
}

function Toolbar({ d, zoom, sheet, onToday, scale, onScale, onFit }: {
  d: Data; zoom: Zoom; sheet: boolean; onToday: () => void
  scale?: number; onScale?: (factor: number) => void; onFit?: () => void
}) {
  const set = useUI((x) => x.set)
  return (
    <div className={s.toolbar}>
      <Stats d={d} />
      <div className={s.tools}>
      <div className="seg" role="group" aria-label="Zoom">
        {(['week', 'month', 'quarter'] as Zoom[]).map((z) => (
          <button key={z} aria-pressed={zoom === z} onClick={() => set({ zoom: z })}>{z}</button>
        ))}
      </div>
      {onScale && onFit && (
        <div className="seg" role="group" aria-label="Timeline scale">
          <button onClick={() => onScale(1 / 1.25)} aria-label="Compress timeline" title="Compress (Ctrl + scroll)">−</button>
          <button className="num" onClick={() => onScale(0)} title="Reset scale">{Math.round((scale ?? 1) * 100)}%</button>
          <button onClick={() => onScale(1.25)} aria-label="Stretch timeline" title="Stretch (Ctrl + scroll)">+</button>
          <button onClick={onFit} title="Fit the whole plan in view">Fit</button>
        </div>
      )}
      <button className="btn" onClick={onToday}>Today</button>
      <button className="chip" aria-pressed={sheet} onClick={() => set({ sheet: !sheet })}
        title="Dense sheet mode">
        Sheet
      </button>
      <div className={`mono muted ${s.legend}`}>
        <span><i className={`${s.swatch} ${s.done}`} /> Done</span>
        <span><i className={`${s.swatch} hatch`} /> Remaining</span>
        <span><i className={s.diamond} /> Milestone</span>
        <span><i className={s.tick} /> Card due</span>
      </div>
      </div>
      <Actions d={d} />
    </div>
  )
}

function LeftRow({ row, d, height, narrow }: { row: Row; d: Data; height: number; narrow: boolean }) {
  const ui = useUI()
  if (row.kind === 'project' || row.kind === 'section') {
    const open = !ui.collapsed[row.key]
    const p = row.kind === 'project'
      ? d.projectProgress.get(row.project.id) ?? 0
      : d.sectionProgress.get(`${row.projectId}:${row.section}`) ?? 0
    return (
      <div className={`${s.row} ${row.kind === 'project' ? s.projectRow : s.sectionRow}`} style={{ height }}>
        <button className={s.toggle} aria-expanded={open} onClick={() => ui.toggleSection(row.key)}
          title={open ? 'Collapse' : 'Expand'}>
          <span className={s.chev} data-open={open || undefined}><Icon name="chevron" size={11} /></span>
          {row.kind === 'project' ? (
            <>
              <span className={s.code}>{row.project.code}</span>
              <span className={s.groupName} data-clip>{row.project.name}</span>
            </>
          ) : (
            <span className={`mono ${s.groupName}`} data-clip>{row.section || 'No section'}</span>
          )}
        </button>
        <span className={`num ${s.groupPct}`}>{Math.round(p)}%</span>
      </div>
    )
  }
  const item = row.item
  const ip = d.progress.get(item.id)
  const behind = isBehind(item, ip?.progress ?? 0, d.today)
  const owner = item.ownerId ? d.personById.get(item.ownerId) : null
  return (
    <div className={`${s.row} ${s.itemRow}`} style={{ height }}>
      <button className={s.itemTitle} data-clip onClick={() => ui.open({ kind: 'item', id: item.id })}
        title={`${item.title} · ${short(item.start)} → ${short(item.end)}`}>
        {item.milestone && <span className={s.msDot} aria-label="Milestone" />}
        {item.title}
      </button>
      {behind && !narrow && <span className="tag late" title="End date passed and not complete">Behind</span>}
      {!narrow && (
        <button className={s.counter} title="Open these cards on the board"
          onClick={() => { ui.setFilter('planItemIds', [item.id]); ui.setView('board') }}>
          {ip?.cardsDone ?? 0}/{ip?.cardCount ?? 0}
        </button>
      )}
      <Monogram person={owner} small />
    </div>
  )
}

function Scale({ d0, d1, x, ppd, zoom, today, sheet }: {
  d0: number; d1: number; x: (d: number) => number; ppd: number; zoom: Zoom; today: number; sheet: boolean
}) {
  const top: JSX.Element[] = []
  const bottom: JSX.Element[] = []
  // Thin labels out when the scale is compressed so they don't overlap.
  const weekPx = ppd * 7, monthPx = ppd * 30.4
  const weekEvery = Math.max(1, Math.ceil(34 / weekPx))
  const monthEvery = monthPx >= 30 ? 1 : monthPx >= 15 ? 3 : 6
  for (let day = d0; day <= d1; day++) {
    const { y, m, d } = parts(day)
    const wd = weekday(day)
    const X = x(day)
    if (zoom === 'week') {
      if (wd === 0) {
        const w = isoWeek(day)
        const label = weekPx >= 130 ? `W${w} · ${d} ${monthName(m)} ${y}` : w % weekEvery === 0 ? `W${w}` : undefined
        top.push(<Tick key={`t${day}`} x={X} y1={0} y2={22} label={label} />)
      }
      if (ppd >= 11) {
        bottom.push(
          <text key={`b${day}`} x={X + ppd / 2} y={37} textAnchor="middle" className={wd >= 5 ? s.dim : undefined}>
            {ppd >= 20 ? 'MTWTFSS'[wd] : ''}{d}
          </text>,
        )
      }
    } else if (zoom === 'month') {
      if (d === 1 || day === d0) {
        const label = m % monthEvery === 0 || day === d0 ? (monthPx >= 64 ? `${monthName(m)} ${y}` : monthName(m)) : undefined
        top.push(<Tick key={`t${day}`} x={X} y1={0} y2={22} label={label} />)
      }
      if (wd === 0) {
        const w = isoWeek(day)
        bottom.push(<Tick key={`b${day}`} x={X} y1={22} y2={44} label={w % weekEvery === 0 ? `W${w}` : undefined} />)
      }
    } else {
      if ((d === 1 && m % 3 === 0) || day === d0) {
        const q = `Q${Math.floor(m / 3) + 1}`
        top.push(<Tick key={`t${day}`} x={X} y1={0} y2={22} label={monthPx * 3 >= 64 ? `${q} ${y}` : q} />)
      }
      if (d === 1) bottom.push(<Tick key={`b${day}`} x={X} y1={22} y2={44} label={m % monthEvery === 0 ? monthName(m) : undefined} />)
      if (sheet && wd === 0 && weekPx >= 4) bottom.push(<line key={`w${day}`} x1={X} x2={X} y1={38} y2={44} stroke="var(--line)" />)
    }
  }
  const tx = x(today) + ppd / 2
  return (
    <g className={s.scaleText}>
      <rect width="100%" height={HEAD} fill="var(--surface)" />
      <line x1={0} x2="100%" y1={22} y2={22} stroke="var(--line)" />
      {top}
      {bottom}
      <g>
        <rect x={tx - 24} y={27} width={48} height={15} rx={4} fill="var(--gold)" />
        <text x={tx} y={37.5} textAnchor="middle" className={s.todayText}>Today</text>
      </g>
      <line x1={0} x2="100%" y1={HEAD - 0.5} y2={HEAD - 0.5} stroke="var(--line-strong)" />
    </g>
  )
}

function Tick({ x, y1, y2, label }: { x: number; y1: number; y2: number; label?: string }) {
  return (
    <>
      <line x1={x + 0.5} x2={x + 0.5} y1={y1} y2={y2} stroke="var(--line)" />
      {label && <text x={x + 5} y={y1 + 15}>{label}</text>}
    </>
  )
}

function Grid({ d0, d1, x, ppd, zoom, H, sheet, rows, ROW }: {
  d0: number; d1: number; x: (d: number) => number; ppd: number; zoom: Zoom; H: number; sheet: boolean; rows: Row[]; ROW: number
}) {
  const els: JSX.Element[] = []
  for (let day = d0; day <= d1; day++) {
    const wd = weekday(day)
    const { d } = parts(day)
    const X = x(day) + 0.5
    if (wd >= 5 && ppd >= 6) els.push(<rect key={`we${day}`} x={x(day)} y={0} width={ppd} height={H} fill="var(--weekend)" />)
    const major = zoom === 'quarter' ? d === 1 : wd === 0
    const minor = sheet && (zoom === 'week' || (zoom === 'month' && wd === 0) || (zoom === 'quarter' && wd === 0))
    if (major) els.push(<line key={`g${day}`} x1={X} x2={X} y1={0} y2={H} stroke={sheet ? 'var(--line)' : 'var(--line-2)'} />)
    else if (minor) els.push(<line key={`g${day}`} x1={X} x2={X} y1={0} y2={H} stroke="var(--line-2)" />)
  }
  rows.forEach((r, i) => {
    if (sheet || r.kind !== 'item') {
      els.push(<line key={`r${r.key}`} x1={0} x2={x(d1 + 1)} y1={i * ROW + 0.5} y2={i * ROW + 0.5}
        stroke={r.kind === 'item' ? 'var(--line-2)' : 'var(--line)'} />)
    }
  })
  return <g>{els}</g>
}

function SummaryBar({ x1, x2, y, ROW, progress, strong }: { x1: number; x2: number; y: number; ROW: number; progress: number; strong: boolean }) {
  const h = strong ? 8 : 6
  const by = y + ROW / 2 - h / 2
  const w = Math.max(x2 - x1, 2)
  return (
    <g>
      <rect x={x1} y={by} width={w} height={h} rx={h / 2} fill="var(--bar-track)" />
      <rect x={x1} y={by} width={w} height={h} rx={h / 2} fill="var(--gold)" className={s.fill}
        style={{ transform: `scaleX(${progress / 100})`, transformOrigin: `${x1}px 0` }} />
    </g>
  )
}

interface Marker { id: string; x: number; title: string; tone: 'done' | 'late' | 'open' }

function ItemBar({ item, y, ROW, x, ppd, start, end, progress, behind, knob, dragging, sheet, markers, onBegin }: {
  item: PlanItem; y: number; ROW: number; x: (d: number) => number; ppd: number; start: number; end: number
  progress: number; behind: boolean; knob: boolean; dragging: Drag | null; sheet: boolean; markers: Marker[]
  onBegin: (e: React.PointerEvent, mode: Drag['mode']) => void
}) {
  const stroke = behind ? 'var(--danger)' : 'var(--bar-line)'
  const label = dragging && dragging.mode !== 'knob' && dragging.moved
    ? `${short(fromDay(start))} → ${short(fromDay(end))} · ${end - start + 1}d`
    : `${Math.round(progress)}%`

  if (item.milestone) {
    const cx = x(start) + ppd / 2, cy = y + ROW / 2, r = sheet ? 6 : 7
    return (
      <g className={s.ms} onPointerDown={(e) => onBegin(e, 'move')}>
        <title>{`${item.title} · ${long(fromDay(start))}`}</title>
        <rect x={cx - 10} y={y} width={20} height={ROW} fill="transparent" />
        <path d={`M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z`}
          fill={progress >= 100 ? 'var(--accent)' : 'var(--surface)'} stroke={behind ? 'var(--danger)' : 'var(--ink-2)'} strokeWidth={1.5} />
        <text x={cx + r + 5} y={cy + 3.5} className={s.barLabel}>
          {dragging?.moved ? short(fromDay(start)) : `${short(item.start)}${behind ? ' · behind' : ''}`}
        </text>
      </g>
    )
  }

  const bh = sheet ? 10 : 14
  const by = y + (ROW - bh) / 2 - (markers.length ? 2 : 0)
  const x1 = x(start)
  const w = (end - start + 1) * ppd
  const kx = x1 + (w * progress) / 100
  return (
    <g className={s.item} data-active={dragging ? true : undefined}>
      <title>{`${item.title} · ${short(fromDay(start))} → ${short(fromDay(end))} · ${Math.round(progress)}%`}</title>
      <rect x={x1} y={by} width={w} height={bh} rx={4} fill="url(#wb-hatch)" />
      <rect x={x1} y={by} width={w} height={bh} rx={4} fill="var(--accent)" className={dragging?.mode === 'knob' ? undefined : s.fill}
        style={{ transform: `scaleX(${progress / 100})`, transformOrigin: `${x1}px 0` }} />
      <rect x={x1 + 0.5} y={by + 0.5} width={Math.max(w - 1, 1)} height={bh - 1} rx={3.5} fill="none" stroke={stroke}
        strokeWidth={behind ? 1.5 : 1} className={s.body} onPointerDown={(e) => onBegin(e, 'move')} pointerEvents="all" />
      <rect x={x1 - 3} y={by - 2} width={7} height={bh + 4} className={s.handle} onPointerDown={(e) => onBegin(e, 'start')} />
      <rect x={x1 + w - 4} y={by - 2} width={7} height={bh + 4} className={s.handle} onPointerDown={(e) => onBegin(e, 'end')} />
      {knob && (
        <g className={s.knob} onPointerDown={(e) => onBegin(e, 'knob')}>
          <title>Drag to set progress manually</title>
          <rect x={kx - 7} y={by + bh - 2} width={14} height={10} fill="transparent" />
          <path d={`M${kx} ${by + bh - 1} l4.5 6 h-9 z`} fill="var(--gold)" />
        </g>
      )}
      {markers.map((m) => (
        <rect key={m.id} x={m.x - 1} y={by + bh + 2} width={2} height={4} className={s[`mk_${m.tone}`]}>
          <title>{m.title}</title>
        </rect>
      ))}
      <text x={x1 + w + 7} y={by + bh / 2 + 3.5} className={`${s.barLabel} ${behind ? s.behindLabel : ''}`}>{label}</text>
    </g>
  )
}

function TitleBlock({ d, zoom }: { d: Data; zoom: Zoom }) {
  const cells: [string, string][] = [
    ['Project', d.all ? 'All projects' : `${d.project!.code} · ${d.project!.name}`],
    ['Scale', zoom === 'week' ? '1 col = 1 day' : zoom === 'month' ? '1 col = 1 week' : '1 col = 1 month'],
    ['Drawn', d.me?.name ?? '—'],
    ['Date', long(d.today)],
    ['Items', String(d.visibleItems.length)],
    ['Sheet', 'TL-01'],
  ]
  return (
    <div className={s.titleBlock} aria-label="Title block">
      {cells.map(([k, v]) => (
        <Fragment key={k}>
          <div><span className="mono muted">{k}</span><b>{v}</b></div>
        </Fragment>
      ))}
    </div>
  )
}
