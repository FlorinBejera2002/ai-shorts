'use client'

import { Check } from 'lucide-react'
import type { PasswordCheck } from './password-policy'
import styles from './auth-canvas.module.css'

/** Live password checklist; each rule fills its dot once it passes. */
export function PasswordRules({ checks }: { checks: PasswordCheck[] }) {
  return (
    <ul className={styles.rules}>
      {checks.map((check) => (
        <li
          key={check.id}
          className={
            check.passed ? `${styles.rule} ${styles.rulePassed}` : styles.rule
          }
        >
          <span className={styles.ruleMark} aria-hidden="true">
            {check.passed && <Check width={9} height={9} strokeWidth={3} />}
          </span>
          {check.label}
        </li>
      ))}
    </ul>
  )
}
