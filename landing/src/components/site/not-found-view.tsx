import { getCopy } from '@/content/copy'
import { localePath, type Locale } from '@/lib/i18n'
import styles from './not-found.module.css'

export function NotFoundView({ locale }: { locale: Locale }) {
  const { notFound } = getCopy(locale)
  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <img
          src="/landing/illustrations/not-found.webp"
          alt={notFound.alt}
          width={300}
          height={300}
          className={styles.illustration}
        />
        <span className={`muted ${styles.code}`}>{notFound.code}</span>
        <h1 className={`heading ${styles.title}`}>{notFound.title}</h1>
        <p className={`muted ${styles.text}`}>{notFound.text}</p>
        <div className={styles.actions}>
          <a href={localePath(locale, '/')} className={`btn btn-primary ${styles.action}`}>
            {notFound.home}
          </a>
          <a href={localePath(locale, '/pricing')} className={`btn btn-secondary ${styles.action}`}>
            {notFound.pricing}
          </a>
        </div>
      </div>
    </section>
  )
}
