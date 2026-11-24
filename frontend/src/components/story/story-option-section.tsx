import { useId, type ReactNode } from 'react'
import styles from './story-options.module.css'

/** A titled inspector group. Groups are separated by spacing only, never by rules. */
export function StoryOptionSection({
  title,
  action,
  children
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  const titleID = useId()
  return (
    <section className={styles.section} aria-labelledby={titleID}>
      <div className={styles.sectionTitleRow}>
        <h3 id={titleID} className={styles.sectionTitle}>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}
