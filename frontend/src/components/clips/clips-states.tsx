import { Link } from '@/i18n/navigation'
import { AlertCircle, Folder, Search, SquarePlay } from 'lucide-react'
import type { ReactNode } from 'react'
import { useClipsCopy } from './clips-copy'
import styles from './clips-states.module.css'

type StateKind = 'library' | 'project' | 'results' | 'error'

const icons = {
  library: SquarePlay,
  project: Folder,
  results: Search,
  error: AlertCircle
}

function StateCard({
  kind,
  title,
  children
}: {
  kind: StateKind
  title: string
  children?: ReactNode
}) {
  const Icon = icons[kind]
  return (
    <section
      className={styles.state}
      data-kind={kind}
      role={kind === 'error' ? 'alert' : undefined}
      aria-label={title}
    >
      <span className={styles.icon}>
        <Icon aria-hidden="true" />
      </span>
      <h2>{title}</h2>
      {children}
    </section>
  )
}

export function ClipsEmptyLibrary() {
  const copy = useClipsCopy()
  return (
    <StateCard kind="library" title={copy.emptyLibrary}>
      <Link href="/dashboard/create" className={styles.primary}>
        {copy.newClip}
      </Link>
    </StateCard>
  )
}

export function ClipsEmptyProject() {
  const copy = useClipsCopy()
  return (
    <StateCard kind="project" title={copy.emptyProject}>
      <p>{copy.emptyProjectHint}</p>
    </StateCard>
  )
}

export function ClipsNoResults({ onClear }: { onClear: () => void }) {
  const copy = useClipsCopy()
  return (
    <StateCard kind="results" title={copy.noResults}>
      <button type="button" className={styles.selected} onClick={onClear}>
        {copy.clearFilters}
      </button>
    </StateCard>
  )
}

export function ClipsLoadError({ onRetry }: { onRetry: () => void }) {
  const copy = useClipsCopy()
  return (
    <StateCard kind="error" title={copy.loadError}>
      <button type="button" className={styles.selected} onClick={onRetry}>
        {copy.retry}
      </button>
    </StateCard>
  )
}

export function ClipsGridSkeleton({ count = 8 }: { count?: number }) {
  const copy = useClipsCopy()
  return (
    <div className={styles.skeleton} aria-busy="true" aria-label={copy.loading}>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className={styles.tile}>
          <span className={styles.thumb} />
          <span className={styles.line} />
        </span>
      ))}
    </div>
  )
}
