import { useEffect } from 'react'
import { Board } from './components/Board'
import { CommandPalette } from './components/CommandPalette'
import { Drawer } from './components/Editors'
import { Header } from './components/Header'
import { Login } from './components/Login'
import { Notes } from './components/Notes'
import { Sidebar } from './components/Sidebar'
import { Team } from './components/Team'
import { Timeline } from './components/Timeline'
import { Empty, Icon, Toasts } from './components/ui'
import { loadSession } from './lib/api'
import { useData } from './lib/data'
import { singleItem, uiZoom, useUI } from './lib/store'
import s from './App.module.css'

/** Whole-app display size: CSS zoom on #root (it still fills the window). */
function useDisplaySize() {
  const scale = useUI((x) => x.uiScale)
  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return
    const mq = window.matchMedia('(max-width: 720px)')
    const apply = () => {
      const k = uiZoom()
      root.style.zoom = k === 1 ? '' : String(k)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [scale])
}

function useTheme() {
  const theme = useUI((x) => x.theme)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () =>
      document.documentElement.setAttribute('data-theme', theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

function useShortcuts(defaultProjectId: string | null) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState()
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        ui.set({ palette: !ui.palette })
        return
      }
      if (e.key === 'Escape') {
        if (ui.palette) ui.set({ palette: false })
        else if (ui.editor) ui.close()
        return
      }
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey || ui.editor || ui.palette) return
      const k = e.key.toLowerCase()
      if (k === 'n' && defaultProjectId && ui.role !== 'view') {
        e.preventDefault()
        const planItemId = singleItem(ui.filters)
        ui.open({ kind: 'card', draft: { projectId: defaultProjectId, planItemId, status: 'todo' } })
      } else if (k === '1') ui.setView('board')
      else if (k === '2') ui.setView('timeline')
      else if (k === '3') ui.setView('team')
      else if (k === '4') ui.setView('notes')
      else if (k === '/') {
        e.preventDefault()
        document.getElementById('wb-search')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [defaultProjectId])
}

export function App() {
  useTheme()
  useDisplaySize()
  useEffect(() => { loadSession().catch(() => {}) }, [])
  const d = useData()
  useShortcuts(d.defaultProjectId)
  const view = useUI((x) => x.view)
  const collapsed = useUI((x) => x.sidebarCollapsed)
  const authNeeded = useUI((x) => x.authNeeded)

  if (authNeeded) return <Login />

  return (
    <div className={s.app} data-collapsed={collapsed || undefined}>
      <Sidebar d={d} />
      <main className={s.main}>
        <Header d={d} />
        <section className={s.view}>
          {d.error ? (
            <Empty title="Cannot reach the API" text={String((d.error as Error).message)} />
          ) : d.loading ? (
            <Empty title="Loading…" />
          ) : d.projects.length === 0 ? (
            <Empty art="projects" title="No projects yet" text="Create your first project to start planning.">
              <button className="btn primary" onClick={() => useUI.getState().open({ kind: 'project' })}>
                <Icon name="plus" size={15} /> New project
              </button>
            </Empty>
          ) : view === 'board' ? (
            <Board d={d} />
          ) : view === 'timeline' ? (
            <Timeline d={d} />
          ) : view === 'notes' ? (
            <Notes d={d} />
          ) : (
            <Team d={d} />
          )}
        </section>
      </main>
      <Drawer d={d} />
      <CommandPalette d={d} />
      <Toasts />
    </div>
  )
}
