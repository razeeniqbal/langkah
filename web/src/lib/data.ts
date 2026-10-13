import { useMemo } from 'react'
import { useCards, usePeople, usePlanItems, useProjects, useSummary } from './api'
import { todayISO } from './dates'
import { useUI, type Filters } from './store'
import type { Card, ItemProgress, Person, PlanItem, Project } from './types'

export const isLate = (c: Card, today: string) => !!c.due && c.due < today && c.status !== 'done'
export const isBehind = (i: PlanItem, progress: number, today: string) => i.end < today && progress < 100

/** One place that turns the raw collections into what the views render. */
export function useData() {
  const projects = useProjects()
  const items = usePlanItems()
  const cards = useCards()
  const people = usePeople()
  const summary = useSummary()
  const projectId = useUI((s) => s.projectId)
  const filters = useUI((s) => s.filters)

  return useMemo(() => {
    const today = todayISO()
    const P = projects.data ?? []
    const I = items.data ?? []
    const C = cards.data ?? []
    const M = people.data ?? []
    const S = summary.data
    const projectById = new Map(P.map((p) => [p.id, p]))
    const itemById = new Map(I.map((i) => [i.id, i]))
    const personById = new Map(M.map((p) => [p.id, p]))
    const progress = new Map<string, ItemProgress>(S?.items.map((i) => [i.planItemId, i]) ?? [])
    const sectionProgress = new Map(S?.sections.map((s) => [`${s.projectId}:${s.section}`, s.progress]) ?? [])
    const projectProgress = new Map(S?.projects.map((p) => [p.projectId, p.progress]) ?? [])
    const me = M.find((p) => p.isMe) ?? null
    const all = projectId === 'all' || !projectById.has(projectId)
    const project: Project | null = all ? null : projectById.get(projectId)!
    const inScope = (pid: string) => all || pid === projectId

    const cardsByItem = new Map<string, Card[]>()
    for (const c of C) if (c.planItemId) cardsByItem.set(c.planItemId, [...(cardsByItem.get(c.planItemId) ?? []), c])

    const scopeCards = C.filter((c) => inScope(c.projectId))
    const scopeItems = I.filter((i) => inScope(i.projectId))
    const team = all ? M : M.filter((p) => p.projectIds.includes(projectId))

    const visibleCards = scopeCards.filter((c) => cardMatches(c, filters, me, itemById))
    const visibleItems = scopeItems.filter((i) =>
      itemMatches(i, filters, me, cardsByItem.get(i.id) ?? [], progress.get(i.id)?.progress ?? 0),
    )

    return {
      loading: projects.isLoading || items.isLoading || cards.isLoading || people.isLoading,
      error: projects.error ?? items.error ?? cards.error ?? people.error,
      today, projects: P, items: I, cards: C, people: M, me, all, project,
      projectById, itemById, personById, cardsByItem,
      progress, sectionProgress, projectProgress, overallAll: S?.overall ?? 0, overall: all ? S?.overall ?? 0 : projectProgress.get(projectId) ?? 0,
      scopeCards, scopeItems, team, visibleCards, visibleItems,
      /** The project new things go into when the user hasn't picked one. */
      defaultProjectId: project?.id ?? P[0]?.id ?? null,
    }
  }, [projects.data, items.data, cards.data, people.data, summary.data, projectId, filters,
      projects.isLoading, items.isLoading, cards.isLoading, people.isLoading,
      projects.error, items.error, cards.error, people.error])
}

export type Data = ReturnType<typeof useData>

function cardMatches(c: Card, f: Filters, me: Person | null, itemById: Map<string, PlanItem>) {
  if (f.planItemIds.length && !f.planItemIds.includes(c.planItemId ?? 'none')) return false
  if (f.assigneeIds.length && !f.assigneeIds.includes(c.assigneeId ?? 'none')) return false
  if (f.myWork && (!me || c.assigneeId !== me.id)) return false
  if (f.hideDone && c.status === 'done') return false
  if (f.search) {
    const q = f.search.toLowerCase()
    const item = c.planItemId ? itemById.get(c.planItemId) : undefined
    if (![c.title, c.notes, item?.title ?? ''].some((s) => s.toLowerCase().includes(q))) return false
  }
  return true
}

function itemMatches(i: PlanItem, f: Filters, me: Person | null, cards: Card[], progress: number) {
  if (f.planItemIds.length && !f.planItemIds.includes(i.id)) return false
  // An item matches a person when they own it or have a card on it; 'none' = no owner.
  const who = f.myWork ? [me?.id ?? '-'] : f.assigneeIds
  if (who.length) {
    const hit = who.includes(i.ownerId ?? 'none') || cards.some((c) => c.assigneeId !== null && who.includes(c.assigneeId))
    if (!hit) return false
  }
  if (f.hideDone && progress >= 100) return false
  if (f.search) {
    const q = f.search.toLowerCase()
    if (![i.title, i.section, i.notes].some((s) => s.toLowerCase().includes(q))) return false
  }
  return true
}

/** Team first, then everyone else (E3). */
export function assigneeGroups(d: Data, projectId: string | null) {
  const team = d.people.filter((p) => projectId && p.projectIds.includes(projectId))
  const others = d.people.filter((p) => !team.includes(p))
  return { team, others }
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase()
  const w = (words[0] ?? '?').replace(/[^A-Za-z0-9]/g, '')
  return (w.length > 2 && /\d$/.test(w) ? w[0] + w[w.length - 1] : w.slice(0, 2)).toUpperCase()
}
