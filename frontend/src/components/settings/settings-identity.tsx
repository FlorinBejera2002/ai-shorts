import type { Profile } from './settings-types'
import styles from './settings-workspace.module.css'

export function SettingsIdentity({ profile }: { profile: Profile }) {
  const initials = (profile.name?.trim() || profile.email)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
  return (
    <div className={styles.identity}>
      {profile.image ? (
        <img src={profile.image} alt="" className={styles.avatar} />
      ) : (
        <div className={styles.avatar} aria-hidden="true">
          {initials}
        </div>
      )}
      <div className={styles.identityText}>
        <h3>{profile.name || profile.email}</h3>
        <p>{profile.email}</p>
      </div>
    </div>
  )
}
