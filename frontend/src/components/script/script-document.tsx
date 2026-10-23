'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Clock, Plus, Video } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { ScriptSceneEditor } from './script-scene-editor'
import type { ScriptsWorkspace } from './use-scripts-workspace'
import styles from './scripts-workspace.module.css'

export function ScriptDocument({
  workspace: w,
  onOpenCoach
}: {
  workspace: ScriptsWorkspace
  onOpenCoach: () => void
}) {
  const t = useTranslations('scriptGenerator')
  const hasScenes = w.script.scenes.length > 0
  const hasDocument =
    hasScenes ||
    Boolean(
      w.script.hook ||
      w.script.call_to_action ||
      w.script.caption ||
      w.script.hashtags.length
    )
  function updateField(
    key: 'title' | 'hook' | 'call_to_action' | 'caption',
    value: string
  ) {
    w.setScript((current) => ({ ...current, [key]: value }))
  }

  return (
    <Card
      className={styles.document}
      data-script-document=""
      data-empty={!hasDocument}
    >
      <div className={styles.field}>
        <Label className={hasScenes ? '' : 'sr-only'} htmlFor="script-title">
          {t('workspace.scriptTitle')}
        </Label>
        <Input
          id="script-title"
          value={w.script.title}
          onChange={(event) => updateField('title', event.target.value)}
          className={!hasScenes ? styles.emptyTitle : ''}
        />
      </div>
      <div className={styles.field}>
        <Label htmlFor="script-hook">{t('hookLabel')}</Label>
        <Textarea
          id="script-hook"
          className={styles.hookInput}
          value={w.script.hook}
          rows={hasScenes ? 2 : 5}
          placeholder={t(w.generating ? 'generatingTitle' : 'emptyTitle')}
          onChange={(event) => updateField('hook', event.target.value)}
        />
      </div>
      {hasDocument ? (
        <>
          <div className={styles.scenes}>
            {w.script.scenes.map((scene, index) => (
              <ScriptSceneEditor
                key={scene.editor_id ?? scene.scene_number}
                scene={scene}
                index={index}
                count={w.script.scenes.length}
                onUpdate={(patch) => w.updateScene(index, patch)}
                onMove={(direction) => w.moveScene(index, direction)}
                onDelete={() => w.deleteScene(index)}
              />
            ))}
          </div>
          <Button
            variant="outline"
            className={styles.addScene}
            onClick={w.addScene}
          >
            <Plus />
            {t('workspace.addScene')}
          </Button>
          <div className={styles.documentFooter}>
            <div className={styles.sceneField}>
              <Label htmlFor="script-cta">{t('ctaLabel')}</Label>
              <Textarea
                id="script-cta"
                rows={1}
                value={w.script.call_to_action}
                onChange={(event) =>
                  updateField('call_to_action', event.target.value)
                }
              />
            </div>
            <div className={styles.sceneField}>
              <Label htmlFor="script-caption">{t('captionLabel')}</Label>
              <Textarea
                id="script-caption"
                rows={2}
                value={w.script.caption}
                onChange={(event) => updateField('caption', event.target.value)}
              />
            </div>
            <div className={styles.sceneField}>
              <Label htmlFor="script-hashtags">{t('hashtagsLabel')}</Label>
              <Input
                id="script-hashtags"
                value={w.script.hashtags.join(', ')}
                onChange={(event) =>
                  w.setScript((current) => ({
                    ...current,
                    hashtags: event.target.value
                      .split(',')
                      .map((value) => value.trim().replace(/^#/, ''))
                      .filter(Boolean)
                  }))
                }
              />
            </div>
          </div>
          <p className={styles.documentMeta}>
            <Clock aria-hidden="true" />
            {w.script.scenes.reduce(
              (total, scene) => total + scene.duration_seconds,
              0
            )}
            s · {w.script.scenes.length} {t('scenes')}
          </p>
        </>
      ) : (
        <div className={styles.emptyCoach}>
          <p>
            <Video aria-hidden="true" />
            {t('workspace.shootingCoach')}
          </p>
          <span>{t('coach.emptyTitle')}</span>
          <Button
            variant="outline"
            size="sm"
            className={styles.addScene}
            onClick={w.addScene}
          >
            <Plus />
            {t('workspace.addScene')}
          </Button>
        </div>
      )}
      {hasScenes && (
        <button
          type="button"
          className={styles.mobileCoachShortcut}
          onClick={onOpenCoach}
        >
          <Video />
          {t('workspace.shootingCoach')}
        </button>
      )}
    </Card>
  )
}
