'use client'

import theme from '@/components/calendar/publishing-theme.module.css'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useIsMobile } from '@/hooks/use-mobile'
import { Link } from '@/i18n/navigation'
import { formatDuration } from '@/lib/utils'
import type { ClipVariant } from '@/types'
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Film,
  Folder,
  type LucideIcon,
  MoreHorizontal,
  Play,
  Scissors,
  Send,
  Trash2
} from 'lucide-react'
import { useId, useState, type MouseEvent, type ReactNode } from 'react'
import type { ClipCardData } from './clip-card'
import { availableClipDownloads, clipDownloadName } from './clip-download-utils'
import styles from './clip-actions-menu.module.css'

export type ClipCardActions = {
  edit: string
  publish: string
  download: string
  delete: string
  deleteConfirm: string
  deleteSuccess: string
  deleteError: string
}

export type ClipMoveTarget = { value: string; label: string }
/** `reference` renders the approved Clips page design; `default` keeps the dashboard style. */
export type ClipActionsAppearance = 'default' | 'reference'
type ActionPanel = 'download' | 'move' | null

type ClipActionsProps = {
  clip: ClipCardData
  locale: string
  actions: ClipCardActions
  disabled: boolean
  clipHref: string
  moveTargets: ClipMoveTarget[]
  currentMoveTarget?: string
  onMove?: (value: string) => void | Promise<void>
  moveLabel: string
  menuLabel: string
  cancelLabel: string
  onDelete: () => void | Promise<void>
  appearance?: ClipActionsAppearance
  triggerClassName?: string
  /** Secondary line under the clip title in the mobile sheet. */
  summary?: string
}

type MenuContentProps = ClipActionsProps & {
  trigger: ReactNode
  open: boolean
  panel: ActionPanel
  moveError?: string
  downloads: ClipVariant[]
  onOpenChange: (open: boolean) => void
  onPanelChange: (panel: ActionPanel, open: boolean) => void
  onMoveTarget: (value: string) => void
  onDeleteRequest: () => void
}

type ActionName = 'edit' | 'publish' | 'download' | 'move' | 'delete'

const icons: Record<ClipActionsAppearance, Record<ActionName, LucideIcon>> = {
  default: {
    edit: Scissors,
    publish: Send,
    download: Download,
    move: Folder,
    delete: Trash2
  },
  reference: {
    edit: Play,
    publish: ArrowUpRight,
    download: ArrowDown,
    move: ArrowRight,
    delete: Trash2
  }
}

function classes(...names: (string | false | undefined)[]) {
  return names.filter(Boolean).join(' ')
}

function ActionIcon({
  icon: Icon,
  reference
}: {
  icon: LucideIcon
  reference: boolean
}) {
  if (!reference) return <Icon />
  return (
    <span className={styles.icon} aria-hidden="true">
      <Icon />
    </span>
  )
}

function DownloadName({ variant }: { variant: ClipVariant }) {
  return (
    <span className={styles.downloadName}>
      <span>{variant.name}</span>
      <small>
        {[variant.resolution, variant.platforms?.join(', ')]
          .filter(Boolean)
          .join(' · ')}
      </small>
    </span>
  )
}

function DesktopClipActions({
  clip,
  actions,
  disabled,
  clipHref,
  moveTargets,
  currentMoveTarget,
  onMove,
  moveLabel,
  appearance = 'default',
  trigger,
  open,
  panel,
  moveError,
  downloads,
  onOpenChange,
  onPanelChange,
  onMoveTarget,
  onDeleteRequest
}: MenuContentProps) {
  const reference = appearance === 'reference'
  const icon = icons[appearance]
  const surface = reference && `${theme.surface} ${styles.reference}`
  const EditIcon = icon.edit
  const PublishIcon = icon.publish
  const DownloadIcon = icon.download
  const MoveIcon = icon.move
  const DeleteIcon = icon.delete
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild={true}>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={reference ? 'start' : 'end'}
        className={classes(styles.dropdown, surface)}
        data-clip-actions="desktop"
        data-reference-surface={reference ? '' : undefined}
      >
        <DropdownMenuItem asChild={true} disabled={disabled}>
          <Link href={clipHref}>
            <EditIcon />
            {actions.edit}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild={true} disabled={disabled}>
          <Link
            href={`/dashboard/publish/new?clip=${encodeURIComponent(clip.id)}`}
          >
            <PublishIcon />
            {actions.publish}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub
          open={panel === 'download'}
          onOpenChange={(value) => onPanelChange('download', value)}
        >
          <DropdownMenuSubTrigger disabled={disabled || !downloads.length}>
            <DownloadIcon />
            {actions.download}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className={classes(styles.submenu, surface)}>
              {downloads.map((variant) => (
                <DropdownMenuItem key={variant.id} asChild={true}>
                  <a
                    href={variant.url}
                    download={clipDownloadName(clip.title, variant.name)}
                    data-clip-download={variant.id}
                  >
                    <Download />
                    <DownloadName variant={variant} />
                  </a>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuSub
          open={panel === 'move'}
          onOpenChange={(value) => onPanelChange('move', value)}
        >
          <DropdownMenuSubTrigger
            disabled={disabled || !onMove || !moveTargets.length}
          >
            <MoveIcon />
            {moveLabel}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent
              className={classes(styles.submenu, surface)}
              aria-label={moveLabel}
            >
              {moveTargets.map((target) => {
                const current = target.value === currentMoveTarget
                return (
                  <DropdownMenuItem
                    key={target.value}
                    disabled={disabled || (!reference && current)}
                    data-current={current}
                    data-clip-move-target={target.value}
                    onSelect={(event) => {
                      event.preventDefault()
                      onMoveTarget(target.value)
                    }}
                  >
                    {!reference && <Folder />}
                    <span>{target.label}</span>
                    {current && <Check className="ml-auto size-4" />}
                  </DropdownMenuItem>
                )
              })}
              {moveError && (
                <p role="alert" className={styles.error}>
                  {moveError}
                </p>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        {!reference && <DropdownMenuSeparator />}
        <DropdownMenuItem
          variant="destructive"
          disabled={disabled}
          onSelect={onDeleteRequest}
        >
          <DeleteIcon />
          {actions.delete}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type MobilePanelProps = {
  id: string
  label: string
  icon: LucideIcon
  disabled: boolean
  reference: boolean
  expanded: boolean
  onToggle: () => void
}

function MobileDownloadActions({
  id,
  label,
  icon,
  disabled,
  reference,
  expanded,
  onToggle,
  clipTitle,
  downloads,
  onSelect
}: MobilePanelProps & {
  clipTitle: string
  downloads: ClipVariant[]
  onSelect: () => void
}) {
  return (
    <>
      <button
        type="button"
        className={styles.row}
        disabled={disabled || !downloads.length}
        aria-expanded={expanded}
        aria-controls={id}
        onClick={onToggle}
      >
        <ActionIcon icon={icon} reference={reference} />
        <span>{label}</span>
        <ChevronDown className={expanded ? styles.expanded : undefined} />
      </button>
      {expanded && (
        <div id={id} className={styles.mobileSubmenu}>
          {downloads.map((variant) => (
            <a
              key={variant.id}
              href={variant.url}
              download={clipDownloadName(clipTitle, variant.name)}
              className={styles.subrow}
              data-clip-download={variant.id}
              onClick={onSelect}
            >
              <Download />
              <DownloadName variant={variant} />
            </a>
          ))}
        </div>
      )}
    </>
  )
}

function MobileMoveActions({
  id,
  label,
  icon,
  disabled,
  reference,
  expanded,
  onToggle,
  canMove,
  moveTargets,
  currentMoveTarget,
  moveError,
  onMoveTarget
}: MobilePanelProps &
  Pick<
    MenuContentProps,
    'moveTargets' | 'currentMoveTarget' | 'moveError' | 'onMoveTarget'
  > & { canMove: boolean }) {
  return (
    <>
      <button
        type="button"
        className={styles.row}
        data-active={reference && expanded}
        disabled={disabled || !canMove || !moveTargets.length}
        aria-expanded={expanded}
        aria-controls={id}
        onClick={onToggle}
      >
        <ActionIcon icon={icon} reference={reference} />
        <span>{label}</span>
        {reference ? (
          <ChevronDown className={expanded ? styles.expanded : undefined} />
        ) : (
          <ChevronRight className={expanded ? styles.moveExpanded : undefined} />
        )}
      </button>
      {expanded && (
        <div
          id={id}
          className={styles.mobileSubmenu}
          role={reference ? 'radiogroup' : undefined}
          aria-label={reference ? label : undefined}
        >
          {moveTargets.map((target) => {
            const current = target.value === currentMoveTarget
            return (
              <button
                key={target.value}
                type="button"
                role={reference ? 'radio' : undefined}
                aria-checked={reference ? current : undefined}
                className={styles.subrow}
                disabled={disabled || (!reference && current)}
                data-clip-move-target={target.value}
                onClick={() => onMoveTarget(target.value)}
              >
                {!reference && <Folder />}
                <span>{target.label}</span>
                {current && <Check className="ml-auto size-4" />}
              </button>
            )
          })}
          {moveError && (
            <p role="alert" className={styles.error}>
              {moveError}
            </p>
          )}
        </div>
      )}
    </>
  )
}

function MobileClipActions({
  clip,
  actions,
  disabled,
  clipHref,
  moveTargets,
  currentMoveTarget,
  onMove,
  moveLabel,
  cancelLabel,
  appearance = 'default',
  summary,
  trigger,
  open,
  panel,
  moveError,
  downloads,
  onOpenChange,
  onPanelChange,
  onMoveTarget,
  onDeleteRequest
}: MenuContentProps) {
  const panelId = useId()
  const reference = appearance === 'reference'
  const icon = icons[appearance]
  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (disabled) event.preventDefault()
    else onOpenChange(false)
  }
  const rowEnd = reference ? null : <ChevronRight />

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild={true}>{trigger}</SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={classes(
          styles.sheet,
          reference && `${theme.surface} ${styles.reference}`
        )}
        overlayClassName={reference ? theme.overlay : undefined}
        aria-describedby={undefined}
        data-clip-actions="mobile"
        data-reference-surface={reference ? '' : undefined}
      >
        <span className={styles.handle} aria-hidden="true" />
        <header className={styles.header}>
          <span className={styles.thumbnail}>
            {clip.thumbnailUrl ? (
              <img src={clip.thumbnailUrl} alt="" />
            ) : (
              <Film aria-hidden="true" />
            )}
          </span>
          <div>
            <SheetTitle className={styles.title}>{clip.title}</SheetTitle>
            <p>{summary ?? formatDuration(clip.duration)}</p>
          </div>
        </header>
        <div className={styles.mobileActions}>
          <Link
            href={clipHref}
            className={styles.row}
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : undefined}
            onClick={navigate}
          >
            <ActionIcon icon={icon.edit} reference={reference} />
            <span>{actions.edit}</span>
            {rowEnd}
          </Link>
          <Link
            href={`/dashboard/publish/new?clip=${encodeURIComponent(clip.id)}`}
            className={styles.row}
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : undefined}
            onClick={navigate}
          >
            <ActionIcon icon={icon.publish} reference={reference} />
            <span>{actions.publish}</span>
            {rowEnd}
          </Link>
          <MobileDownloadActions
            id={`${panelId}-downloads`}
            label={actions.download}
            icon={icon.download}
            disabled={disabled}
            reference={reference}
            expanded={panel === 'download'}
            onToggle={() => onPanelChange('download', panel !== 'download')}
            clipTitle={clip.title}
            downloads={downloads}
            onSelect={() => onOpenChange(false)}
          />
          <MobileMoveActions
            id={`${panelId}-move`}
            label={moveLabel}
            icon={icon.move}
            disabled={disabled}
            reference={reference}
            expanded={panel === 'move'}
            onToggle={() => onPanelChange('move', panel !== 'move')}
            canMove={Boolean(onMove)}
            moveTargets={moveTargets}
            currentMoveTarget={currentMoveTarget}
            moveError={moveError}
            onMoveTarget={onMoveTarget}
          />
          <button
            type="button"
            className={`${styles.row} ${styles.destructive}`}
            disabled={disabled}
            onClick={onDeleteRequest}
          >
            <ActionIcon icon={icon.delete} reference={reference} />
            <span>{actions.delete}</span>
            {rowEnd}
          </button>
        </div>
        {!reference && (
          <SheetClose asChild={true}>
            <Button
              type="button"
              variant="outline"
              className={styles.cancel}
              disabled={disabled}
            >
              {cancelLabel}
            </Button>
          </SheetClose>
        )}
      </SheetContent>
    </Sheet>
  )
}

export function ClipActionsMenu(props: ClipActionsProps) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<ActionPanel>(null)
  const [moving, setMoving] = useState(false)
  const [moveError, setMoveError] = useState<string>()
  const downloads = availableClipDownloads(
    props.clip.variants,
    props.clip.fileUrl
  )

  function changeOpen(value: boolean) {
    if (moving && !value) return
    setOpen(value)
    if (!value) {
      setPanel(null)
      setMoveError(undefined)
    }
  }

  function changePanel(next: ActionPanel, value: boolean) {
    setPanel((current) => (value ? next : current === next ? null : current))
  }

  async function moveTo(value: string) {
    if (
      !props.onMove ||
      moving ||
      props.disabled ||
      value === props.currentMoveTarget
    )
      return
    setMoving(true)
    setMoveError(undefined)
    try {
      await props.onMove(value)
      setOpen(false)
      setPanel(null)
    } catch (cause) {
      setMoveError(
        cause instanceof Error
          ? cause.message
          : props.locale === 'ro'
            ? 'Clipul nu a putut fi mutat.'
            : 'Could not move this clip.'
      )
    } finally {
      setMoving(false)
    }
  }

  function requestDelete() {
    setOpen(false)
    setPanel(null)
    void props.onDelete()
  }

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={props.triggerClassName ?? styles.trigger}
      disabled={props.disabled || moving}
      aria-label={props.menuLabel}
      data-clip-menu-trigger={props.clip.id}
    >
      {moving ? (
        <LoadingIndicator className="size-4" />
      ) : (
        <MoreHorizontal className="size-5" />
      )}
    </Button>
  )
  const Menu = isMobile ? MobileClipActions : DesktopClipActions
  return (
    <Menu
      {...props}
      disabled={props.disabled || moving}
      trigger={trigger}
      open={open}
      panel={panel}
      moveError={moveError}
      downloads={downloads}
      onOpenChange={changeOpen}
      onPanelChange={changePanel}
      onMoveTarget={(value) => void moveTo(value)}
      onDeleteRequest={requestDelete}
    />
  )
}
