'use client'

import theme from '@/components/calendar/publishing-theme.module.css'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Link } from '@/i18n/navigation'
import type { ClipsLibrary, ClipsQuery, LibraryCollection } from '@/lib/clips-library'
import { EllipsisVertical, Inbox, LayoutGrid, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DropdownMenu as Menu } from 'radix-ui'
import type { ReactNode } from 'react'
import { CloseButton } from '@/components/shared/reference-overlay'
import { ProjectIcon } from './clips-icons'
import overlay from '@/components/shared/reference-ui.module.css'
import styles from './clips.module.css'
import { DROP_ATTRIBUTE } from './use-clip-drag'

export type ProjectCommands = {
  onNew: () => void
  onRename: (project: LibraryCollection) => void
  onDelete: (project: LibraryCollection) => void
}

type NavigationProps = {
  library: ClipsLibrary
  scope: string
  href: (changes: Partial<ClipsQuery>) => string
  /** Set while a clip is being dragged: projects become drop zones. */
  dropTarget: string | null | undefined
  commands: ProjectCommands
}

function dropProps(id: string, dropTarget: string | null | undefined) {
  if (dropTarget === undefined) return {}
  return {
    [DROP_ATTRIBUTE]: id,
    'data-drop-zone': '',
    'data-drop-target': dropTarget === id ? '' : undefined
  }
}

/** Desktop project list: all clips, clips without a project, then every project. */
export function ClipsRail({ library, scope, href, dropTarget, commands }: NavigationProps) {
  const t = useTranslations('clipsLibrary')
  return (
    <aside className={`${styles.card} ${styles.rail}`} aria-label={t('projectsHeading')} data-clips-rail="">
      <RailItem href={href({ project: 'all' })} current={scope === 'all'} icon={<LayoutGrid aria-hidden="true" />} name={t('allClips')} count={library.clips.length} />
      <RailItem href={href({ project: 'none' })} current={scope === 'none'} icon={<Inbox aria-hidden="true" />} name={t('unassigned')} count={library.unassigned} />
      <span className={styles.railHeading}>{t('projectsHeading')}</span>
      {library.collections.map((project) => {
        const current = scope === project.id
        const dropping = dropTarget !== undefined
        return (
          <RailItem
            key={project.id}
            href={href({ project: project.id })}
            current={current}
            icon={<ProjectIcon size={26} />}
            name={dropTarget === project.id ? t('dropHere') : project.name}
            count={project.count}
            drop={dropProps(project.id, dropTarget)}
            more={current && !dropping ? <ProjectMenu project={project} commands={commands} /> : null}
          />
        )
      })}
      <button type="button" className={`${styles.railNew} ${styles.focus}`} onClick={commands.onNew}>
        <Plus aria-hidden="true" />
        {t('newProject')}
      </button>
    </aside>
  )
}

function RailItem({
  href,
  current,
  icon,
  name,
  count,
  drop,
  more
}: {
  href: string
  current: boolean
  icon: ReactNode
  name: string
  count: number
  drop?: Record<string, string | undefined>
  more?: ReactNode
}) {
  return (
    <div className={styles.railItem} data-current={current ? '' : undefined} {...drop}>
      <Link href={href} aria-current={current ? 'page' : undefined} className={`${styles.railLink} ${styles.focus}`} data-clips-scope="">
        {icon}
        <span className={styles.railName}>{name}</span>
        <span className={styles.count}>{count}</span>
      </Link>
      {more}
    </div>
  )
}

/** "⋯" on the selected project: rename or delete it. */
function ProjectMenu({ project, commands }: { project: LibraryCollection; commands: ProjectCommands }) {
  const t = useTranslations('clipsLibrary')
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <button type="button" className={`${styles.iconButton} ${styles.railMore} ${styles.focus}`} aria-label={t('projectOptions', { name: project.name })}>
          <EllipsisVertical aria-hidden="true" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          side="right"
          align="start"
          sideOffset={12}
          className={`${theme.surface} ${styles.tokens} ${overlay.menu}`}
          data-reference-surface=""
        >
          <Menu.Item className={overlay.item} onSelect={() => commands.onRename(project)}>
            <Pencil aria-hidden="true" />
            <span>{t('rename')}</span>
          </Menu.Item>
          <Menu.Separator className={overlay.separator} />
          <Menu.Item className={overlay.item} data-danger="" onSelect={() => commands.onDelete(project)}>
            <Trash2 aria-hidden="true" />
            <span>{t('deleteProject')}</span>
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

/** Phone project switcher: horizontally scrolling chips. */
export function ClipsChips({ library, scope, href, dropTarget, commands }: NavigationProps) {
  const t = useTranslations('clipsLibrary')
  return (
    <nav className={styles.chips} aria-label={t('projectsHeading')} data-clips-chips="">
      <Chip href={href({ project: 'all' })} current={scope === 'all'} icon={<span className={styles.chipIcon}><LayoutGrid aria-hidden="true" /></span>} name={t('allShort')} count={library.clips.length} />
      <Chip href={href({ project: 'none' })} current={scope === 'none'} icon={<span className={styles.chipIcon}><Inbox aria-hidden="true" /></span>} name={t('unassigned')} count={library.unassigned} />
      {library.collections.map((project) => (
        <Chip
          key={project.id}
          href={href({ project: project.id })}
          current={scope === project.id}
          icon={<ProjectIcon size={26} />}
          name={dropTarget === project.id ? t('dropHere') : project.name}
          count={project.count}
          drop={dropProps(project.id, dropTarget)}
        />
      ))}
      <button type="button" className={`${styles.chipNew} ${styles.focus}`} aria-label={t('newProject')} onClick={commands.onNew}>
        <Plus aria-hidden="true" />
      </button>
    </nav>
  )
}

function Chip({
  href,
  current,
  icon,
  name,
  count,
  drop
}: {
  href: string
  current: boolean
  icon: ReactNode
  name: string
  count: number
  drop?: Record<string, string | undefined>
}) {
  return (
    <Link href={href} aria-current={current ? 'page' : undefined} className={`${styles.chip} ${styles.focus}`} data-clips-scope="" {...drop}>
      {icon}
      {name}
      <span className={styles.chipCount}>{count}</span>
    </Link>
  )
}

/** Title block above a project's clips; on phones it carries the project menu. */
export function ClipsProjectHead({
  project,
  mobile,
  onMenu
}: {
  project: LibraryCollection
  mobile: boolean
  onMenu: () => void
}) {
  const t = useTranslations('clipsLibrary')
  return (
    <div className={styles.projectHead} data-clips-project-head="">
      <ProjectIcon size={mobile ? 40 : 44} />
      <span className={styles.projectHeadCopy}>
        <b className={styles.heading}>{project.name}</b>
        <span className={styles.muted}>{t('clipCount', { count: project.count })}</span>
      </span>
      {mobile && (
        <button
          type="button"
          className={`${styles.iconButton} ${styles.projectHeadMore} ${styles.focus}`}
          aria-label={t('projectOptions', { name: project.name })}
          aria-haspopup="menu"
          onClick={onMenu}
        >
          <EllipsisVertical aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/** Phone project menu sheet. */
export function ProjectActionsSheet({
  project,
  commands,
  onClose
}: {
  project: LibraryCollection | null
  commands: ProjectCommands
  onClose: () => void
}) {
  const t = useTranslations('clipsLibrary')
  function run(action: (project: LibraryCollection) => void) {
    if (!project) return
    onClose()
    action(project)
  }
  return (
    <Sheet open={project !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        aria-describedby={undefined}
        className={`${theme.surface} ${styles.tokens} ${overlay.sheet}`}
        overlayClassName={theme.overlay}
        data-reference-surface=""
      >
        <span className={overlay.grab} aria-hidden="true" />
        <div className={overlay.sheetHead}>
          <ProjectIcon size={36} />
          <SheetTitle>{project?.name}</SheetTitle>
          <CloseButton onClick={onClose} />
        </div>
        <div className={overlay.sheetList} role="menu" aria-label={project ? t('projectOptions', { name: project.name }) : undefined}>
          <button type="button" role="menuitem" className={overlay.item} onClick={() => run(commands.onRename)}>
            <Pencil aria-hidden="true" />
            <span>{t('rename')}</span>
          </button>
          <span className={overlay.separator} />
          <button type="button" role="menuitem" className={overlay.item} data-danger="" onClick={() => run(commands.onDelete)}>
            <Trash2 aria-hidden="true" />
            <span>{t('deleteProject')}</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
