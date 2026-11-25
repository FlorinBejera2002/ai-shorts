import type { AgentStatus } from './model'
import { SCENE_FILE, type AgentScene } from './agent-scenes'
import styles from './agent-persona.module.css'

/** Ana & Radu, the agent's persona. Every agent surface uses these instead of a bot icon. */
const AGENT_AVATAR = '/illustrations/agent-avatar-duo.webp'
const AGENT_AVATAR_TYPING = '/illustrations/agent-typing.webp'

export function AgentAvatar({ size = 28, typing = false, className = '' }: { size?: number; typing?: boolean; className?: string }) {
  return <img src={typing ? AGENT_AVATAR_TYPING : AGENT_AVATAR} alt="" aria-hidden="true" width={size} height={size} className={`${styles.avatar} ${className}`} style={{ width: size, height: size }} draggable={false} />
}

/** Decorative state scene (Ana & Radu). Sizes follow the panel: pass a smaller size in tight places. */
export function AgentIllustration({ scene, size = 88, className = '' }: { scene: AgentScene; size?: number; className?: string }) {
  return <img src={`/illustrations/${SCENE_FILE[scene]}.webp`} alt="" aria-hidden="true" width={size} height={size} loading="lazy" className={`${styles.scene} ${className}`} style={{ width: size, height: size }} draggable={false} />
}

type Tone = 'neutral' | 'warning' | 'success' | 'danger'
const STATUS_TONE: Record<AgentStatus, Tone> = {
  planning: 'neutral', running: 'neutral', paused: 'neutral', cancel_requested: 'neutral', cancelled: 'neutral',
  waiting_for_confirmation: 'warning', waiting_for_resources: 'warning', completed: 'success', failed: 'danger'
}

/** Small status badge (rounded-sm) used in run cards. `label` comes from messages.statuses. */
export function AgentStatusBadge({ status, label }: { status: AgentStatus; label: string }) {
  return <span role="status" className={styles.badge} data-tone={STATUS_TONE[status]}>{label}</span>
}
