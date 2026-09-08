'use client'

import { firstNameInitials } from '@/lib/profile-initials'
import { Avatar } from 'radix-ui'
import styles from './profile-avatar.module.css'

export function ProfileAvatar({
  name,
  src
}: { name?: string | null; src?: string | null }) {
  return (
    <Avatar.Root className={styles.avatar} aria-hidden="true">
      <Avatar.Image
        className={styles.image}
        src={src || undefined}
        alt=""
        referrerPolicy="no-referrer"
      />
      <Avatar.Fallback className={styles.fallback}>
        {firstNameInitials(name)}
      </Avatar.Fallback>
    </Avatar.Root>
  )
}
