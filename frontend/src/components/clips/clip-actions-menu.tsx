'use client'

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
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Film,
  Folder,
  MoreHorizontal,
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
  onDelete: () => Promise<void>
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
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild={true}>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={styles.dropdown}
        data-clip-actions="desktop"
      >
        <DropdownMenuItem asChild={true} disabled={disabled}>
          <Link href={clipHref}>
            <Scissors />
            {actions.edit}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild={true} disabled={disabled}>
          <Link
            href={`/dashboard/publish/new?clip=${encodeURIComponent(clip.id)}`}
          >
            <Send />
            {actions.publish}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub
          open={panel === 'download'}
          onOpenChange={(value) => onPanelChange('download', value)}
        >
          <DropdownMenuSubTrigger disabled={disabled || !downloads.length}>
            <Download />
            {actions.download}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className={styles.submenu}>
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
            <Folder />
            {moveLabel}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className={styles.submenu}>
              {moveTargets.map((target) => (
                <DropdownMenuItem
                  key={target.value}
                  disabled={disabled || target.value === currentMoveTarget}
                  data-clip-move-target={target.value}
                  onSelect={(event) => {
                    event.preventDefault()
                    onMoveTarget(target.value)
                  }}
                >
                  <Folder />
                  <span>{target.label}</span>
                  {target.value === currentMoveTarget && (
                    <Check className="ml-auto size-4" />
                  )}
                </DropdownMenuItem>
              ))}
              {moveError && (
                <p role="alert" className={styles.error}>
                  {moveError}
                </p>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={disabled}
          onSelect={onDeleteRequest}
        >
          <Trash2 />
          {actions.delete}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (disabled) event.preventDefault()
    else onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild={true}>{trigger}</SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={styles.sheet}
        aria-describedby={undefined}
        data-clip-actions="mobile"
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
            <p>{formatDuration(clip.duration)}</p>
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
            <Scissors />
            <span>{actions.edit}</span>
            <ChevronRight />
          </Link>
          <Link
            href={`/dashboard/publish/new?clip=${encodeURIComponent(clip.id)}`}
            className={styles.row}
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : undefined}
            onClick={navigate}
          >
            <Send />
            <span>{actions.publish}</span>
            <ChevronRight />
          </Link>
          <button
            type="button"
            className={styles.row}
            disabled={disabled || !downloads.length}
            aria-expanded={panel === 'download'}
            aria-controls={`${panelId}-downloads`}
            onClick={() => onPanelChange('download', panel !== 'download')}
          >
            <Download />
            <span>{actions.download}</span>
            <ChevronDown
              className={panel === 'download' ? styles.expanded : undefined}
            />
          </button>
          {panel === 'download' && (
            <div id={`${panelId}-downloads`} className={styles.mobileSubmenu}>
              {downloads.map((variant) => (
                <a
                  key={variant.id}
                  href={variant.url}
                  download={clipDownloadName(clip.title, variant.name)}
                  className={styles.subrow}
                  data-clip-download={variant.id}
                  onClick={() => onOpenChange(false)}
                >
                  <Download />
                  <DownloadName variant={variant} />
                </a>
              ))}
            </div>
          )}
          <button
            type="button"
            className={styles.row}
            disabled={disabled || !onMove || !moveTargets.length}
            aria-expanded={panel === 'move'}
            aria-controls={`${panelId}-move`}
            onClick={() => onPanelChange('move', panel !== 'move')}
          >
            <Folder />
            <span>{moveLabel}</span>
            <ChevronRight
              className={panel === 'move' ? styles.moveExpanded : undefined}
            />
          </button>
          {panel === 'move' && (
            <div id={`${panelId}-move`} className={styles.mobileSubmenu}>
              {moveTargets.map((target) => (
                <button
                  key={target.value}
                  type="button"
                  className={styles.subrow}
                  disabled={disabled || target.value === currentMoveTarget}
                  data-clip-move-target={target.value}
                  onClick={() => onMoveTarget(target.value)}
                >
                  <Folder />
                  <span>{target.label}</span>
                  {target.value === currentMoveTarget && (
                    <Check className="ml-auto size-4" />
                  )}
                </button>
              ))}
              {moveError && (
                <p role="alert" className={styles.error}>
                  {moveError}
                </p>
              )}
            </div>
          )}
          <button
            type="button"
            className={`${styles.row} ${styles.destructive}`}
            disabled={disabled}
            onClick={onDeleteRequest}
          >
            <Trash2 />
            <span>{actions.delete}</span>
            <ChevronRight />
          </button>
        </div>
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
      className={styles.trigger}
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
