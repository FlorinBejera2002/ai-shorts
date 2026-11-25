'use client'

import { useId } from 'react'
import { Popover } from 'radix-ui'
import { useTranslations } from 'next-intl'
import theme from '@/components/calendar/publishing-theme.module.css'
import { useCreditUsage } from './sidebar-usage'
import { useUsagePopover } from './use-usage-popover'
import { CreditUsageDetails } from './credit-usage-details'
import styles from './credit-usage-indicator.module.css'

type Resource = ReturnType<typeof useCreditUsage>
type Props = { placement: 'sidebar' | 'header'; onNavigate?: () => void }

function usageState({ usage, error }: Resource) {
  if (!usage) return error ? 'error' : 'loading'
  return usage.unlimited ? 'unlimited' : 'ready'
}

function CreditUsageRing({ usage, error }: Pick<Resource, 'usage' | 'error'>) {
  let symbol = ''
  if (usage?.unlimited) symbol = '∞'
  else if (!usage) symbol = error ? '?' : '·'
  return (
    <span className={styles.ring} aria-hidden="true">
      <svg viewBox="0 0 36 36">
        <circle className={styles.track} cx="18" cy="18" r="15" />
        {usage && <circle className={styles.fill} cx="18" cy="18" r="15" pathLength="100" strokeDasharray={`${usage.unlimited ? 100 : usage.remaining} 100`} />}
      </svg>
      <span className={styles.symbol}>{symbol}</span>
    </span>
  )
}

/** One balance indicator with mouse, keyboard and touch access to its details. */
export function CreditUsageIndicator({ placement, onNavigate }: Props) {
  const t = useTranslations('creditUsage')
  const titleId = useId()
  const resource = useCreditUsage()
  const { open, setOpen, trigger, content, triggerEvents, contentEvents, onCloseAutoFocus } = useUsagePopover()
  const state = usageState(resource)
  const summary = t(state === 'ready' ? 'remaining' : state, { percent: resource.usage?.remaining ?? 0 })

  if (!resource.authenticated) return null
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          ref={trigger}
          type="button"
          className={`${styles.trigger} ${styles[placement]}`}
          data-credit-usage={placement}
          data-sidebar-usage={placement === 'sidebar' ? '' : undefined}
          data-usage-state={state}
          aria-label={t('label', { summary })}
          aria-busy={state === 'loading'}
          {...triggerEvents}
        >
          <CreditUsageRing usage={resource.usage} error={resource.error} />
          {placement === 'sidebar' && <span className={styles.caption}><span>{t('title')}</span><span>{summary}</span></span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          ref={content}
          className={`${theme.surface} ${styles.details}`}
          data-reference-surface=""
          data-credit-usage-details={placement}
          aria-labelledby={titleId}
          side={placement === 'sidebar' ? 'right' : 'bottom'}
          align="end"
          sideOffset={8}
          collisionPadding={12}
          onOpenAutoFocus={event => event.preventDefault()}
          onCloseAutoFocus={onCloseAutoFocus}
          {...contentEvents}
        >
          <CreditUsageDetails resource={resource} summary={summary} titleId={titleId} onNavigate={() => { setOpen(false); onNavigate?.() }} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
