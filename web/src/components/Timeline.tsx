import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useUpdateItem } from '../lib/api'
import { fromDay, isoWeek, long, monthName, parts, short, toDay, weekday } from '../lib/dates'
import { isBehind, isLate, type Data } from '../lib/data'
import { useUI, type Zoom } from '../lib/store'
import type { PlanItem, Project } from '../lib/types'
import { Actions, Stats } from './Header'
import { Empty, Icon, Monogram } from './ui'
import s from './Timeline.module.css'

const PPD: Record<Zoom, number> = { week: 30, month: 9, quarter: 3 } // pixels per day
const PAD: Record<Zoom, number> = { week: 10, month: 28, quarter: 60 } // days either side
const HEAD = 44

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
  const { zoom, sheet, collapsed } = ui
  const ppd = PPD[zoom]
  const ROW = sheet ? 26 : 34
  const narrow = useNarrow()
  const LEFT = narrow ? 150 : 340
  const update = useUpdateItem()
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
      const dx = e.clientX - g.x0
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
      <Toolbar d={d} zoom={zoom} sheet={sheet} onToday={scrollToToday} />
      <div className={`${s.frame} ${sheet ? s.sheet : ''}`}>
        <div ref={scroller} className={s.scroller} data-dragging={drag?.mode ?? undefined}>
          <div className={s.grid} style={{ gridTemplateColumns: `${LEFT}px ${W}px`, paddingBottom: sheet ? 96 : 24 }}>
            <div className={s.corner} style={{ height: HEAD }}>
              <span className="mono muted">Plan item</span>
              <span className="mono muted">{narrow ? '' : 'Cards · Owner'}</span>
            </div>
            <svg className={s.scale} width={W} height={HEAD} aria-hidden="true">
              <Scale d0={d0} d1={d1} x={x} ppd={ppd} zoom={zoom} today={today} sheet={sheet} />
            </svg>

            <div className={s.left} style={{ width: LEFT }}>
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
                const hasCards = cards.length > 0
                const g = drag?.id === item.id ? drag : null
                const start = g ? g.dStart : toDay(item.start)
                const end = g ? g.dEnd : toDay(item.end)
                const progress = g?.mode === 'knob' ? g.dProgress : pending[item.id] ?? ip?.progress ?? item.manualProgress
                const behind = isBehind(item, progress, d.today)
                const knob = !hasCards || item.progressMode === 'manual'
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

function Toolbar({ d, zoom, sheet, onToday }: { d: Data; zoom: Zoom; sheet: boolean; onToday: () => void }) {
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
              <span className={s.groupName}>{row.project.name}</span>
            </>
          ) : (
            <span className={`mono ${s.groupName}`}>{row.section || 'No section'}</span>
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
      <button className={s.itemTitle} onClick={() => ui.open({ kind: 'item', id: item.id })}
        title={`${item.title} · ${short(item.start)} → ${short(item.end)}`}>
        {item.milestone && <span className={s.msDot} aria-label="Milestone" />}
        {item.title}
      </button>
      {behind && !narrow && <span className="tag late" title="End date passed and not complete">Behind</span>}
      {!narrow && (
        <button className={s.counter} title="Open these cards on the board"
          onClick={() => { ui.setFilter('planItemId', item.id); ui.setView('board') }}>
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
  for (let day = d0; day <= d1; day++) {
    const { y, m, d } = parts(day)
    const wd = weekday(day)
    const X = x(day)
    if (zoom === 'week') {
      if (wd === 0) {
        top.push(<Tick key={`t${day}`} x={X} y1={0} y2={22} label={`W${isoWeek(day)} · ${d} ${monthName(m)} ${y}`} />)
      }
      bottom.push(
        <text key={`b${day}`} x={X + ppd / 2} y={37} textAnchor="middle" className={wd >= 5 ? s.dim : undefined}>
          {'MTWTFSS'[wd]}{d}
        </text>,
      )
    } else if (zoom === 'month') {
      if (d === 1 || day === d0) top.push(<Tick key={`t${day}`} x={X} y1={0} y2={22} label={`${monthName(m)} ${y}`} />)
      if (wd === 0) bottom.push(<Tick key={`b${day}`} x={X} y1={22} y2={44} label={`W${isoWeek(day)}`} />)
    } else {
      if ((d === 1 && m % 3 === 0) || day === d0) top.push(<Tick key={`t${day}`} x={X} y1={0} y2={22} label={`Q${Math.floor(m / 3) + 1} ${y}`} />)
      if (d === 1) bottom.push(<Tick key={`b${day}`} x={X} y1={22} y2={44} label={monthName(m)} />)
      if (sheet && wd === 0) bottom.push(<line key={`w${day}`} x1={X} x2={X} y1={38} y2={44} stroke="var(--line)" />)
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

function Tick({ x, y1, y2, label }: { x: number; y1: number; y2: number; label: string }) {
  return (
    <>
      <line x1={x + 0.5} x2={x + 0.5} y1={y1} y2={y2} stroke="var(--line)" />
      <text x={x + 5} y={y1 + 15}>{label}</text>
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
