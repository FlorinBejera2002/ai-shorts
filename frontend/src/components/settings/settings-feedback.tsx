import { CircleAlert } from 'lucide-react'
import styles from './settings-workspace.module.css'

export function SettingsFeedback({
  message,
  success = false
}: {
  message?: string
  success?: boolean
}) {
  if (!message) return null
  return (
    <p
      role={success ? 'status' : 'alert'}
      className={success ? styles.success : styles.error}
    >
      {!success && <CircleAlert aria-hidden="true" />}
      {message}
    </p>
  )
}
