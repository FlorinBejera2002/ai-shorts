'use client'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Archive,
  ChevronLeft,
  Clock,
  Copy,
  Download,
  FileJson,
  MoreHorizontal,
  X
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Popover } from 'radix-ui'
import { useState } from 'react'
import { ScriptSaveStatus } from './script-save-status'
import { ScriptSheet } from './script-sheet'
import { ScriptStatusSelect } from './script-status-select'
import { scriptSurfaceClass, scriptSurfaceProps } from './script-theme'
import { ScriptVersionList } from './script-version-history'
import type { ScriptsWorkspace } from './use-scripts-workspace'
import shared from './scripts-workspace.module.css'
import styles from './script-editor.module.css'

/** Pill header bar: back, status, save state, versions and script actions. */
export function ScriptEditorToolbar({
  workspace: w,
  compact
}: {
  workspace: ScriptsWorkspace
  compact: boolean
}) {
  const t = useTranslations('scriptGenerator')
  const [actionsOpen, setActionsOpen] = useState(false)
  const archived = w.status === 'archived'
  const versionList = (
    <ScriptVersionList
      versions={w.versions}
      revision={w.revision}
      onRestore={w.restoreVersion}
    />
  )

  function runAction(action: () => void) {
    setActionsOpen(false)
    action()
  }

  return (
    <header className={styles.toolbar} data-script-toolbar="">
      <button
        type="button"
        className={styles.backButton}
        onClick={w.backToLibrary}
      >
        <ChevronLeft aria-hidden="true" />
        <span className={styles.backLabel}>{t('workspace.title')}</span>
      </button>
      <ScriptStatusSelect value={w.status} onValueChange={w.setStatus} />
      <ScriptSaveStatus
        state={w.saveState}
        revision={w.revision}
        compact={compact}
        onRetry={w.retrySave}
      />
      <span className={styles.toolbarSpacer} />

      {compact ? (
        <>
          <button
            type="button"
            className={`${shared.iconButton} ${styles.toolbarIcon}`}
            aria-label={t('workspace.moreActions')}
            aria-haspopup="dialog"
            onClick={() => setActionsOpen(true)}
          >
            <MoreHorizontal aria-hidden="true" />
          </button>
          <ScriptSheet
            open={actionsOpen}
            onOpenChange={setActionsOpen}
            title={t('workspace.scriptActions')}
          >
            <button
              type="button"
              className={shared.sheetItem}
              onClick={() => runAction(() => void w.openVersions(true))}
            >
              <Clock aria-hidden="true" />
              {t('workspace.versions')}
            </button>
            <button
              type="button"
              className={shared.sheetItem}
              onClick={() => runAction(() => void w.copyScript())}
            >
              <Copy aria-hidden="true" />
              {t('copyAll')}
            </button>
            <button
              type="button"
              className={shared.sheetItem}
              onClick={() => runAction(w.downloadScript)}
            >
              <Download aria-hidden="true" />
              {t('download')}
            </button>
            <button
              type="button"
              className={shared.sheetItem}
              onClick={() => runAction(w.downloadJson)}
            >
              <FileJson aria-hidden="true" />
              {t('workspace.downloadJson')}
            </button>
            <button
              type="button"
              className={`${shared.sheetItem} ${shared.sheetDanger}`}
              disabled={archived}
              onClick={() => runAction(() => void w.archiveScript())}
            >
              <Archive aria-hidden="true" />
              {t('workspace.archive')}
            </button>
          </ScriptSheet>
          <ScriptSheet
            open={w.showVersions}
            onOpenChange={(open) => void w.openVersions(open)}
            title={t('workspace.versions')}
            showTitle
            className={styles.versionsSheet}
          >
            {versionList}
          </ScriptSheet>
        </>
      ) : (
        <>
          <Popover.Root
            open={w.showVersions}
            onOpenChange={(open) => void w.openVersions(open)}
          >
            <Popover.Trigger asChild>
              <button type="button" className={styles.toolbarButton}>
                <Clock aria-hidden="true" />
                {t('workspace.versions')}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="end"
                sideOffset={10}
                collisionPadding={16}
                className={`${scriptSurfaceClass} ${styles.versionsPanel}`}
                aria-label={t('workspace.versionHistory')}
                {...scriptSurfaceProps}
              >
                <div className={styles.versionsHeader}>
                  <h2>{t('workspace.versions')}</h2>
                  <Popover.Close
                    className={`${shared.iconButton} ${styles.closeButton}`}
                    aria-label={t('workspace.close')}
                  >
                    <X aria-hidden="true" />
                  </Popover.Close>
                </div>
                {versionList}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <button
            type="button"
            className={`${shared.iconButton} ${styles.toolbarIcon}`}
            aria-label={t('copyAll')}
            title={t('copyAll')}
            onClick={() => void w.copyScript()}
          >
            <Copy aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${shared.iconButton} ${styles.toolbarIcon}`}
            aria-label={t('download')}
            title={t('download')}
            onClick={w.downloadScript}
          >
            <Download aria-hidden="true" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={`${shared.iconButton} ${styles.toolbarIcon}`}
                aria-label={t('workspace.moreActions')}
              >
                <MoreHorizontal aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className={`${scriptSurfaceClass} ${shared.menu}`}
              {...scriptSurfaceProps}
            >
              <DropdownMenuItem
                className={shared.menuItem}
                onSelect={w.downloadJson}
              >
                {t('workspace.downloadJson')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className={`${shared.menuItem} ${shared.menuDanger}`}
                disabled={archived}
                onSelect={() => void w.archiveScript()}
              >
                {t('workspace.archive')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </header>
  )
}
