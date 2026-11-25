'use client'

import { Link, usePathname } from '@/i18n/navigation'
import { dashboardRouteLabel } from '@/lib/dashboard-navigation'
import { useTranslations } from 'next-intl'
import { createPortal } from 'react-dom'
import styles from './workspace-mobile-header.module.css'
import theme from '@/components/calendar/publishing-theme.module.css'
import { CreditUsageIndicator } from './credit-usage-indicator'

/** The Sneep Cut symbol without the wordmark. */
function SneepCutMark() {
  return (
    <svg role="img" aria-label="Sneep Cut" width="26" height="27" viewBox="0 0 272 286" fill="currentColor">
      <path d="M73 5.153C57.132 8.29 45.443 13.992 34.929 23.726 26.952 31.112 21.28 38.651 16.294 48.5 10.65 59.649 8.569 65.797 6.121 78.56c-2.648 13.808-2.679 21.431-.121 29.44 1.1 3.443 2 7.075 2 8.071s.496 2.117 1.102 2.492c.606.375 1.708 2.132 2.449 3.905 2.295 5.492 8.894 12.938 16.584 18.711C36.207 147.24 49.944 155 52.6 155c.924 0 3.53.863 5.79 1.918C64.172 159.617 84.872 166 87.842 166 89.581 166 239.109 13.816 242.59 8.504c1.326-2.026 1.44-2.874.509-3.805-.909-.909-20.431-1.226-80.899-1.311C87.997 3.283 81.845 3.405 73 5.153M132 155.793C41.077 247.362 18.899 270.303 19.208 272.461c.291 2.032.59 2.04 87.154 2.295l86.862.255 8.638-2.39c12.967-3.589 22.656-8.507 31.149-15.812C240.227 250.603 249 241.072 249 239.44c0-.43.608-1.493 1.351-2.361C253.566 233.323 261 216.994 261 213.688c0-1.34.751-4.406 1.668-6.812 2.481-6.509 2.472-29.122-.015-37.876-3.968-13.965-12.606-26.496-24.07-34.918-10.686-7.85-28.82-15.798-47.844-20.972-14.101-3.834-8.532-7.881-58.739 42.683" />
    </svg>
  )
}

/**
 * Phone header on every dashboard page (reference canvas): a full-width card with the Sneep Cut
 * mark, the page name and room for Workspace Agent. Navigation lives only in the bottom bar.
 * Rendered into <body> so animated page containers cannot offset its fixed position.
 */
export function WorkspaceMobileHeader() {
  const t = useTranslations('nav')
  const pathname = usePathname()
  return createPortal(
    <header className={`${theme.surface} ${styles.header}`} data-reference-surface="" data-workspace-mobile-header="">
      <Link href="/dashboard" className={styles.mark} aria-label={t('home')}>
        <SneepCutMark />
      </Link>
      <span className={styles.title}>{t(dashboardRouteLabel(pathname))}</span>
      <div className={styles.actions}><CreditUsageIndicator placement="header" /></div>
    </header>,
    document.body
  )
}
