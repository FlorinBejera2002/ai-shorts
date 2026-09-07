export type ActivityDay = { date: string; clips: number; projects: number }
export type ProjectStatus =
  | 'completed'
  | 'active'
  | 'failed'
  | 'cancelled'
  | 'other'
