import { useEffect, useRef, useState, type ReactNode } from 'react'
import { initials } from '../lib/data'
import { useUI } from '../lib/store'
import type { Person } from '../lib/types'
import s from './ui.module.css'

const PATHS: Record<string, string> = {
  plus: 'M8 3v10M3 8h10',
  close: 'M4 4l8 8M12 4l-8 8',
  chevron: 'M6 4l4 4-4 4',
  search: 'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM10.5 10.5L14 14',
  rail: 'M2 2h12v12H2zM6 2v12',
  board: 'M2 3h3v10H2zM6.5 3h3v7h-3zM11 3h3v5h-3z',
  timeline: 'M2 4h7M5 8h8M3 12h5',
  team: 'M2 3h12M2 8h12M2 13h12M6 3v10',
  sun: 'M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8 1v2M8 13v2M1 8h2M13 8h2',
  edit: 'M3 13l1-3 7-7 2 2-7 7zM10 4l2 2',
}

export function Icon({ name, size = 14 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="square" aria-hidden="true">
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

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className={s.field}>
      <span className="mono muted">{label}</span>
      {children}
      {hint && <span className={s.hint}>{hint}</span>}
    </label>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={s.empty}>
      <div className="mono">{title}</div>
      {children && <div className="muted">{children}</div>}
    </div>
  )
}
