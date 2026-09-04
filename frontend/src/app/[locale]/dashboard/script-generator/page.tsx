'use client'

import {
  type CoachScene,
  ShootingCoach,
  type ShootingCoachLabels
} from '@/components/script/shooting-coach'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/toast'
import {
  ArrowRight,
  Camera,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Clock,
  Copy,
  Download,
  Eye,
  FileText,
  Hash,
  Lightbulb,
  Megaphone,
  MessageSquare,
  Music,
  RotateCcw,
  Sparkles,
  Target,
  Type,
  Video,
  Wrench
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

type ScriptScene = CoachScene

type GeneratedScript = {
  title: string
  hook: string
  scenes: ScriptScene[]
  call_to_action: string
  caption: string
  hashtags: string[]
  total_duration_seconds: number
  equipment_suggestions: string[]
  filming_tips: string[]
}

const PLATFORMS = [
  { value: 'tiktok', label: 'TikTok', icon: '🎵' },
  { value: 'instagram', label: 'Instagram Reels', icon: '📸' },
  { value: 'youtube', label: 'YouTube Shorts', icon: '▶️' },
  { value: 'linkedin', label: 'LinkedIn', icon: '💼' }
]

const TONES = [
  { value: 'entertaining', key: 'toneEntertaining' },
  { value: 'educational', key: 'toneEducational' },
  { value: 'inspirational', key: 'toneInspirational' },
  { value: 'sales', key: 'toneSales' },
  { value: 'storytelling', key: 'toneStorytelling' },
  { value: 'humorous', key: 'toneHumorous' }
]

const STYLES = [
  { value: 'talking_head', key: 'styleTalkingHead' },
  { value: 'b_roll', key: 'styleBRoll' },
  { value: 'tutorial', key: 'styleTutorial' },
  { value: 'storytelling', key: 'styleStorytelling' },
  { value: 'vlog', key: 'styleVlog' },
  { value: 'product_demo', key: 'styleProductDemo' }
]

const DURATIONS = [15, 30, 45, 60, 90, 120, 180]

export default function ScriptGeneratorPage() {
  const t = useTranslations('scriptGenerator')
  const toast = useToast()
  const coachLabels = useMemo<ShootingCoachLabels>(
    () => ({
      title: t('coach.title'),
      preview: t.raw('coach.preview') as string,
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
    }),
    [t]
  )

  const [topic, setTopic] = useState('')
  const [platform, setPlatform] = useState('tiktok')
  const [duration, setDuration] = useState(30)
  const [tone, setTone] = useState('entertaining')
  const [style, setStyle] = useState('talking_head')
  const [targetAudience, setTargetAudience] = useState('')
  const [language, setLanguage] = useState('en')

  const [busy, setBusy] = useState(false)
  const [script, setScript] = useState<GeneratedScript | null>(null)
  const [expandedScenes, setExpandedScenes] = useState<Set<number>>(new Set())

  async function handleGenerate() {
    if (!topic.trim()) {
      toast.add('error', t('topicRequired'))
      return
    }

    setBusy(true)
    setScript(null)
    try {
      const res = await fetch('/api/scripts/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          platform,
          duration,
          tone,
          target_audience: targetAudience.trim(),
          language,
          style
        })
      })
      const data = await res.json()
      if (!res.ok) {
        const msg =
          typeof data.detail === 'string'
            ? data.detail
            : Array.isArray(data.detail)
              ? data.detail
                  .map((e: { msg?: string }) => e.msg)
                  .filter(Boolean)
                  .join('; ')
              : data.error
        toast.add('error', msg || t('generateFailed'))
        return
      }
      setScript(data.script)
      setExpandedScenes(
        new Set(data.script.scenes.map((_: ScriptScene, i: number) => i))
      )
      toast.add('success', t('generateSuccess'))
    } catch {
      toast.add('error', t('generateFailed'))
    } finally {
      setBusy(false)
    }
  }

  function toggleScene(index: number) {
    setExpandedScenes((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function expandAll() {
    if (!script) return
    setExpandedScenes(new Set(script.scenes.map((_, i) => i)))
  }

  function collapseAll() {
    setExpandedScenes(new Set())
  }

  function copyFullScript() {
    if (!script) return
    const lines: string[] = []
    lines.push(`# ${script.title}`)
    lines.push('')
    lines.push(`**Hook:** ${script.hook}`)
    lines.push('')
    for (const scene of script.scenes) {
      lines.push(`## Scene ${scene.scene_number} (${scene.duration_seconds}s)`)
      lines.push(`**Visual:** ${scene.visual_description}`)
      lines.push(`**Camera:** ${scene.camera_angle} — ${scene.camera_movement}`)
      if (scene.dialogue) lines.push(`**Dialogue:** "${scene.dialogue}"`)
      if (scene.text_overlay)
        lines.push(`**Text Overlay:** ${scene.text_overlay}`)
      if (scene.music_mood) lines.push(`**Music:** ${scene.music_mood}`)
      lines.push(`**Transition:** ${scene.transition}`)
      lines.push('')
    }
    lines.push(`**CTA:** ${script.call_to_action}`)
    lines.push('')
    lines.push(`**Caption:** ${script.caption}`)
    lines.push(`**Hashtags:** ${script.hashtags.map((h) => `#${h}`).join(' ')}`)
    lines.push('')
    lines.push(`**Equipment:** ${script.equipment_suggestions.join(', ')}`)
    lines.push('')
    lines.push(`**Tips:**`)
    for (const tip of script.filming_tips) lines.push(`- ${tip}`)

    navigator.clipboard.writeText(lines.join('\n'))
    toast.add('success', t('copied'))
  }

  function downloadScript() {
    if (!script) return
    const lines: string[] = []
    lines.push(script.title)
    lines.push('='.repeat(script.title.length))
    lines.push('')
    lines.push(`Hook: ${script.hook}`)
    lines.push(`Total Duration: ${script.total_duration_seconds}s`)
    lines.push(
      `Platform: ${PLATFORMS.find((p) => p.value === platform)?.label}`
    )
    lines.push('')
    lines.push('---SCENES---')
    lines.push('')
    for (const scene of script.scenes) {
      lines.push(`SCENE ${scene.scene_number} [${scene.duration_seconds}s]`)
      lines.push(`  Visual: ${scene.visual_description}`)
      lines.push(`  Camera Angle: ${scene.camera_angle}`)
      lines.push(`  Camera Movement: ${scene.camera_movement}`)
      if (scene.dialogue) lines.push(`  Dialogue: "${scene.dialogue}"`)
      if (scene.text_overlay)
        lines.push(`  Text Overlay: ${scene.text_overlay}`)
      if (scene.music_mood) lines.push(`  Music: ${scene.music_mood}`)
      lines.push(`  Transition: ${scene.transition}`)
      lines.push('')
    }
    lines.push('---POST---')
    lines.push('')
    lines.push(`CTA: ${script.call_to_action}`)
    lines.push(`Caption: ${script.caption}`)
    lines.push(`Hashtags: ${script.hashtags.map((h) => `#${h}`).join(' ')}`)
    lines.push('')
    lines.push('---EQUIPMENT---')
    lines.push(script.equipment_suggestions.join(', '))
    lines.push('')
    lines.push('---FILMING TIPS---')
    for (const tip of script.filming_tips) lines.push(`• ${tip}`)

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `script-${script.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 40)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleReset() {
    setScript(null)
    setTopic('')
    setTargetAudience('')
    setPlatform('tiktok')
    setDuration(30)
    setTone('entertaining')
    setStyle('talking_head')
    setLanguage('en')
  }

  return (
    <div className="mx-auto max-w-7xl animate-fade-in">
      <PageHeader title={t('title')} description={t('desc')} />

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.5fr)] xl:items-start">
        {/* Left: Input Form */}
        <div className="space-y-4 xl:sticky xl:top-6">
          {/* Topic */}
          <div className="panel space-y-3 p-5">
            <label
              htmlFor="script-topic"
              className="text-[13px] font-medium flex items-center gap-2"
              style={{
                fontFamily: 'var(--font-studio), "Manrope", sans-serif'
              }}
            >
              <Lightbulb className="h-4 w-4 text-primary" strokeWidth={2} />
              {t('topicLabel')}
            </label>
            <textarea
              id="script-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={t('topicPlaceholder')}
              rows={3}
              maxLength={1000}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 resize-none transition-colors"
            />
            <p className="text-[11px] text-muted-foreground text-right">
              {topic.length}/1000
            </p>
          </div>

          {/* Platform */}
          <div className="panel space-y-3 p-5">
            <label
              className="text-[13px] font-medium flex items-center gap-2"
              style={{
                fontFamily: 'var(--font-studio), "Manrope", sans-serif'
              }}
            >
              <Target className="h-4 w-4 text-primary" strokeWidth={2} />
              {t('platformLabel')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPlatform(p.value)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] font-medium transition-all ${
                    platform === p.value
                      ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/20'
                      : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5'
                  }`}
                >
                  <span>{p.icon}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Duration + Tone */}
          <div className="panel space-y-5 p-5">
            <div className="space-y-2">
              <label
                className="text-[13px] font-medium flex items-center gap-2"
                style={{
                  fontFamily: 'var(--font-studio), "Manrope", sans-serif'
                }}
              >
                <Clock className="h-4 w-4 text-primary" strokeWidth={2} />
                {t('durationLabel')}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all ${
                      duration === d
                        ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/20'
                        : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5'
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label
                className="text-[13px] font-medium flex items-center gap-2"
                style={{
                  fontFamily: 'var(--font-studio), "Manrope", sans-serif'
                }}
              >
                <MessageSquare
                  className="h-4 w-4 text-primary"
                  strokeWidth={2}
                />
                {t('toneLabel')}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {TONES.map((tn) => (
                  <button
                    key={tn.value}
                    type="button"
                    onClick={() => setTone(tn.value)}
                    className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all ${
                      tone === tn.value
                        ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/20'
                        : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5'
                    }`}
                  >
                    {t(tn.key)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Style */}
          <div className="panel space-y-3 p-5">
            <label
              className="text-[13px] font-medium flex items-center gap-2"
              style={{
                fontFamily: 'var(--font-studio), "Manrope", sans-serif'
              }}
            >
              <Video className="h-4 w-4 text-primary" strokeWidth={2} />
              {t('styleLabel')}
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {STYLES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStyle(s.value)}
                  className={`rounded-lg border px-3 py-2 text-[12px] font-medium text-left transition-all ${
                    style === s.value
                      ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/20'
                      : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5'
                  }`}
                >
                  {t(s.key)}
                </button>
              ))}
            </div>
          </div>

          {/* Target Audience + Language */}
          <div className="panel space-y-5 p-5">
            <div className="space-y-2">
              <label
                htmlFor="script-audience"
                className="text-[13px] font-medium flex items-center gap-2"
                style={{
                  fontFamily: 'var(--font-studio), "Manrope", sans-serif'
                }}
              >
                <Eye className="h-4 w-4 text-primary" strokeWidth={2} />
                {t('audienceLabel')}
              </label>
              <input
                id="script-audience"
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder={t('audiencePlaceholder')}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="script-language"
                className="text-[13px] font-medium"
                style={{
                  fontFamily: 'var(--font-studio), "Manrope", sans-serif'
                }}
              >
                {t('languageLabel')}
              </label>
              <select
                id="script-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
              >
                <option value="en">English</option>
                <option value="ro">Română</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
              </select>
            </div>
          </div>

          {/* Generate Button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy || !topic.trim()}
            className="button-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                {t('generating')}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" strokeWidth={2} />
                {t('generateButton')}
              </>
            )}
          </button>
        </div>

        {/* Right: Script Output */}
        <div className="min-w-0 space-y-4">
          {!script && !busy && (
            <div className="panel-soft flex min-h-[26rem] flex-col items-center justify-center border-dashed px-6 py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <FileText
                  className="h-7 w-7 text-primary/60"
                  strokeWidth={1.5}
                />
              </div>
              <p className="text-sm font-medium text-muted-foreground mb-1">
                {t('emptyTitle')}
              </p>
              <p className="text-xs text-muted-foreground/70 max-w-xs">
                {t('emptyDesc')}
              </p>
            </div>
          )}

          {busy && (
            <div className="panel flex min-h-[26rem] flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles
                  className="h-7 w-7 animate-pulse text-primary"
                  strokeWidth={1.5}
                />
              </div>
              <p className="text-sm font-medium mb-1">{t('generatingTitle')}</p>
              <p className="text-xs text-muted-foreground">
                {t('generatingDesc')}
              </p>
              <div className="mt-4 flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-2 w-2 animate-bounce rounded-full bg-primary/60"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          )}

          {script && (
            <div className="space-y-4 animate-fade-in">
              {/* Script Header */}
              <div className="panel p-5">
                <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2
                      className="text-base font-semibold"
                      style={{
                        fontFamily:
                          'var(--font-cinematic), "Bodoni Moda", serif'
                      }}
                    >
                      {script.title}
                    </h2>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {script.total_duration_seconds}s
                      </span>
                      <span className="flex items-center gap-1">
                        <Clapperboard className="w-3 h-3" />
                        {script.scenes.length} {t('scenes')}
                      </span>
                      <span>
                        {PLATFORMS.find((p) => p.value === platform)?.icon}{' '}
                        {PLATFORMS.find((p) => p.value === platform)?.label}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <button
                      type="button"
                      onClick={copyFullScript}
                      className="button-secondary min-h-9 px-3 text-[11px]"
                    >
                      <Copy className="w-3 h-3" />
                      {t('copyAll')}
                    </button>
                    <button
                      type="button"
                      onClick={downloadScript}
                      className="button-secondary min-h-9 px-3 text-[11px]"
                    >
                      <Download className="w-3 h-3" />
                      {t('download')}
                    </button>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-destructive/25 px-3 text-[11px] font-semibold text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <RotateCcw className="w-3 h-3" />
                      {t('newScript')}
                    </button>
                  </div>
                </div>

                {/* Hook */}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <p className="section-label mb-2 text-primary">
                    {t('hookLabel')}
                  </p>
                  <p className="text-[13px] font-medium">{script.hook}</p>
                </div>
              </div>

              <ShootingCoach
                scenes={script.scenes}
                labels={coachLabels}
                speechLanguage={language}
              />

              {/* Scene Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="section-label">{t('scenesLabel')}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={expandAll}
                    className="text-[11px] font-semibold text-primary hover:underline"
                  >
                    {t('expandAll')}
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    type="button"
                    onClick={collapseAll}
                    className="text-[11px] font-semibold text-primary hover:underline"
                  >
                    {t('collapseAll')}
                  </button>
                </div>
              </div>

              {/* Scenes */}
              {script.scenes.map((scene, index) => {
                const expanded = expandedScenes.has(index)
                return (
                  <div
                    key={scene.scene_number}
                    className="panel overflow-hidden transition-all"
                  >
                    <button
                      type="button"
                      onClick={() => toggleScene(index)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/70"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-bold text-primary">
                          {scene.scene_number}
                        </div>
                        <div className="text-left">
                          <p className="text-[13px] font-medium">
                            {t('sceneN', { n: scene.scene_number })}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {scene.duration_seconds}s · {scene.camera_angle}
                          </p>
                        </div>
                      </div>
                      {expanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>

                    {expanded && (
                      <div className="space-y-3 border-t border-border px-4 pb-4 pt-4 animate-fade-in">
                        <SceneRow
                          icon={<Eye className="w-3.5 h-3.5" />}
                          label={t('visualLabel')}
                          value={scene.visual_description}
                        />
                        <SceneRow
                          icon={<Camera className="w-3.5 h-3.5" />}
                          label={t('cameraLabel')}
                          value={`${scene.camera_angle} — ${scene.camera_movement}`}
                        />
                        {scene.dialogue && (
                          <SceneRow
                            icon={<MessageSquare className="w-3.5 h-3.5" />}
                            label={t('dialogueLabel')}
                            value={`"${scene.dialogue}"`}
                            highlight={true}
                          />
                        )}
                        {scene.text_overlay && (
                          <SceneRow
                            icon={<Type className="w-3.5 h-3.5" />}
                            label={t('overlayLabel')}
                            value={scene.text_overlay}
                            highlight={true}
                          />
                        )}
                        {scene.music_mood && (
                          <SceneRow
                            icon={<Music className="w-3.5 h-3.5" />}
                            label={t('musicLabel')}
                            value={scene.music_mood}
                          />
                        )}
                        <SceneRow
                          icon={<ArrowRight className="w-3.5 h-3.5" />}
                          label={t('transitionLabel')}
                          value={scene.transition}
                        />
                      </div>
                    )}
                  </div>
                )
              })}

              {/* CTA + Caption + Hashtags */}
              <div className="panel space-y-5 p-5">
                <div className="space-y-1">
                  <p className="section-label flex items-center gap-1.5 text-primary">
                    <Megaphone className="w-3 h-3" />
                    {t('ctaLabel')}
                  </p>
                  <p className="text-[13px]">{script.call_to_action}</p>
                </div>

                <div className="space-y-1 border-t border-border pt-4">
                  <p className="section-label">{t('captionLabel')}</p>
                  <p className="text-[13px] whitespace-pre-line">
                    {script.caption}
                  </p>
                </div>

                <div className="space-y-2 border-t border-border pt-4">
                  <p className="section-label flex items-center gap-1.5">
                    <Hash className="w-3 h-3" />
                    {t('hashtagsLabel')}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {script.hashtags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-primary/15 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Equipment + Tips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="panel space-y-3 p-5">
                  <p className="section-label flex items-center gap-1.5">
                    <Wrench className="w-3 h-3" />
                    {t('equipmentLabel')}
                  </p>
                  <ul className="space-y-1">
                    {script.equipment_suggestions.map((eq, i) => (
                      <li
                        key={i}
                        className="text-[12px] flex items-center gap-2"
                      >
                        <span className="h-1 w-1 shrink-0 rounded-full bg-primary/70" />
                        {eq}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="panel space-y-3 p-5">
                  <p className="section-label flex items-center gap-1.5">
                    <Lightbulb className="w-3 h-3" />
                    {t('tipsLabel')}
                  </p>
                  <ul className="space-y-1">
                    {script.filming_tips.map((tip, i) => (
                      <li
                        key={i}
                        className="text-[12px] flex items-start gap-2"
                      >
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/70" />
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SceneRow({
  icon,
  label,
  value,
  highlight
}: {
  icon: React.ReactNode
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
          {label}
        </p>
        <p
          className={`text-[13px] ${
            highlight ? 'font-medium text-foreground' : 'text-foreground/80'
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  )
}
