// Dates are ISO strings (YYYY-MM-DD) in local time. Internally we count whole
// days since the epoch in UTC so arithmetic never trips over DST.
const DAY = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function toDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY)
}

export function fromDay(n: number): string {
  return new Date(n * DAY).toISOString().slice(0, 10)
}

/** Local calendar date (YYYY-MM-DD) of now, or of a timestamp. */
export function todayISO(at?: string): string {
  const d = at ? new Date(at) : new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const addDays = (iso: string, n: number) => fromDay(toDay(iso) + n)

/** 0 = Monday … 6 = Sunday */
export function weekday(day: number): number {
  return (new Date(day * DAY).getUTCDay() + 6) % 7
}

export function isoWeek(day: number): number {
  const d = new Date(day * DAY)
  const thursday = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * DAY)
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1)
  return Math.floor((thursday.getTime() - jan1) / DAY / 7) + 1
}

export function parts(day: number) {
  const d = new Date(day * DAY)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }
}

export const monthName = (m: number) => MONTHS[m]

/** "14 Oct" */
export function short(iso: string | null): string {
  if (!iso) return ''
  const { m, d } = parts(toDay(iso))
  return `${d} ${MONTHS[m]}`
}

/** "14 Oct 2026" */
export function long(iso: string): string {
  const { y, m, d } = parts(toDay(iso))
  return `${d} ${MONTHS[m]} ${y}`
}

export const span = (start: string, end: string) => toDay(end) - toDay(start) + 1
