import { Activity, Bug, CircleGauge, CreditCard, Cpu, type LucideIcon, MessageSquareHeart, Users } from 'lucide-react'

export type View = 'overview' | 'users' | 'billing' | 'ai-routing' | 'errors' | 'feedback' | 'audit'

export type NavigationItem = { id: View; label: string; title: string; icon: LucideIcon }

export const navigation: NavigationItem[] = [
  { id: 'overview', label: 'Overview', title: 'Platform overview', icon: CircleGauge },
  { id: 'users', label: 'Utilizatori', title: 'Utilizatori', icon: Users },
  { id: 'billing', label: 'Facturare', title: 'Facturare Stripe', icon: CreditCard },
  { id: 'ai-routing', label: 'Modele AI', title: 'Modele AI', icon: Cpu },
  { id: 'errors', label: 'Erori', title: 'Erori platformă', icon: Bug },
  { id: 'feedback', label: 'Feedback', title: 'Feedback utilizatori', icon: MessageSquareHeart },
  { id: 'audit', label: 'Audit', title: 'Jurnal de audit', icon: Activity }
]

export function viewTitle(view: View) {
  return navigation.find((item) => item.id === view)?.title ?? ''
}
