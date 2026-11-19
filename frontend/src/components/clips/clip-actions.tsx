'use client'

import theme from '@/components/calendar/publishing-theme.module.css'
import { DropdownMenu as Menu } from 'radix-ui'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Link } from '@/i18n/navigation'
import type { LibraryClip, LibraryCollection } from '@/lib/clips-library'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  EllipsisVertical,
  FolderInput,
  Plus,
  Send,
  SquareArrowOutUpRight,
  Star,
  Trash2
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { CloseButton, SheetMenu } from '@/components/shared/reference-overlay'
import { clipDownloadName } from './clip-download-utils'
import { NoProjectIcon, ProjectIcon } from './clips-icons'
import overlay from '@/components/shared/reference-ui.module.css'
import styles from './clips.module.css'

export type ClipCommands = {
  projects: LibraryCollection[]
  onMove: (clip: LibraryClip, projectId: string | null) => void
  onFavorite: (clip: LibraryClip) => void
  onNewProject: (clip: LibraryClip) => void
  onDelete: (clip: LibraryClip) => void
}

const NONE = 'none'
const surface = `${theme.surface} ${styles.tokens}`

function clipLinks(clip: LibraryClip) {
  return {
    open: `/dashboard/clips/${encodeURIComponent(clip.id)}`,
    publish: `/dashboard/publish/new?clip=${encodeURIComponent(clip.id)}`
  }
}

/** Desktop "⋮" menu: open, favourite, publish, download, move to project (submenu) and delete. */
export function ClipActionsMenu({ clip, commands }: { clip: LibraryClip; commands: ClipCommands }) {
  const t = useTranslations('clipsLibrary')
  const links = clipLinks(clip)
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <button type="button" className={`${styles.iconButton} ${styles.focus}`} aria-label={t('actions', { title: clip.title })}>
          <EllipsisVertical aria-hidden="true" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
      <Menu.Content
        side="right"
        align="start"
        sideOffset={8}
        className={`${surface} ${overlay.menu}`}
        data-reference-surface=""
      >
        <Menu.Item asChild className={overlay.item}>
          <Link href={links.open}>
            <SquareArrowOutUpRight aria-hidden="true" />
            <span>{t('openAction')}</span>
          </Link>
        </Menu.Item>
        <Menu.Item className={overlay.item} onSelect={() => commands.onFavorite(clip)}>
          <Star aria-hidden="true" />
          <span>{clip.favorite ? t('removeFavorite') : t('addFavorite')}</span>
        </Menu.Item>
        <Menu.Item asChild className={overlay.item}>
          <Link href={links.publish}>
            <Send aria-hidden="true" />
            <span>{t('publish')}</span>
          </Link>
        </Menu.Item>
        <DownloadItem clip={clip} />
        <Menu.Sub>
          <Menu.SubTrigger className={overlay.item}>
            <FolderInput aria-hidden="true" />
            <span>{t('moveToProject')}</span>
            <i className={overlay.trail}>
              <ChevronRight aria-hidden="true" />
            </i>
          </Menu.SubTrigger>
          <Menu.Portal>
          <Menu.SubContent
            sideOffset={10}
            className={`${surface} ${overlay.menu}`}
            data-reference-surface=""
          >
            <Menu.RadioGroup
              value={clip.collectionId ?? NONE}
              onValueChange={(value) => commands.onMove(clip, value === NONE ? null : value)}
            >
              {[{ id: NONE, name: t('unassigned') }, ...commands.projects].map((project) => (
                <Menu.RadioItem key={project.id} value={project.id} className={overlay.item}>
                  {project.id === NONE ? <NoProjectIcon /> : <ProjectIcon size={20} />}
                  <span>{project.name}</span>
                  {(clip.collectionId ?? NONE) === project.id && <Check className={overlay.check} strokeWidth={2.5} aria-hidden="true" />}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
            <Menu.Separator className={overlay.separator} />
            <Menu.Item className={overlay.item} onSelect={() => commands.onNewProject(clip)}>
              <Plus aria-hidden="true" />
              <span>{t('newProject')}</span>
            </Menu.Item>
          </Menu.SubContent>
          </Menu.Portal>
        </Menu.Sub>
        <Menu.Separator className={overlay.separator} />
        <Menu.Item className={overlay.item} data-danger="" onSelect={() => commands.onDelete(clip)}>
          <Trash2 aria-hidden="true" />
          <span>{t('delete')}</span>
        </Menu.Item>
      </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

function DownloadItem({ clip }: { clip: LibraryClip }) {
  const t = useTranslations('clipsLibrary')
  if (!clip.fileUrl)
    return (
      <Menu.Item disabled className={overlay.item}>
        <Download aria-hidden="true" />
        <span>{t('download')}</span>
      </Menu.Item>
    )
  return (
    <Menu.Item asChild className={overlay.item}>
      <a href={clip.fileUrl} download={clipDownloadName(clip.title)} data-clip-download="">
        <Download aria-hidden="true" />
        <span>{t('download')}</span>
      </a>
    </Menu.Item>
  )
}

/** Phone version of the clip menu: a bottom sheet with a "Mută în proiect" second step. */
export function ClipActionsSheet({
  clip,
  commands,
  onClose
}: {
  clip: LibraryClip | null
  commands: ClipCommands
  onClose: () => void
}) {
  const t = useTranslations('clipsLibrary')
  const [step, setStep] = useState<'main' | 'move'>('main')
  const links = clip ? clipLinks(clip) : null
  function close() {
    onClose()
    setStep('main')
  }
  function run(action: () => void) {
    close()
    action()
  }
  return (
    <Sheet open={clip !== null} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        aria-describedby={undefined}
        className={`${surface} ${overlay.sheet}`}
        overlayClassName={theme.overlay}
        data-reference-surface=""
      >
        <span className={overlay.grab} aria-hidden="true" />
        {clip && links && step === 'main' && (
          <>
            <div className={overlay.sheetHead}>
              <span className={overlay.sheetThumb}>{clip.thumbnailUrl && <img src={clip.thumbnailUrl} alt="" />}</span>
              <SheetTitle asChild>
                <b>{clip.title}</b>
              </SheetTitle>
              <CloseButton onClick={close} />
            </div>
            <SheetMenu className={overlay.sheetList} label={t('clipActions')}>
              <Link role="menuitem" href={links.open} className={overlay.item} onClick={close}>
                <SquareArrowOutUpRight aria-hidden="true" />
                <span>{t('openAction')}</span>
              </Link>
              <button type="button" role="menuitem" className={overlay.item} onClick={() => run(() => commands.onFavorite(clip))}>
                <Star aria-hidden="true" />
                <span>{clip.favorite ? t('removeFavorite') : t('addFavorite')}</span>
              </button>
              <Link role="menuitem" href={links.publish} className={overlay.item} onClick={close}>
                <Send aria-hidden="true" />
                <span>{t('publish')}</span>
              </Link>
              {clip.fileUrl ? (
                <a role="menuitem" href={clip.fileUrl} download={clipDownloadName(clip.title)} className={overlay.item} onClick={close} data-clip-download="">
                  <Download aria-hidden="true" />
                  <span>{t('download')}</span>
                </a>
              ) : (
                <button type="button" role="menuitem" disabled className={overlay.item} data-disabled="">
                  <Download aria-hidden="true" />
                  <span>{t('download')}</span>
                </button>
              )}
              <button type="button" role="menuitem" aria-haspopup="menu" className={overlay.item} onClick={() => setStep('move')}>
                <FolderInput aria-hidden="true" />
                <span>{t('moveToProject')}</span>
                <i className={overlay.trail}>
                  <ChevronRight aria-hidden="true" />
                </i>
              </button>
              <span className={overlay.separator} />
              <button type="button" role="menuitem" className={overlay.item} data-danger="" onClick={() => run(() => commands.onDelete(clip))}>
                <Trash2 aria-hidden="true" />
                <span>{t('delete')}</span>
              </button>
            </SheetMenu>
          </>
        )}
        {clip && step === 'move' && (
          <>
            <div className={overlay.sheetHead} data-back="">
              <button type="button" className={`${styles.button} ${styles.secondary} ${overlay.backButton}`} onClick={() => setStep('main')}>
                <ChevronLeft aria-hidden="true" />
                {t('back')}
              </button>
              <SheetTitle>{t('moveToProject')}</SheetTitle>
              <CloseButton onClick={close} />
            </div>
            <SheetMenu className={overlay.sheetList} label={t('moveToProject')}>
              {[{ id: NONE, name: t('unassigned') }, ...commands.projects].map((project) => {
                const checked = (clip.collectionId ?? NONE) === project.id
                return (
                  <button
                    key={project.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={checked}
                    className={overlay.item}
                    onClick={() => run(() => commands.onMove(clip, project.id === NONE ? null : project.id))}
                  >
                    {project.id === NONE ? <NoProjectIcon /> : <ProjectIcon size={20} />}
                    <span>{project.name}</span>
                    {checked && <Check className={overlay.check} strokeWidth={2.5} aria-hidden="true" />}
                  </button>
                )
              })}
              <span className={overlay.separator} />
              <button type="button" role="menuitem" className={overlay.item} onClick={() => run(() => commands.onNewProject(clip))}>
                <Plus aria-hidden="true" />
                <span>{t('newProject')}</span>
              </button>
            </SheetMenu>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
