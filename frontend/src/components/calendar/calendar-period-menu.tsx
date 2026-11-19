'use client'

import {
  OverlayTitle,
  ReferenceOverlay,
  referenceSurface
} from '@/components/shared/reference-overlay'
import ui from '@/components/shared/reference-ui.module.css'
import { useIsMobile } from '@/hooks/use-mobile'
import { Popover } from 'radix-ui'
import { CalendarDays, Check, ChevronDown, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { CalendarRangePicker } from './calendar-range-picker'
import {
  type PeriodPreset,
  type PublishingPeriod,
  isSameRange,
  periodLabel,
  periodPresets,
  presetPeriod
} from './calendar-period'
import styles from './calendar-period-menu.module.css'

type MenuView = 'presets' | 'custom'

/** Period trigger with preset choices; custom ranges open the day picker in the same surface. */
export function CalendarPeriodMenu({
  period,
  locale,
  weekStartsOn,
  open,
  onOpenChange,
  onSelect
}: {
  period: PublishingPeriod
  locale: string
  weekStartsOn: 0 | 1
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (period: PublishingPeriod) => void
}) {
  const t = useTranslations('contentCalendar')
  const mobile = useIsMobile()
  const [view, setView] = useState<MenuView>('presets')
  const label = periodLabel(period, locale)

  function change(next: boolean) {
    onOpenChange(next)
    if (!next) setView('presets')
  }

  function choosePreset(kind: PeriodPreset) {
    onSelect(presetPeriod(kind, new Date(), weekStartsOn))
    change(false)
  }

  const content =
    view === 'custom' ? (
      <CalendarRangePicker
        initial={period}
        locale={locale}
        weekStartsOn={weekStartsOn}
        onBack={() => setView('presets')}
        onApply={(next) => {
          onSelect(next)
          change(false)
        }}
      />
    ) : (
      <PresetList
        current={currentPreset(period, weekStartsOn)}
        onChoose={choosePreset}
        onCustom={() => setView('custom')}
      />
    )

  const trigger = (
    <button
      type="button"
      className={styles.trigger}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`${t('periods.menuLabel')}: ${label}`}
      data-period-trigger=""
      onClick={() => change(!open)}
    >
      <CalendarDays aria-hidden="true" />
      <span className={styles.label}>{label}</span>
      <ChevronDown aria-hidden="true" />
    </button>
  )

  if (mobile)
    return (
      <>
        {trigger}
        <ReferenceOverlay open={open} mobile onClose={() => change(false)}>
          <OverlayTitle mobile>{t('periods.menuLabel')}</OverlayTitle>
          {content}
        </ReferenceOverlay>
      </>
    )

  return (
    <Popover.Root open={open} onOpenChange={change}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          data-publish-surface=""
          aria-label={t('periods.menuLabel')}
          className={`${referenceSurface} ${styles.popover}`}
        >
          {content}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** The preset whose range the period matches, if it is one of the fixed choices. */
function currentPreset(period: PublishingPeriod, weekStartsOn: 0 | 1) {
  const now = new Date()
  return periodPresets.find((kind) =>
    isSameRange(presetPeriod(kind, now, weekStartsOn), period)
  )
}

function PresetList({
  current,
  onChoose,
  onCustom
}: {
  current: PeriodPreset | undefined
  onChoose: (kind: PeriodPreset) => void
  onCustom: () => void
}) {
  const t = useTranslations('contentCalendar.periods')
  const actionsT = useTranslations('contentCalendar.actions')
  const labels: Record<PeriodPreset, string> = {
    today: actionsT('today'),
    week: t('week'),
    month: t('month'),
    lastMonth: t('lastMonth'),
    last30: t('last30')
  }
  return (
    <div className={`${ui.menu} ${styles.menu}`} role="menu">
      {periodPresets.map((kind) => (
        <button
          key={kind}
          type="button"
          role="menuitemradio"
          aria-checked={current === kind}
          className={ui.item}
          onClick={() => onChoose(kind)}
        >
          <span>{labels[kind]}</span>
          {current === kind && <Check aria-hidden="true" />}
        </button>
      ))}
      <div className={ui.separator} role="separator" />
      <button type="button" role="menuitem" className={ui.item} onClick={onCustom}>
        <span>{t('custom')}</span>
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  )
}
