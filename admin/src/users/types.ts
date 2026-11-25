export type ActivityItem = { kind: string; detail: string; at: string }

export type ActivityPage = {
  items: ActivityItem[]
  total: number
  page: number
  pageSize: number
  lastActiveAt: string | null
}
