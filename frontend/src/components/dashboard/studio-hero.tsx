'use client'

import { Link } from '@/i18n/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowUpRight, Clapperboard } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { QuickActions } from './quick-actions'
import styles from './studio-home.module.css'

export function StudioHero() {
  const ro = useLocale() === 'ro'
  const t = useTranslations('dashboard.studio')
  const reduced = useReducedMotion()
  return (
    <motion.section
      className={styles.hero}
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      aria-label={ro ? 'Începe un proiect' : 'Start a project'}
    >
      <div className={styles.heroCopy}>
        <div className={styles.eyebrow}>
          <Clapperboard size={15} strokeWidth={1.5} /> SNEEP CUT STUDIO
        </div>
        <h2 className={styles.heroTitle}>
          {ro
            ? 'Materialul tău. Următorul montaj.'
            : 'Your footage. Your next cut.'}
        </h2>
        <p className={styles.heroDescription}>
          {ro
            ? 'Transformă materialele lungi în clipuri scurte. Alege sursa, găsește momentele bune și pregătește-le de publicare.'
            : 'Turn long-form footage into short-form stories. Choose a source, find the moments, and make them ready to publish.'}
        </p>
        <Link href="/dashboard/clips" className={styles.libraryLink}>
          {t('openLibrary')} <ArrowUpRight size={14} />
        </Link>
      </div>
      <QuickActions />
    </motion.section>
  )
}
