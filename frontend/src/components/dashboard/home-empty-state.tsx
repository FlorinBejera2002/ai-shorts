import { Link } from '@/i18n/navigation'
import { Plus, Scissors } from 'lucide-react'
import { useTranslations } from 'next-intl'
import styles from './home-workspace.module.css'

export function HomeEmptyState() {
  const t = useTranslations('dashboard.studio')
  return (
    <section
      className={styles.empty}
      data-home-empty=""
      aria-labelledby="home-empty-title"
    >
      <span className={styles.emptyIcon}>
        <Scissors aria-hidden="true" strokeWidth={1.6} />
      </span>
      <h2 id="home-empty-title">{t('firstClip')}</h2>
      <Link href="/dashboard/create" className={styles.primaryAction}>
        <Plus aria-hidden="true" />
        {t('startCreating')}
      </Link>
    </section>
  )
}
