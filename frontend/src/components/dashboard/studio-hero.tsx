'use client'

import { Link } from '@/i18n/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowUpRight, Clapperboard, Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
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
            ? 'Creează clipuri din orice material.'
            : 'Create clips from any footage.'}
        </h2>
        <p className={styles.heroDescription}>
          {ro
            ? 'Încarcă un video sau adaugă un link. Sneep Cut găsește momentele bune și le pregătește pentru editare.'
            : 'Upload a video or add a link. Sneep Cut finds the strongest moments and prepares them for editing.'}
        </p>
        <div className={styles.heroLinks}>
          <Link href="/dashboard/create" className={styles.primaryAction}>
            <Plus size={15} />
            {ro ? 'Clip nou' : 'New clip'}
          </Link>
          <Link href="/dashboard/clips" className={styles.libraryLink}>
            {t('openLibrary')} <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
    </motion.section>
  )
}
