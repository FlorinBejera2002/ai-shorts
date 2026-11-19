'use client'

import theme from '@/components/calendar/publishing-theme.module.css'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Link } from '@/i18n/navigation'
import {
  activeClipFilters,
  CLIP_ASPECTS,
  CLIP_SORTS,
  CLIP_SUBTITLES,
  type ClipAspect,
  type ClipsQuery,
  type ClipSort,
  type ClipSubtitles
} from '@/lib/clips-library'
import { ArrowUpDown, Check, ChevronDown, ListFilter, Plus, Search, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DropdownMenu as Menu } from 'radix-ui'
import { useState, type ReactNode } from 'react'
import { CloseButton } from '@/components/shared/reference-overlay'
import { FormatIcon } from './clips-icons'
import overlay from '@/components/shared/reference-ui.module.css'
import styles from './clips.module.css'

type QueryProps = {
  query: ClipsQuery
  onChange: (changes: Partial<ClipsQuery>) => void
}

function useLabels() {
  const t = useTranslations('clipsLibrary')
  return {
    t,
    subtitles: { all: t('subtitlesAny'), yes: t('subtitlesYes'), no: t('subtitlesNo') } satisfies Record<ClipSubtitles, string>,
    sorts: { newest: t('sortNewest'), oldest: t('sortOldest'), duration: t('sortDuration') } satisfies Record<ClipSort, string>
  }
}

function SearchField({ query, onChange }: QueryProps) {
  const { t } = useLabels()
  // Keep what is typed (spaces included) and follow the URL when filters are cleared elsewhere.
  const [text, setText] = useState(query.search)
  const [synced, setSynced] = useState(query.search)
  if (synced !== query.search) {
    setSynced(query.search)
    if (text.trim().replace(/\s+/g, ' ') !== query.search) setText(query.search)
  }
  return (
    <label className={styles.search}>
      <Search aria-hidden="true" />
      <input
        type="search"
        aria-label={t('searchLabel')}
        placeholder={t('search')}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          onChange({ search: event.target.value })
        }}
        data-clips-search=""
      />
    </label>
  )
}

/** One toolbar pill that opens a single-choice menu. */
function ChoiceMenu<T extends string>({
  label,
  value,
  active,
  icon,
  options,
  onSelect
}: {
  label: ReactNode
  value: string
  active: boolean
  icon?: ReactNode
  options: { value: T; label: string; icon?: ReactNode }[]
  onSelect: (value: T) => void
}) {
  const current = options.find((option) => option.value === value)
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <button type="button" className={`${styles.toolButton} ${styles.focus}`} data-active={active ? '' : undefined}>
          {icon}
          {label}
          {active && current && <b>{current.label}</b>}
          <ChevronDown aria-hidden="true" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={8}
          className={`${theme.surface} ${styles.tokens} ${overlay.menu}`}
          data-reference-surface=""
        >
          <Menu.RadioGroup value={value} onValueChange={(next) => onSelect(next as T)}>
            {options.map((option) => (
              <Menu.RadioItem key={option.value} value={option.value} className={overlay.item}>
                {option.icon}
                <span>{option.label}</span>
                {option.value === value && <Check className={overlay.check} strokeWidth={2.5} aria-hidden="true" />}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

/** Phone list header sort control. */
export function ClipsMobileSort({ query, onChange }: QueryProps) {
  const { sorts, t } = useLabels()
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <button type="button" className={`${styles.sortLink} ${styles.focus}`} aria-label={`${t('sortLabel')}: ${sorts[query.sort]}`}>
          <ArrowUpDown aria-hidden="true" />
          {sorts[query.sort]}
          <ChevronDown aria-hidden="true" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className={`${theme.surface} ${styles.tokens} ${overlay.menu}`} data-reference-surface="">
          <Menu.RadioGroup value={query.sort} onValueChange={(sort) => onChange({ sort: sort as ClipSort })}>
            {CLIP_SORTS.map((value) => (
              <Menu.RadioItem key={value} value={value} className={overlay.item}>
                <span>{sorts[value]}</span>
                {value === query.sort && <Check className={overlay.check} strokeWidth={2.5} aria-hidden="true" />}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

/** Desktop toolbar: search, Format, Subtitrări, sort and "Clip nou". */
export function ClipsToolbar({ query, onChange }: QueryProps) {
  const { t, subtitles, sorts } = useLabels()
  return (
    <div className={styles.toolbar} data-clips-toolbar="">
      <SearchField query={query} onChange={onChange} />
      <ChoiceMenu<ClipAspect>
        label={t('format')}
        value={query.aspect}
        active={query.aspect !== 'all'}
        options={CLIP_ASPECTS.map((value) => ({
          value,
          label: value === 'all' ? t('allFormats') : value,
          icon: <FormatIcon ratio={value} />
        }))}
        onSelect={(aspect) => onChange({ aspect })}
      />
      <ChoiceMenu<ClipSubtitles>
        label={t('subtitles')}
        value={query.subtitles}
        active={query.subtitles !== 'all'}
        options={CLIP_SUBTITLES.map((value) => ({ value, label: subtitles[value] }))}
        onSelect={(value) => onChange({ subtitles: value })}
      />
      <span className={styles.toolDivider} aria-hidden="true" />
      <ChoiceMenu<ClipSort>
        label={
          <>
            <ArrowUpDown aria-hidden="true" />
            <span className="sr-only">{t('sortLabel')}: </span>
            <b>{sorts[query.sort]}</b>
          </>
        }
        value={query.sort}
        active={false}
        options={CLIP_SORTS.map((value) => ({ value, label: sorts[value] }))}
        onSelect={(sort) => onChange({ sort })}
      />
      <Link href="/dashboard/create" className={`${styles.button} ${styles.primary} ${styles.newClip} ${styles.focus}`}>
        <Plus aria-hidden="true" strokeWidth={2.5} />
        {t('newClip')}
      </Link>
    </div>
  )
}

/** Chips for the active filters; each can be removed on its own. */
export function ClipsActiveFilters({ query, onChange, mobile }: QueryProps & { mobile: boolean }) {
  const { t, subtitles } = useLabels()
  const active = activeClipFilters(query)
  if (!active.length) return null
  const chips = active.map((name) => {
    const label =
      name === 'aspect'
        ? t('filterFormat', { value: query.aspect })
        : t('filterSubtitles', { value: subtitles[query.subtitles] })
    return (
      <span key={name} className={styles.filterChip}>
        {label}
        <button
          type="button"
          className={styles.focus}
          aria-label={t('removeFilter', { filter: label })}
          onClick={() => onChange(name === 'aspect' ? { aspect: 'all' } : { subtitles: 'all' })}
        >
          <X aria-hidden="true" />
        </button>
      </span>
    )
  })
  if (mobile)
    return (
      <div className={styles.mobileFilterBar} data-clips-active-filters="">
        <span>{chips}</span>
      </div>
    )
  return (
    <div className={styles.activeFilters} data-clips-active-filters="">
      <span className={styles.muted}>{t('activeFilters')}</span>
      {chips}
      <button
        type="button"
        className={`${styles.button} ${styles.ghost} ${styles.clearFilters} ${styles.focus}`}
        onClick={() => onChange({ aspect: 'all', subtitles: 'all', search: '' })}
      >
        {t('clearFilters')}
      </button>
    </div>
  )
}

/** Phone toolbar: search, filters (with a count badge) and "+". */
export function ClipsMobileToolbar({ query, onChange }: QueryProps) {
  const { t } = useLabels()
  const [open, setOpen] = useState(false)
  const count = activeClipFilters(query).length
  return (
    <div className={styles.mobileToolbar} data-clips-toolbar="">
      <SearchField query={query} onChange={onChange} />
      <button
        type="button"
        className={`${styles.button} ${styles.secondary} ${styles.squareButton} ${styles.focus}`}
        aria-label={count ? t('filtersActive', { count }) : t('filters')}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <ListFilter aria-hidden="true" />
        {count > 0 && <span className={styles.badge} aria-hidden="true">{count}</span>}
      </button>
      <Link href="/dashboard/create" aria-label={t('newClip')} className={`${styles.button} ${styles.primary} ${styles.squareButton} ${styles.focus}`}>
        <Plus aria-hidden="true" strokeWidth={2.5} />
      </Link>
      <ClipsFilterSheet open={open} query={query} onChange={onChange} onClose={() => setOpen(false)} />
    </div>
  )
}

/** Phone filter sheet: choices are drafted and applied together. */
function ClipsFilterSheet({ open, query, onChange, onClose }: QueryProps & { open: boolean; onClose: () => void }) {
  const { t, subtitles, sorts } = useLabels()
  const [draft, setDraft] = useState({ aspect: query.aspect, subtitles: query.subtitles, sort: query.sort })
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft({ aspect: query.aspect, subtitles: query.subtitles, sort: query.sort })
        else onClose()
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        aria-describedby={undefined}
        onOpenAutoFocus={() => setDraft({ aspect: query.aspect, subtitles: query.subtitles, sort: query.sort })}
        className={`${theme.surface} ${styles.tokens} ${overlay.sheet}`}
        overlayClassName={theme.overlay}
        data-reference-surface=""
      >
        <span className={overlay.grab} aria-hidden="true" />
        <div className={overlay.sheetHead}>
          <SheetTitle>{t('filters')}</SheetTitle>
          <CloseButton onClick={onClose} />
        </div>
        <Segment
          label={t('formatLabel')}
          options={CLIP_ASPECTS.map((value) => ({ value, label: value === 'all' ? t('all') : value }))}
          value={draft.aspect}
          onChange={(aspect) => setDraft((current) => ({ ...current, aspect }))}
        />
        <Segment
          label={t('subtitles')}
          options={CLIP_SUBTITLES.map((value) => ({ value, label: subtitles[value] }))}
          value={draft.subtitles}
          onChange={(value) => setDraft((current) => ({ ...current, subtitles: value }))}
        />
        <Segment
          label={t('sortLabel')}
          options={CLIP_SORTS.map((value) => ({ value, label: sorts[value] }))}
          value={draft.sort}
          onChange={(sort) => setDraft((current) => ({ ...current, sort }))}
        />
        <div className={overlay.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.secondary} ${styles.focus}`}
            onClick={() => {
              onChange({ aspect: 'all', subtitles: 'all', sort: 'newest' })
              onClose()
            }}
          >
            {t('clearFilters')}
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.primary} ${styles.focus}`}
            onClick={() => {
              onChange(draft)
              onClose()
            }}
          >
            {t('apply')}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Segment<T extends string>({
  label,
  options,
  value,
  onChange
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className={overlay.segment} role="group" aria-label={label}>
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button key={option.value} type="button" aria-pressed={option.value === value} className={styles.focus} onClick={() => onChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
