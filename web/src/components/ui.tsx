import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { initials } from '../lib/data'
import { useUI } from '../lib/store'
import type { Person } from '../lib/types'
import { Illustration, type Art } from './Brand'
import s from './ui.module.css'

const PATHS: Record<string, string> = {
  plus: 'M8 3v10M3 8h10',
  close: 'M4 4l8 8M12 4l-8 8',
  chevron: 'M6 4l4 4-4 4',
  search: 'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM10.5 10.5L14 14',
  rail: 'M2 2h12v12H2zM6 2v12',
  board: 'M2.5 3.5h11v9h-11zM6 3.5v9M10 3.5v9',
  timeline: 'M2.5 2.5v11h11M5.5 10.5v-3M8.5 10.5v-6M11.5 10.5v-4',
  team: 'M6 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M10.5 2.7a2.4 2.4 0 0 1 0 4.6M12 9.8c1.5.5 2.5 1.8 2.5 3.7',
  sun: 'M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8 1v2M8 13v2M1 8h2M13 8h2',
  moon: 'M13.5 9.5A5.5 5.5 0 1 1 6.5 2.5a4.5 4.5 0 0 0 7 7z',
  sigma: 'M12 3H4l4.5 5L4 13h8',
  edit: 'M3 13l1-3 7-7 2 2-7 7zM10 4l2 2',
  size: 'M2 13l3.5-9 3.5 9M3.2 10h4.6M11.5 6.5v5M9 9h5',
  notes: 'M3.5 2.5h9v11h-9zM6 5.5h4M6 8h4M6 10.5h2.5',
  send: 'M3 8h9M8.5 4.5L12 8l-3.5 3.5',
}

export function Icon({ name, size = 14 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}

export function Monogram({ person, small }: { person: Person | null | undefined; small?: boolean }) {
  if (!person) return <span className={`mg none ${small ? 'sm' : ''}`} title="Unassigned">–</span>
  return (
    <span className={`mg ${person.isMe ? 'me' : ''} ${small ? 'sm' : ''}`} title={person.name}>
      {initials(person.name)}
    </span>
  )
}

/** E5: deletes need a second click within 3 s. */
export function ConfirmButton({ onConfirm, children, disabled, title }: {
  onConfirm: () => void; children: ReactNode; disabled?: boolean; title?: string
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button type="button" className={`btn danger ${armed ? 'armed' : ''}`} disabled={disabled} title={title}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? 'Click again to confirm' : children}
    </button>
  )
}

/** A percentage that ticks like a counter when it changes. */
export function Counter({ value, from, decimals = 0 }: { value: number; from?: number; decimals?: number }) {
  const [shown, setShown] = useState(from ?? value)
  const last = useRef(from ?? value)
  useEffect(() => {
    const start = last.current
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (start === value || reduce) {
      last.current = value
      setShown(value)
      return
    }
    const t0 = performance.now()
    const dur = 700
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur)
      const v = start + (value - start) * (1 - Math.pow(1 - k, 3))
      setShown(v)
      last.current = v
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <span className="num">{shown.toFixed(decimals)}%</span>
}

export function ProgressBar({ value, width }: { value: number; width?: number | string }) {
  return (
    <div className="bar hatch" style={{ width }} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ transform: `scaleX(${Math.max(0, Math.min(100, value)) / 100})` }} />
    </div>
  )
}

export function Toasts() {
  const toasts = useUI((x) => x.toasts)
  const dismiss = useUI((x) => x.dismissToast)
  return (
    <div className={s.toasts} aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} className={s.toast} onClick={() => dismiss(t.id)}>
          {Number.isNaN(t.from) ? (
            <span>{t.label}</span>
          ) : (
            <>
              <span className="mono muted">Progress</span>
              <span className={s.toastLabel}>{t.label}</span>
              <span className={s.delta}>
                <span className="num muted">{Math.round(t.from)}%</span>
                <span aria-hidden>→</span>
                <b><Counter value={t.to} from={t.from} /></b>
              </span>
            </>
          )}
        </button>
      ))}
    </div>
  )
}

export interface Option { value: string; label: string; group?: string }

/**
 * A dropdown of checkboxes. Empty value = no filter ("all"). Search appears
 * when the list is long; Esc or a click outside closes it.
 */
export function MultiSelect({ label, all, noun, options, value, onChange, className }: {
  label: string; all: string; noun: string; options: Option[]; value: string[]
  onChange: (v: string[]) => void; className?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', out)
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('mousedown', out)
      document.removeEventListener('keydown', esc, true)
    }
  }, [open])
  useEffect(() => { if (!open) setQ('') }, [open])

  const picked = new Set(value)
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? options.filter((o) => `${o.label} ${o.group ?? ''}`.toLowerCase().includes(t)) : options
  }, [options, q])
  const toggle = (v: string) => onChange(picked.has(v) ? value.filter((x) => x !== v) : [...value, v])
  const summary = value.length === 0 ? all
    : value.length === 1 ? options.find((o) => o.value === value[0])?.label ?? `1 ${noun}`
    : `${value.length} ${noun}`

  let lastGroup: string | undefined
  return (
    <div ref={box} className={`${s.ms} ${className ?? ''}`}>
      <button type="button" className={`select ${s.msButton}`} aria-haspopup="listbox" aria-expanded={open}
        aria-label={`${label}: ${summary}`} data-active={value.length > 0 || undefined} onClick={() => setOpen(!open)}>
        <span className={s.msSummary}>{summary}</span>
        {value.length > 1 && <span className={`num ${s.msCount}`}>{value.length}</span>}
      </button>
      {open && (
        <div className={s.msPanel} role="listbox" aria-multiselectable="true" aria-label={label}>
          {options.length > 8 && (
            <input className={`input ${s.msSearch}`} placeholder={`Find ${noun}…`} value={q} autoFocus
              onChange={(e) => setQ(e.target.value)} />
          )}
          <div className={s.msList}>
            {shown.map((o) => {
              const head = o.group && o.group !== lastGroup ? o.group : null
              lastGroup = o.group
              return (
                <div key={o.value}>
                  {head && <div className={`mono muted ${s.msGroup}`}>{head}</div>}
                  <label className={s.msOption} title={o.label}>
                    <input type="checkbox" checked={picked.has(o.value)} onChange={() => toggle(o.value)} />
                    <span>{o.label}</span>
                  </label>
                </div>
              )
            })}
            {shown.length === 0 && <div className={`muted ${s.msEmpty}`}>No matches</div>}
          </div>
          <div className={s.msFoot}>
            <span className="mono muted">{value.length ? `${value.length} selected` : all}</span>
            <button type="button" className="btn ghost" disabled={!value.length} onClick={() => onChange([])}>Clear</button>
          </div>
        </div>
      )}
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className={s.field}>
      <span className="mono muted">{label}</span>
      {children}
      {hint && <span className={s.hint}>{hint}</span>}
    </label>
  )
}

export function Empty({ title, text, art, children }: { title: string; text?: ReactNode; art?: Art; children?: ReactNode }) {
  return (
    <div className={s.empty}>
      {art && <Illustration art={art} />}
      <h2 className={s.emptyTitle}>{title}</h2>
      {text && <p className={`muted ${s.emptyText}`}>{text}</p>}
      {children && <div className={s.emptyActions}>{children}</div>}
    </div>
  )
}
