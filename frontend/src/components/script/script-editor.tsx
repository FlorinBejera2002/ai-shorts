'use client'

import { ArrowLeft, ChevronDown, Video } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import {
  isPublishingProvider,
  PUBLISHING_PROVIDER_CATALOG
} from '@/lib/publishing'
import { useRef, useState } from 'react'
import { ShootingCoach, type ShootingCoachLabels } from './shooting-coach'
import { ScriptBrief } from './script-brief'
import { ScriptDocument } from './script-document'
import { ScriptEditorToolbar } from './script-editor-toolbar'
import { ScriptVersionHistory } from './script-version-history'
import type { ScriptsWorkspace } from './use-scripts-workspace'
import styles from './scripts-workspace.module.css'

export function ScriptEditor({
  workspace: w
}: {
  workspace: ScriptsWorkspace
}) {
  const t = useTranslations('scriptGenerator')
  const locale = useLocale()
  const [coachOpen, setCoachOpen] = useState(false)
  const coachRef = useRef<HTMLDivElement>(null)
  const coachLabels: ShootingCoachLabels = {
    title: t('coach.title'),
    preview: t.raw('coach.preview') as string,
    sceneCounter: t.raw('coach.sceneCounter') as string,
    viewControls: t('coach.viewControls'),
    viewDirector: t('coach.viewDirector'),
    viewCamera: t('coach.viewCamera'),
    viewTop: t('coach.viewTop'),
    emptyTitle: t('coach.emptyTitle'),
    emptyDescription: t('coach.emptyDescription'),
    cameraPosition: t('coach.cameraPosition'),
    movement: t('coach.movement'),
    lighting: t('coach.lighting'),
    performance: t('coach.performance'),
    creatorAction: t('coach.creatorAction'),
    dialogue: t('coach.dialogue'),
    noDialogue: t('coach.noDialogue'),
    restart: t('coach.restart'),
    play: t('coach.play'),
    pause: t('coach.pause'),
    mute: t('coach.mute'),
    unmute: t('coach.unmute'),
    timeline: t('coach.timeline'),
    timelineScene: t.raw('coach.timelineScene') as string,
    visualizationLabel: t('coach.visualizationLabel'),
    focalLength: t('coach.focalLength'),
    cameraReadout: t.raw('coach.cameraReadout') as string,
    fovReadout: t.raw('coach.fovReadout') as string
  }
  function openCoach() {
    setCoachOpen(true)
    requestAnimationFrame(() =>
      coachRef.current?.scrollIntoView({ block: 'nearest' })
    )
  }
  const hasScenes = w.script.scenes.length > 0

  return (
    <div data-script-editor="" data-coach-open={coachOpen} className={styles.editor}>
      <h1 className={styles.title} hidden={coachOpen}>{t('workspace.title')}</h1>
      <ScriptEditorToolbar workspace={w} />
      {w.showVersions && <ScriptVersionHistory workspace={w} />}
      {coachOpen && (
        <div className={styles.coachDocumentHeading}>
          <button type="button" onClick={() => setCoachOpen(false)}>
            <ArrowLeft />
            {t('workspace.editScript')}
          </button>
          <h1>{w.script.title}</h1>
          <p className={styles.scriptMetadata}>
            {isPublishingProvider(w.platform) && (
              <PlatformBrandIcon provider={w.platform} className="size-6" />
            )}
            <span>
              {
                PUBLISHING_PROVIDER_CATALOG.find(({ id }) => id === w.platform)
                  ?.name
              }
            </span>
            <span>·</span>
            <span>{w.duration}s</span>
            <span>·</span>
            <span>
              {new Intl.DisplayNames([locale], { type: 'language' }).of(
                w.language
              )}
            </span>
          </p>
          <p>{w.script.hook}</p>
        </div>
      )}
      <div
        className={styles.editorGrid}
        data-generated={hasScenes}
        hidden={coachOpen}
      >
        <aside className={styles.briefColumn}>
          <ScriptBrief workspace={w} />
          {hasScenes && (
            <button
              type="button"
              className={styles.coachShortcut}
              onClick={openCoach}
              aria-expanded={coachOpen}
              aria-controls="script-coach"
            >
              <Video aria-hidden="true" />
              <span>
                {t('workspace.shootingCoach')}
                <small>
                  {w.script.scenes.length} {t('scenes')}
                </small>
              </span>
              <ChevronDown aria-hidden="true" />
            </button>
          )}
        </aside>
        <ScriptDocument workspace={w} onOpenCoach={openCoach} />
      </div>
      {hasScenes && (
        <div
          id="script-coach"
          ref={coachRef}
          className={styles.coachSection}
          hidden={!coachOpen}
        >
          <ShootingCoach
            scenes={w.script.scenes}
            labels={coachLabels}
            active={coachOpen}
            speechLanguage={w.language}
          />
        </div>
      )}
    </div>
  )
}
