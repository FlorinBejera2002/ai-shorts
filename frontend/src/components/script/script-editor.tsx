'use client'

import { Check, ChevronRight, Video } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { ScriptBrief } from './script-brief'
import { ScriptCoachView } from './script-coach-view'
import { ScriptDocument } from './script-document'
import { ScriptEditorToolbar } from './script-editor-toolbar'
import type { ScriptsWorkspace } from './use-scripts-workspace'
import { useCompactLayout } from './use-compact-layout'
import styles from './script-editor.module.css'

export function ScriptEditor({ workspace: w }: { workspace: ScriptsWorkspace }) {
  const t = useTranslations('scriptGenerator')
  const compact = useCompactLayout()
  const [coachOpen, setCoachOpen] = useState(false)
  const sceneCount = w.script.scenes.length

  function showCoach(open: boolean) {
    setCoachOpen(open)
    requestAnimationFrame(() => window.scrollTo({ top: 0 }))
  }

  return (
    <div className={styles.editor} data-script-editor="" data-coach-open={coachOpen}>
      <div className={styles.editorView} hidden={coachOpen}>
        <h1 className="sr-only">{t('workspace.title')}</h1>
        <ScriptEditorToolbar workspace={w} compact={compact} />
        <div className={styles.body}>
          <input
            id="script-title"
            className={styles.titleInput}
            aria-label={t('workspace.scriptTitle')}
            value={w.script.title}
            onChange={(event) =>
              w.setScript((current) => ({ ...current, title: event.target.value }))
            }
          />
          <div className={styles.aside}>
            <ScriptBrief workspace={w} />
            {sceneCount > 0 && (
              <button
                type="button"
                className={styles.coachCard}
                onClick={() => showCoach(true)}
                aria-controls="script-coach"
                aria-expanded={coachOpen}
                data-script-coach-open=""
              >
                <span className={styles.coachIcon} aria-hidden="true">
                  <Video />
                </span>
                <span className={styles.coachText}>
                  <span>{t('coach.title')}</span>
                  <span className={styles.coachCount}>
                    {t('workspace.sceneCount', { count: sceneCount })}
                  </span>
                </span>
                <ChevronRight className={styles.coachChevron} aria-hidden="true" />
              </button>
            )}
          </div>
          <ScriptDocument workspace={w} />
        </div>
      </div>
      {sceneCount > 0 && (
        <div id="script-coach" className={styles.coachView} hidden={!coachOpen}>
          <ScriptCoachView
            workspace={w}
            active={coachOpen}
            compact={compact}
            onBack={() => showCoach(false)}
          />
        </div>
      )}
      <div className={styles.copiedRegion} role="status" aria-live="polite">
        {w.copied && (
          <span className={styles.copiedPill}>
            <Check aria-hidden="true" />
            {t('workspace.copiedShort')}
          </span>
        )}
      </div>
    </div>
  )
}
