import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUI } from './store'
import type { Card, Note, Person, PlanItem, Project, Summary } from './types'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch('/api' + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })
  if (r.status === 401 && !path.startsWith('/auth')) useUI.getState().set({ authNeeded: true })
  if (!r.ok) {
    let msg = r.statusText
    try {
      const d = (await r.json()).detail
      msg = typeof d === 'string' ? d : d?.[0]?.msg ?? msg
    } catch {
      /* not json */
    }
    throw new ApiError(r.status, msg)
  }
  return (r.status === 204 ? undefined : await r.json()) as T
}

export const api = {
  get: <T>(p: string) => req<T>('GET', p),
  post: <T>(p: string, b?: unknown) => req<T>('POST', p, b ?? {}),
  patch: <T>(p: string, b: unknown) => req<T>('PATCH', p, b),
  put: <T>(p: string) => req<T>('PUT', p),
  del: <T = void>(p: string) => req<T>('DELETE', p),
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, refetchOnWindowFocus: true, retry: (n, e) => !(e instanceof ApiError && e.status === 401) && n < 2 },
  },
})

// Queries: the data set is one person's projects, so everything is loaded once
// and scoped on the client. Rollups always come from /summary.
export const useProjects = () => useQuery({ queryKey: ['projects'], queryFn: () => api.get<Project[]>('/projects') })
export const usePlanItems = () => useQuery({ queryKey: ['planItems'], queryFn: () => api.get<PlanItem[]>('/plan_items') })
export const useCards = () => useQuery({ queryKey: ['cards'], queryFn: () => api.get<Card[]>('/cards') })
export const usePeople = () => useQuery({ queryKey: ['people'], queryFn: () => api.get<Person[]>('/people') })
export const useNotes = () => useQuery({ queryKey: ['notes'], queryFn: () => api.get<Note[]>('/notes') })
export const useSummary = () => useQuery({ queryKey: ['summary'], queryFn: () => api.get<Summary>('/summary') })

const ALL = ['projects', 'planItems', 'cards', 'people', 'summary', 'notes']

function useInvalidate() {
  const qc = useQueryClient()
  return (keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })))
}

function onError(e: Error) {
  useUI.getState().toast({ label: `Not saved: ${e.message}`, from: NaN, to: NaN })
}

// Cards ---------------------------------------------------------------------
export function useUpdateCard() {
  const qc = useQueryClient()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<Card> & { id: string }) => api.patch<Card>(`/cards/${id}`, patch),
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: ['cards'] })
      const prev = qc.getQueryData<Card[]>(['cards'])
      const before = qc.getQueryData<Summary>(['summary'])
      const old = prev?.find((c) => c.id === id)
      qc.setQueryData<Card[]>(['cards'], (cs) => cs?.map((c) => (c.id === id ? { ...c, ...patch } : c)))
      const touched = [old?.planItemId, patch.planItemId].filter((x): x is string => !!x)
      return { prev, before, touched }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['cards'], ctx.prev)
      onError(e)
    },
    onSettled: async (_d, _e, _v, ctx) => {
      await invalidate(['cards', 'summary'])
      // B7: tell Razeen when a move changed a plan item's progress.
      const after = qc.getQueryData<Summary>(['summary'])
      const items = qc.getQueryData<PlanItem[]>(['planItems'])
      const projects = qc.getQueryData<Project[]>(['projects'])
      for (const pid of new Set(ctx?.touched ?? [])) {
        const a = ctx?.before?.items.find((i) => i.planItemId === pid)?.progress
        const b = after?.items.find((i) => i.planItemId === pid)?.progress
        const item = items?.find((i) => i.id === pid)
        if (a !== undefined && b !== undefined && a !== b && item) {
          const code = projects?.find((p) => p.id === item.projectId)?.code ?? ''
          useUI.getState().toast({ label: `${code} · ${item.title}`, from: a, to: b })
        }
      }
    },
  })
}

export function useCreateCard() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (c: Partial<Card>) => api.post<Card>('/cards', c),
    onSuccess: (c) => useUI.getState().set({ settling: c.id }),
    onError,
    onSettled: () => invalidate(['cards', 'summary']),
  })
}

export function useDeleteCard() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api.del(`/cards/${id}`),
    onError,
    onSettled: () => invalidate(['cards', 'summary']),
  })
}

// Plan items ------------------------------------------------------------------
export function useUpdateItem() {
  const qc = useQueryClient()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<PlanItem> & { id: string }) => api.patch<PlanItem>(`/plan_items/${id}`, patch),
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: ['planItems'] })
      const prev = qc.getQueryData<PlanItem[]>(['planItems'])
      qc.setQueryData<PlanItem[]>(['planItems'], (xs) => xs?.map((x) => (x.id === id ? { ...x, ...patch } : x)))
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['planItems'], ctx.prev)
      onError(e)
    },
    onSettled: () => invalidate(['planItems', 'summary', 'cards']),
  })
}

export function useCreateItem() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (i: Partial<PlanItem>) => api.post<PlanItem>('/plan_items', i),
    onError,
    onSettled: () => invalidate(['planItems', 'summary']),
  })
}

export function useDeleteItem() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api.del(`/plan_items/${id}`),
    onError,
    onSettled: () => invalidate(['planItems', 'cards', 'summary']),
  })
}

// Projects ------------------------------------------------------------------
export function useSaveProject() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...p }: Partial<Project>) =>
      id ? api.patch<Project>(`/projects/${id}`, p) : api.post<Project>('/projects', p),
    onError,
    onSettled: () => invalidate(['projects', 'people', 'summary']),
  })
}

export function useDeleteProject() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api.del(`/projects/${id}`),
    onError,
    onSettled: () => invalidate(['projects', 'summary']),
  })
}

// Notes ---------------------------------------------------------------------
export function useNoteOps() {
  const qc = useQueryClient()
  const invalidate = useInvalidate()
  // Optimistic edits so typing and filing feel instant.
  const optimistic = (fn: (ns: Note[]) => Note[]) => async () => {
    await qc.cancelQueries({ queryKey: ['notes'] })
    const prev = qc.getQueryData<Note[]>(['notes'])
    qc.setQueryData<Note[]>(['notes'], (ns) => fn(ns ?? []))
    return { prev }
  }
  const rollback = (e: Error, _v: unknown, ctx?: { prev?: Note[] }) => {
    if (ctx?.prev) qc.setQueryData(['notes'], ctx.prev)
    onError(e)
  }
  const settle = () => invalidate(['notes'])
  return {
    create: useMutation({ mutationFn: (n: { text: string; projectId: string | null }) => api.post<Note>('/notes', n), onError, onSettled: settle }),
    update: useMutation({
      mutationFn: ({ id, ...patch }: Partial<Note> & { id: string }) => api.patch<Note>(`/notes/${id}`, patch),
      onMutate: (v) => optimistic((ns) => ns.map((n) => (n.id === v.id ? { ...n, ...v } : n)))(),
      onError: rollback, onSettled: settle,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.del(`/notes/${id}`),
      onMutate: (id) => optimistic((ns) => ns.filter((n) => n.id !== id))(),
      onError: rollback, onSettled: settle,
    }),
    /** Turn a note into a card; the API removes the note in the same transaction. */
    promote: useMutation({
      mutationFn: ({ id, ...card }: Partial<Card> & { id: string }) => api.post<Card>(`/notes/${id}/promote`, card),
      onMutate: (v) => optimistic((ns) => ns.filter((n) => n.id !== v.id))(),
      onSuccess: (c) => useUI.getState().set({ settling: c.id }),
      onError: rollback,
      onSettled: () => invalidate(['notes', 'cards', 'summary']),
    }),
  }
}

// People --------------------------------------------------------------------
export function usePeopleOps() {
  const invalidate = useInvalidate()
  const after = { onError, onSettled: () => invalidate(['people', 'cards', 'planItems']) }
  return {
    create: useMutation({ mutationFn: (p: { name: string; projectIds: string[] }) => api.post<Person>('/people', p), ...after }),
    rename: useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => api.patch<Person>(`/people/${id}`, { name }), ...after }),
    remove: useMutation({ mutationFn: (id: string) => api.del(`/people/${id}`), ...after }),
    join: useMutation({ mutationFn: ({ id, projectId }: { id: string; projectId: string }) => api.put<Person>(`/people/${id}/projects/${projectId}`), ...after }),
    leave: useMutation({ mutationFn: ({ id, projectId }: { id: string; projectId: string }) => api.del<Person>(`/people/${id}/projects/${projectId}`), ...after }),
  }
}

export interface AuthStatus { required: boolean; ok: boolean; role: 'edit' | 'view' | null; viewOnly: boolean }

/** Reads the session from the server and mirrors it in the UI store. */
export async function loadSession() {
  const st = await api.get<AuthStatus>('/auth/status')
  useUI.getState().set({
    role: st.role ?? 'edit', authRequired: st.required, viewOnlyAvailable: st.viewOnly,
    ...(st.ok ? {} : { authNeeded: true }),
  })
  return st
}

/** Drop the session and go back to the sign-in screen. */
export async function signOut() {
  await api.post('/auth/logout')
  queryClient.clear()
  useUI.getState().set({ authNeeded: true, editor: null, palette: false })
}

export const refetchAll = () => Promise.all(ALL.map((k) => queryClient.invalidateQueries({ queryKey: [k] })))
