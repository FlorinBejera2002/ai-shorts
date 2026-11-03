'use client'

import { Plus, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { ScriptHashtags } from './script-hashtags'
import { totalSceneSeconds } from './script-options'
import { ScriptSceneEditor } from './script-scene-editor'
import { ScriptStateCard, ScriptStateSkeleton } from './script-state-card'
import type { ScriptsWorkspace } from './use-scripts-workspace'
import shared from './scripts-workspace.module.css'
import styles from './script-document.module.css'

type TextField = 'hook' | 'call_to_action' | 'caption'

export function ScriptDocument({ workspace: w }: { workspace: ScriptsWorkspace }) {
  const t = useTranslations('scriptGenerator')
  const hookRef = useRef<HTMLTextAreaElement>(null)
  const [writing, setWriting] = useState(false)
  // undefined selects the first scene; null means every scene is collapsed.
  const [selected, setSelected] = useState<string | null | undefined>()
  const scenes = w.script.scenes
  const hasDocument =
    writing ||
    scenes.length > 0 ||
    Boolean(
      w.script.hook ||
        w.script.call_to_action ||
        w.script.caption ||
        w.script.hashtags.length
    )
  const expandedId =
    selected === null
      ? null
      : scenes.some((scene) => scene.editor_id === selected)
        ? selected
        : scenes[0]?.editor_id

  function updateField(key: TextField, value: string) {
    w.setScript((current) => ({ ...current, [key]: value }))
  }

  function startWriting() {
    setWriting(true)
    requestAnimationFrame(() => hookRef.current?.focus())
  }

  if (w.generating) {
    return (
      <article className={styles.document} aria-label={t('workspace.scriptDocument')}>
        <ScriptStateCard busy role="status" title={t('generating')}>
          <ScriptStateSkeleton />
        </ScriptStateCard>
      </article>
    )
  }

  if (!hasDocument) {
    return (
      <article
        className={styles.document}
        aria-label={t('workspace.scriptDocument')}
        data-script-document=""
        data-empty="true"
      >
        <ScriptStateCard
          dashed
          tone="neutral"
          title={t('workspace.emptyDocumentTitle')}
          icon={<Sparkles />}
        >
          <div className={styles.stateActions}>
            <button type="button" className={shared.primaryButton} onClick={w.generate}>
              {t('workspace.generateShort')}
            </button>
            <button type="button" className={shared.secondaryButton} onClick={startWriting}>
              {t('workspace.writeManually')}
            </button>
          </div>
        </ScriptStateCard>
      </article>
    )
  }

  return (
    <article
      className={styles.document}
      aria-label={t('workspace.scriptDocument')}
      data-script-document=""
      data-empty="false"
    >
      <section className={`${shared.card} ${styles.hookCard}`}>
        <label htmlFor="script-hook" className={styles.hookLabel}>
          {t('hookLabel')}
        </label>
        <textarea
          ref={hookRef}
          id="script-hook"
          className={styles.hookInput}
          rows={2}
          value={w.script.hook}
          onChange={(event) => updateField('hook', event.target.value)}
        />
      </section>

      <section className={styles.scenes} aria-labelledby="script-scenes-heading">
        <div className={styles.scenesHeader}>
          <h2 id="script-scenes-heading">{t('scenesLabel')}</h2>
          <span className={styles.scenesSummary}>
            {t('workspace.sceneCount', { count: scenes.length })} ·{' '}
            {t('workspace.secondsSpaced', { count: totalSceneSeconds(scenes) })}
          </span>
          <span className={styles.scenesSummaryCompact}>
            {scenes.length} ·{' '}
            {t('workspace.secondsSpaced', { count: totalSceneSeconds(scenes) })}
          </span>
        </div>
        {scenes.map((scene, index) => {
          const sceneId = scene.editor_id ?? String(scene.scene_number)
          const expanded = scene.editor_id === expandedId
          return (
            <ScriptSceneEditor
              key={sceneId}
              scene={scene}
              index={index}
              count={scenes.length}
              expanded={expanded}
              onToggle={() => setSelected(expanded ? null : sceneId)}
              onUpdate={(patch) => w.updateScene(index, patch)}
              onMove={(direction) => {
                // Keep the open scene open while it moves.
                if (expanded) setSelected(sceneId)
                w.moveScene(index, direction)
              }}
              onDelete={() => w.deleteScene(index)}
            />
          )
        })}
        <button
          type="button"
          className={styles.addScene}
          onClick={() => setSelected(w.addScene())}
        >
          <Plus aria-hidden="true" />
          {t('workspace.addScene')}
        </button>
      </section>

      <section className={`${shared.card} ${styles.footer}`}>
        <div className={shared.field}>
          <label htmlFor="script-cta">{t('ctaLabel')}</label>
          <input
            id="script-cta"
            className={shared.control}
            value={w.script.call_to_action}
            onChange={(event) => updateField('call_to_action', event.target.value)}
          />
        </div>
        <div className={shared.field}>
          <label htmlFor="script-caption">{t('captionLabel')}</label>
          <textarea
            id="script-caption"
            className={shared.control}
            rows={2}
            value={w.script.caption}
            onChange={(event) => updateField('caption', event.target.value)}
          />
        </div>
        <ScriptHashtags
          value={w.script.hashtags}
          onChange={(hashtags) => w.setScript((current) => ({ ...current, hashtags }))}
        />
      </section>
    </article>
  )
}
