import type { Data } from '../lib/data'
import { signOut } from '../lib/api'
import { UI_SCALES, useUI, type Theme } from '../lib/store'
import { LogoMark, Wordmark } from './Brand'
import { Icon } from './ui'
import s from './Sidebar.module.css'

const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
const pct = (v: number | undefined) => `${Math.round(v ?? 0)}%`

/** Phones: projects and settings in a sheet that slides up from the bottom. */
export function MobileMenu({ d }: { d: Data }) {
  const ui = useUI()
  const ro = ui.role === 'view'
  if (!ui.menu) return null
  const close = () => ui.set({ menu: false })
  return (
    <div className="sheetBackdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Projects and settings">
        <div className="sheetHead">
          <span className="mono muted">Projects</span>
          <button className="btn ghost icon" onClick={close} aria-label="Close"><Icon name="close" /></button>
        </div>
        <nav className={s.sheetList}>
          <button className={s.row} aria-current={d.all || undefined} onClick={() => ui.setProject('all')}>
            <span className={`${s.code} ${s.allCode}`}><Icon name="sigma" size={16} /></span>
            <span className={s.name}>All projects</span>
            <span className={s.pct}>{pct(d.overallAll)}</span>
          </button>
          {d.projects.filter((p) => !p.archived).map((p) => (
            <button key={p.id} className={s.row} aria-current={d.project?.id === p.id || undefined} onClick={() => ui.setProject(p.id)}>
              <span className={s.code}>{p.code}</span>
              <span className={s.name}>{p.name}</span>
              <span className={s.pct}>{pct(d.projectProgress.get(p.id))}</span>
            </button>
          ))}
          {!ro && (
            <button className={`${s.row} ${s.add}`} onClick={() => ui.open({ kind: 'project' })}>
              <span className={`${s.code} ${s.addCode}`}><Icon name="plus" size={12} /></span>
              <span className={s.name}>New project</span>
            </button>
          )}
        </nav>
        <div className={s.sheetFoot}>
          <button className={s.footBtn} onClick={() => ui.set({ menu: false, palette: true })}>
            <Icon name="search" size={16} /><span>Search everything</span>
          </button>
          <button className={s.footBtn} onClick={() => ui.set({ theme: NEXT_THEME[ui.theme] })}>
            <Icon name={ui.theme === 'light' ? 'sun' : 'moon'} size={16} />
            <span>Theme · <span className={s.themeName}>{ui.theme}</span></span>
          </button>
          {ui.authRequired && (
            <button className={s.footBtn} onClick={() => { close(); signOut() }}>
              <Icon name={ro ? 'edit' : 'close'} size={16} />
              <span>{ro ? 'View only · Sign in to edit' : 'Sign out'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function Sidebar({ d }: { d: Data }) {
  const ui = useUI()
  const ro = ui.role === 'view'

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
              onClick={() => ui.setProject(p.id)} onDoubleClick={() => !ro && ui.open({ kind: 'project', id: p.id })}
              title={`${p.name} · ${pct(d.projectProgress.get(p.id))}`}>
              <span className={s.code}>{p.code}</span>
              <span className={`${s.label} ${s.name}`}>{p.name}</span>
              <span className={`${s.label} ${s.pct}`}>{pct(d.projectProgress.get(p.id))}</span>
            </button>
            {!ro && (
              <button className={`${s.label} ${s.edit}`} title={`Edit ${p.name}`} onClick={() => ui.open({ kind: 'project', id: p.id })}>
                <Icon name="edit" size={12} />
              </button>
            )}
          </div>
        ))}
        {!ro && (
          <button className={`${s.row} ${s.add}`} onClick={() => ui.open({ kind: 'project' })} title="New project">
            <span className={`${s.code} ${s.addCode}`}><Icon name="plus" size={12} /></span>
            <span className={`${s.label} ${s.name}`}>New project</span>
          </button>
        )}
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
        <button className={s.footBtn} title="Display size: make the whole app smaller or larger"
          onClick={() => ui.set({ uiScale: UI_SCALES[(UI_SCALES.indexOf(ui.uiScale) + 1) % UI_SCALES.length] ?? 1 })}>
          <Icon name="size" size={15} />
          <span className={s.label}>Display size · <span className="num">{Math.round((ui.uiScale || 1) * 100)}%</span></span>
          <span className={`${s.label} ${s.chevR}`}><Icon name="chevron" size={12} /></span>
        </button>
        {ui.authRequired && (
          <button className={s.footBtn} onClick={() => signOut()}
            title={ro ? 'Sign in with the password to make changes' : 'Sign out of this browser'}>
            <Icon name={ro ? 'edit' : 'close'} size={15} />
            <span className={s.label}>{ro ? 'View only · Sign in to edit' : 'Sign out'}</span>
          </button>
        )}
      </div>
    </aside>
  )
}
