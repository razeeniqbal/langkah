import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Card, PlanItem } from './types'

export type View = 'board' | 'timeline' | 'team' | 'notes'
export type Zoom = 'week' | 'month' | 'quarter'
export type Theme = 'system' | 'light' | 'dark'

export interface Filters {
  search: string
  planItemIds: string[] // empty = all; 'none' = cards with no plan item
  assigneeIds: string[] // empty = anyone; 'none' = unassigned
  myWork: boolean
  hideDone: boolean
}

export type Editor =
  | { kind: 'card'; id?: string; draft?: Partial<Card>; noteId?: string } // noteId: promoting a note
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
  uiScale: number // whole-app display size (CSS zoom); phones always use 1
  leftWidth: number // px, timeline "Plan item" column
  leftWidthPhone: number // the same column on phones
  menu: boolean // phone: project / settings sheet
  timeScale: Record<Zoom, number> // multiplier on the zoom's pixels-per-day
  collapsed: Record<string, boolean>
  filters: Filters
  editor: Editor | null
  palette: boolean
  authNeeded: boolean
  role: 'edit' | 'view' // 'view' = signed in with the View only button
  authRequired: boolean // a password is set on the server
  viewOnlyAvailable: boolean
  idleMinutes: number // 0 = no idle sign-out
  signedOutReason: string | null // shown on the sign-in screen
  toasts: Toast[]
  settling: string | null // id of the card that just landed in a column

  set: (p: Partial<UI>) => void
  setView: (v: View) => void
  setProject: (id: string) => void
  setFilter: <K extends keyof Filters>(k: K, v: Filters[K]) => void
  clearFilters: () => void
  toggleSection: (key: string) => void
  setTimeScale: (zoom: Zoom, v: number) => void
  open: (e: Editor) => void
  close: () => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: number) => void
}

const noFilters: Filters = { search: '', planItemIds: [], assigneeIds: [], myWork: false, hideDone: false }

/** The one plan item being filtered on, when exactly one is picked (progress strip, new-card default). */
export const singleItem = (f: Filters): string | null =>
  f.planItemIds.length === 1 && f.planItemIds[0] !== 'none' ? f.planItemIds[0] : null

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

export const UI_SCALES = [0.8, 0.9, 1, 1.1]
const PHONE = '(max-width: 720px)'

/**
 * The zoom actually applied to #root. Pointer coordinates are in screen pixels,
 * layout is in zoomed CSS pixels, so drag maths divides screen deltas by this.
 */
export function uiZoom(): number {
  if (typeof window !== 'undefined' && window.matchMedia(PHONE).matches) return 1
  return useUI.getState().uiScale || 1
}

/** True in a view-only session: hide or lock every control that changes data. */
export const useReadOnly = () => useUI((s) => s.role === 'view')

let toastSeq = 0

export const useUI = create<UI>()(
  persist(
    (set) => ({
      view: 'board',
      projectId: 'all',
      sidebarCollapsed: false,
      theme: 'dark',
      zoom: 'month',
      sheet: false,
      uiScale: 0.9,
      leftWidth: 340,
      leftWidthPhone: 168,
      menu: false,
      timeScale: { week: 1, month: 1, quarter: 1 },
      collapsed: {},
      filters: noFilters,
      editor: null,
      palette: false,
      authNeeded: false,
      role: 'edit',
      authRequired: false,
      viewOnlyAvailable: false,
      idleMinutes: 0,
      signedOutReason: null,
      toasts: [],
      settling: null,

      set: (p) => set(p),
      setView: (view) => set({ view }),
      setProject: (projectId) =>
        set((s) => ({ projectId, menu: false, filters: { ...s.filters, planItemIds: [], assigneeIds: [] } })),
      setFilter: (k, v) => set((s) => ({ filters: { ...s.filters, [k]: v } })),
      clearFilters: () => set((s) => ({ filters: { ...noFilters, myWork: s.filters.myWork } })),
      toggleSection: (key) => set((s) => ({ collapsed: { ...s.collapsed, [key]: !s.collapsed[key] } })),
      setTimeScale: (zoom, v) => set((s) => ({ timeScale: { ...s.timeScale, [zoom]: v } })),
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
      // Older saved filters had single-value fields; always start from a complete set.
      merge: (saved, current) => {
        const p = (saved ?? {}) as Partial<UI>
        return { ...current, ...p, filters: { ...noFilters, myWork: !!p.filters?.myWork, hideDone: !!p.filters?.hideDone } }
      },
      partialize: (s) => ({
        view: s.view,
        projectId: s.projectId,
        sidebarCollapsed: s.sidebarCollapsed,
        theme: s.theme,
        zoom: s.zoom,
        sheet: s.sheet,
        uiScale: s.uiScale,
        leftWidth: s.leftWidth,
        leftWidthPhone: s.leftWidthPhone,
        timeScale: s.timeScale,
        collapsed: s.collapsed,
        filters: { ...noFilters, myWork: s.filters.myWork, hideDone: s.filters.hideDone },
      }),
    },
  ),
)
