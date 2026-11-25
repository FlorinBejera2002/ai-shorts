import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { agentPillClass, type AgentPillVariant } from './agent-pill-class'

type AgentPillProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AgentPillVariant
  /** Shares the row evenly with sibling pills. */
  fill?: boolean
  /** Leading icon, rendered before the label. */
  icon?: ReactNode
}

/** Pill button (36px desktop, 44px phone). The only pill implementation in the Workspace Agent. */
export function AgentPill({ variant, fill, icon, className, type = 'button', children, ...props }: AgentPillProps) {
  return (
    <button type={type} className={agentPillClass(variant, fill, className)} {...props}>
      {icon}
      {children}
    </button>
  )
}
