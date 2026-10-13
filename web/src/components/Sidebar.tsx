import type { Data } from '../lib/data'
import { useUI, type Theme } from '../lib/store'
import { LogoMark, Wordmark } from './Brand'
import { Icon } from './ui'
import s from './Sidebar.module.css'

const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }

export function Sidebar({ d }: { d: Data }) {
  const ui = useUI()
  const pct = (v: number | undefined) => `${Math.round(v ?? 0)}%`

  return (
    <aside className={s.side} aria-label="Projects">
      <div className={s.brand}>
        <span className={s.mark}><LogoMark size={30} /></span>
        <span className={`${s.label} ${s.word}`}><Wordmark tagline={false} /></span>
        <button className={`btn ghost icon ${s.collapse}`} title={ui.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-pressed={ui.sidebarCollapsed} onClick={() => ui.set({ sidebarCollapsed: !ui.sidebarCollapsed })}>
          <Icon name="rail" />
        </button>
      </div>

      <div className={`mono muted ${s.heading}`}><span className={s.label}>Projects</span></div>
      <nav className={s.list}>
        <button className={s.row} aria-current={d.all || undefined} onClick={() => ui.setProject('all')} title="All projects">
          <span className={`${s.code} ${s.allCode}`}><Icon name="sigma" size={16} /></span>
          <span className={`${s.label} ${s.name}`}>All projects</span>
          <span className={`${s.label} ${s.pct}`}>{pct(d.overallAll)}</span>
        </button>
        {d.projects.filter((p) => !p.archived).map((p) => (
          <div key={p.id} className={s.item}>
            <button className={s.row} aria-current={d.project?.id === p.id || undefined}
              onClick={() => ui.setProject(p.id)} onDoubleClick={() => ui.open({ kind: 'project', id: p.id })}
              title={`${p.name} · ${pct(d.projectProgress.get(p.id))}`}>
              <span className={s.code}>{p.code}</span>
              <span className={`${s.label} ${s.name}`}>{p.name}</span>
              <span className={`${s.label} ${s.pct}`}>{pct(d.projectProgress.get(p.id))}</span>
            </button>
            <button className={`${s.label} ${s.edit}`} title={`Edit ${p.name}`} onClick={() => ui.open({ kind: 'project', id: p.id })}>
              <Icon name="edit" size={12} />
            </button>
          </div>
        ))}
        <button className={`${s.row} ${s.add}`} onClick={() => ui.open({ kind: 'project' })} title="New project">
          <span className={`${s.code} ${s.addCode}`}><Icon name="plus" size={12} /></span>
          <span className={`${s.label} ${s.name}`}>New project</span>
        </button>
      </nav>

      <div className={s.foot}>
        <button className={s.footBtn} onClick={() => ui.set({ palette: true })} title="Command palette (Ctrl K)">
          <Icon name="search" size={15} />
          <span className={s.label}>Jump to…</span>
          <kbd className={s.label}>Ctrl K</kbd>
        </button>
        <button className={s.footBtn} onClick={() => ui.set({ theme: NEXT_THEME[ui.theme] })} title="Theme">
          <Icon name={ui.theme === 'light' ? 'sun' : 'moon'} size={15} />
          <span className={s.label}>Theme · <span className={s.themeName}>{ui.theme}</span></span>
          <span className={`${s.label} ${s.chevR}`}><Icon name="chevron" size={12} /></span>
        </button>
      </div>
    </aside>
  )
}
