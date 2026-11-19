'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useState, type ComponentProps } from 'react'
import { CanvasField } from './canvas-field'
import styles from './auth-canvas.module.css'

type PasswordInputProps = Omit<
  ComponentProps<typeof CanvasField>,
  'type' | 'trailing'
> & {
  showLabel: string
  hideLabel: string
}

export function PasswordInput({
  showLabel,
  hideLabel,
  ...fieldProps
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  const toggleLabel = visible ? hideLabel : showLabel

  return (
    <CanvasField
      {...fieldProps}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          className={styles.toggle}
          aria-label={toggleLabel}
          title={toggleLabel}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? (
            <EyeOff aria-hidden="true" width={16} height={16} />
          ) : (
            <Eye aria-hidden="true" width={16} height={16} />
          )}
        </button>
      }
    />
  )
}
