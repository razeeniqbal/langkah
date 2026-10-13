export type Status = 'backlog' | 'todo' | 'doing' | 'review' | 'done'
export type Mode = 'auto' | 'manual'

export const STATUSES: { id: Status; label: string; credit: number }[] = [
  { id: 'backlog', label: 'Backlog', credit: 0 },
  { id: 'todo', label: 'To do', credit: 0 },
  { id: 'doing', label: 'In progress', credit: 0.5 },
  { id: 'review', label: 'Review', credit: 0.75 },
  { id: 'done', label: 'Done', credit: 1 },
]
export const POINTS = [1, 2, 3, 5, 8] as const

export interface Project {
  id: string
  name: string
  code: string
  order: number
  archived: boolean
  updatedAt: string
}

export interface PlanItem {
  id: string
  projectId: string
  section: string
  title: string
  ownerId: string | null
  start: string
  end: string
  milestone: boolean
  progressMode: Mode
  manualProgress: number
  notes: string
  order: number
  updatedAt: string
}

export interface Card {
  id: string
  planItemId: string | null
  projectId: string
  title: string
  assigneeId: string | null
  status: Status
  due: string | null
  points: number
  notes: string
  order: number
  updatedAt: string
}

export interface Note {
  id: string
  projectId: string | null
  text: string
  order: number
  createdAt: string
  updatedAt: string
}

export interface Person {
  id: string
  name: string
  projectIds: string[]
  isMe: boolean
  updatedAt: string
}

export interface ItemProgress {
  planItemId: string
  projectId: string
  section: string
  progress: number
  mode: Mode
  cardCount: number
  cardsDone: number
}

export interface Summary {
  items: ItemProgress[]
  sections: { projectId: string; section: string; progress: number }[]
  projects: { projectId: string; progress: number }[]
  overall: number
}
