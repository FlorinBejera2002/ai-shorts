'use client'

import { ChevronLeft } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { ScriptPlatformBadge } from './script-badges'
import { ShootingCoach, type ShootingCoachLabels } from './shooting-coach'
import type { ScriptsWorkspace } from './use-scripts-workspace'
import styles from './script-editor.module.css'

/** Focused shooting-coach page: back to the editor, title and coach. */
export function ScriptCoachView({
  workspace: w,
  active,
  compact,
  onBack
}: {
  workspace: ScriptsWorkspace
  active: boolean
  compact: boolean
  onBack: () => void
}) {
  const t = useTranslations('scriptGenerator')
  const locale = useLocale()
  const labels = useMemo<ShootingCoachLabels>(
    () => ({
      title: t('coach.title'),
      stage: t('coach.stage'),
      details: t('coach.details'),
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
      seconds: t.raw('workspace.secondsSpaced') as string,
      visualizationLabel: t('coach.visualizationLabel'),
      focalLength: t('coach.focalLength'),
      cameraReadout: t.raw('coach.cameraReadout') as string,
      fovReadout: t.raw('coach.fovReadout') as string
    }),
    [t]
  )
  const language = new Intl.DisplayNames([locale], { type: 'language' }).of(w.language)

  return (
    <>
      <header className={styles.coachHeader}>
        <button type="button" className={styles.coachBack} onClick={onBack}>
          <ChevronLeft aria-hidden="true" />
          <span className={styles.coachBackLabel}>{t('workspace.editScript')}</span>
        </button>
        <div className={styles.coachHeading}>
          <h1>{w.script.title}</h1>
          {!compact && (
            <p>
              <ScriptPlatformBadge
                platform={w.platform}
                className={styles.coachPlatform}
                fallbackLabel={t('platformRequired')}
              />
              {t('workspace.secondsSpaced', { count: w.duration })} · {language}
            </p>
          )}
        </div>
      </header>
      <ShootingCoach
        scenes={w.script.scenes}
        labels={labels}
        active={active}
        speechLanguage={w.language}
      />
    </>
  )
}
