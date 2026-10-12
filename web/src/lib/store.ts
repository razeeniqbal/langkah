import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Card, PlanItem } from './types'

export type View = 'board' | 'timeline' | 'team'
export type Zoom = 'week' | 'month' | 'quarter'
export type Theme = 'system' | 'light' | 'dark'

export interface Filters {
  search: string
  planItemId: string | null
  assigneeId: string | null // 'none' = unassigned
  myWork: boolean
  hideDone: boolean
}

export type Editor =
  | { kind: 'card'; id?: string; draft?: Partial<Card> }
  | { kind: 'item'; id?: string; draft?: Partial<PlanItem> }
  | { kind: 'project'; id?: string }

export interface Toast {
  id: number
  label: string
  from: number
  to: number
}

interface UI {
  view: View
  projectId: string // 'all' or a project id
  sidebarCollapsed: boolean
  theme: Theme
  zoom: Zoom
  sheet: boolean
  collapsed: Record<string, boolean>
  filters: Filters
  editor: Editor | null
  palette: boolean
  authNeeded: boolean
  toasts: Toast[]
  settling: string | null // id of the card that just landed in a column

  set: (p: Partial<UI>) => void
  setView: (v: View) => void
  setProject: (id: string) => void
  setFilter: <K extends keyof Filters>(k: K, v: Filters[K]) => void
  clearFilters: () => void
  toggleSection: (key: string) => void
  open: (e: Editor) => void
  close: () => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: number) => void
}

const noFilters: Filters = { search: '', planItemId: null, assigneeId: null, myWork: false, hideDone: false }

// localStorage can be unavailable (private mode); the app must still work.
const safeStorage = createJSONStorage(() => {
  try {
    const s = window.localStorage
    s.setItem('wb:probe', '1')
    s.removeItem('wb:probe')
    return s
  } catch {
    const mem = new Map<string, string>()
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) }
  }
})

let toastSeq = 0

export const useUI = create<UI>()(
  persist(
    (set) => ({
      view: 'board',
      projectId: 'all',
      sidebarCollapsed: false,
      theme: 'system',
      zoom: 'month',
      sheet: false,
      collapsed: {},
      filters: noFilters,
      editor: null,
      palette: false,
      authNeeded: false,
      toasts: [],
      settling: null,

      set: (p) => set(p),
      setView: (view) => set({ view }),
      setProject: (projectId) =>
        set((s) => ({ projectId, filters: { ...s.filters, planItemId: null, assigneeId: null } })),
      setFilter: (k, v) => set((s) => ({ filters: { ...s.filters, [k]: v } })),
      clearFilters: () => set((s) => ({ filters: { ...noFilters, myWork: s.filters.myWork } })),
      toggleSection: (key) => set((s) => ({ collapsed: { ...s.collapsed, [key]: !s.collapsed[key] } })),
      open: (editor) => set({ editor, palette: false }),
      close: () => set({ editor: null }),
      toast: (t) => {
        const id = ++toastSeq
        set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }))
        setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 4200)
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
    }),
    {
      name: 'workbench:ui',
      storage: safeStorage,
      partialize: (s) => ({
        view: s.view,
        projectId: s.projectId,
        sidebarCollapsed: s.sidebarCollapsed,
        theme: s.theme,
        zoom: s.zoom,
        sheet: s.sheet,
        collapsed: s.collapsed,
        filters: { ...noFilters, myWork: s.filters.myWork, hideDone: s.filters.hideDone },
      }),
    },
  ),
)
