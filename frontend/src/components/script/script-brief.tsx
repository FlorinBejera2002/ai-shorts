'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { ChevronDown } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { ScriptPlatformSelect } from './script-platform-select'
import type { ScriptsWorkspace } from './use-scripts-workspace'
import styles from './scripts-workspace.module.css'

const DURATIONS = [15, 30, 45, 60, 90, 120, 180]
const LANGUAGES = ['en', 'ro', 'es', 'fr', 'de', 'it', 'pt']

export function ScriptBrief({ workspace: w }: { workspace: ScriptsWorkspace }) {
  const t = useTranslations('scriptGenerator')
  const locale = useLocale()
  const [expanded, setExpanded] = useState(false)
  const hasScenes = w.script.scenes.length > 0
  const languageNames = new Intl.DisplayNames([locale], { type: 'language' })

  return (
    <Card
      className={styles.brief}
      data-script-brief=""
      data-generated={hasScenes}
    >
      <h2 className={styles.briefHeading}>{t('workspace.brief')}</h2>
      <button
        type="button"
        className={styles.briefToggle}
        aria-expanded={!hasScenes || expanded}
        aria-controls="script-brief-fields"
        onClick={() => setExpanded(!expanded)}
      >
        <span>{t('workspace.brief')}</span>
        <ChevronDown
          aria-hidden="true"
          className={expanded ? styles.rotated : ''}
        />
      </button>
      <div
        id="script-brief-fields"
        className={styles.briefFields}
        data-expanded={!hasScenes || expanded}
      >
        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            <Label htmlFor="script-topic">{t('topicLabel')}</Label>
            <span className={styles.counter}>{w.topic.length}/1000</span>
          </div>
          <Textarea
            id="script-topic"
            className={styles.topicInput}
            value={w.topic}
            maxLength={1000}
            rows={3}
            placeholder={t('topicPlaceholder')}
            onChange={(event) => w.setTopic(event.target.value)}
          />
        </div>
        <ScriptPlatformSelect
          value={w.platform}
          onValueChange={w.setPlatform}
          label={t('platformLabel')}
          placeholder={t('platformRequired')}
        />
        <div className={styles.fieldPair}>
          <div className={styles.field}>
            <Label htmlFor="script-duration">{t('durationLabel')}</Label>
            <NativeSelect
              id="script-duration"
              value={w.duration}
              onChange={(event) => w.setDuration(Number(event.target.value))}
            >
              {DURATIONS.map((value) => (
                <option key={value} value={value}>
                  {value}s
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className={styles.field}>
            <Label htmlFor="script-language">{t('languageLabel')}</Label>
            <NativeSelect
              id="script-language"
              value={w.language}
              onChange={(event) => w.setLanguage(event.target.value)}
            >
              {LANGUAGES.map((value) => (
                <option key={value} value={value}>
                  {languageNames.of(value)}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div className={styles.field}>
          <Label htmlFor="script-tone">{t('toneLabel')}</Label>
          <Input
            id="script-tone"
            value={w.tone}
            onChange={(event) => w.setTone(event.target.value)}
          />
        </div>
        <div className={styles.field}>
          <Label htmlFor="script-style">{t('styleLabel')}</Label>
          <Input
            id="script-style"
            value={w.style}
            onChange={(event) => w.setStyle(event.target.value)}
          />
        </div>
        <div className={styles.field}>
          <Label htmlFor="script-audience">{t('audienceLabel')}</Label>
          <Textarea
            id="script-audience"
            className={styles.audienceInput}
            value={w.audience}
            rows={2}
            placeholder={t('audiencePlaceholder')}
            onChange={(event) => w.setAudience(event.target.value)}
          />
        </div>
        <Button
          className={styles.generate}
          onClick={w.generate}
          disabled={w.generating}
        >
          {w.generating && (
            <LoadingIndicator className="size-4" />
          )}
          {t(w.generating ? 'generating' : 'generateButton')}
        </Button>
      </div>
    </Card>
  )
}
