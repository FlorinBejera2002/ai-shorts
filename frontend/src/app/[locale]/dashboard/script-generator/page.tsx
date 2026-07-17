'use client'

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
import { useState } from 'react'

type ScriptScene = {
  scene_number: number
  duration_seconds: number
  visual_description: string
  camera_angle: string
  camera_movement: string
  dialogue: string
  text_overlay: string
  music_mood: string
  transition: string
}

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
    <div className="animate-fade-in max-w-6xl mx-auto">
      <PageHeader title={t('title')} description={t('desc')} />

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-6">
        {/* Left: Input Form */}
        <div className="space-y-4">
          {/* Topic */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <label className="text-[13px] font-medium flex items-center gap-2">
              <Lightbulb className="w-3.5 h-3.5 text-primary" strokeWidth={2} />
              {t('topicLabel')}
            </label>
            <textarea
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
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <label className="text-[13px] font-medium flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-primary" strokeWidth={2} />
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
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border bg-background text-foreground hover:border-primary/40'
                  }`}
                >
                  <span>{p.icon}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Duration + Tone */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <div className="space-y-2">
              <label className="text-[13px] font-medium flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-primary" strokeWidth={2} />
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
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border bg-background text-foreground hover:border-primary/40'
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[13px] font-medium flex items-center gap-2">
                <MessageSquare
                  className="w-3.5 h-3.5 text-primary"
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
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border bg-background text-foreground hover:border-primary/40'
                    }`}
                  >
                    {t(tn.key)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Style */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <label className="text-[13px] font-medium flex items-center gap-2">
              <Video className="w-3.5 h-3.5 text-primary" strokeWidth={2} />
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
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border bg-background text-foreground hover:border-primary/40'
                  }`}
                >
                  {t(s.key)}
                </button>
              ))}
            </div>
          </div>

          {/* Target Audience + Language */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <div className="space-y-2">
              <label className="text-[13px] font-medium flex items-center gap-2">
                <Eye className="w-3.5 h-3.5 text-primary" strokeWidth={2} />
                {t('audienceLabel')}
              </label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder={t('audiencePlaceholder')}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[13px] font-medium">
                {t('languageLabel')}
              </label>
              <select
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
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-4 py-3 text-[13px] font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
        <div className="space-y-4">
          {!script && !busy && (
            <div className="rounded-xl border border-dashed border-border bg-card/50 flex flex-col items-center justify-center py-20 px-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <FileText
                  className="w-7 h-7 text-primary/50"
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
            <div className="rounded-xl border border-border bg-card flex flex-col items-center justify-center py-20 px-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Sparkles
                  className="w-7 h-7 text-primary animate-pulse"
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
                    className="w-2 h-2 rounded-full bg-primary/60 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          )}

          {script && (
            <div className="space-y-4 animate-fade-in">
              {/* Script Header */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h2 className="text-base font-semibold">{script.title}</h2>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
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
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={copyFullScript}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent/10 transition-colors"
                    >
                      <Copy className="w-3 h-3" />
                      {t('copyAll')}
                    </button>
                    <button
                      type="button"
                      onClick={downloadScript}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent/10 transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      {t('download')}
                    </button>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-destructive/10 text-destructive transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      {t('newScript')}
                    </button>
                  </div>
                </div>

                {/* Hook */}
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                  <p className="text-[11px] font-semibold text-primary uppercase tracking-wide mb-1">
                    {t('hookLabel')}
                  </p>
                  <p className="text-[13px] font-medium">{script.hook}</p>
                </div>
              </div>

              {/* Scene Controls */}
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium">{t('scenesLabel')}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={expandAll}
                    className="text-[11px] text-primary hover:underline"
                  >
                    {t('expandAll')}
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    type="button"
                    onClick={collapseAll}
                    className="text-[11px] text-primary hover:underline"
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
                    className="rounded-xl border border-border bg-card overflow-hidden transition-all"
                  >
                    <button
                      type="button"
                      onClick={() => toggleScene(index)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/5 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary">
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
                      <div className="px-4 pb-4 space-y-3 border-t border-border pt-3 animate-fade-in">
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
              <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-primary uppercase tracking-wide flex items-center gap-1.5">
                    <Megaphone className="w-3 h-3" />
                    {t('ctaLabel')}
                  </p>
                  <p className="text-[13px]">{script.call_to_action}</p>
                </div>

                <div className="border-t border-border pt-3 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('captionLabel')}
                  </p>
                  <p className="text-[13px] whitespace-pre-line">
                    {script.caption}
                  </p>
                </div>

                <div className="border-t border-border pt-3 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <Hash className="w-3 h-3" />
                    {t('hashtagsLabel')}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {script.hashtags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-medium"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Equipment + Tips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <Wrench className="w-3 h-3" />
                    {t('equipmentLabel')}
                  </p>
                  <ul className="space-y-1">
                    {script.equipment_suggestions.map((eq, i) => (
                      <li
                        key={i}
                        className="text-[12px] flex items-center gap-2"
                      >
                        <span className="w-1 h-1 rounded-full bg-primary/60 shrink-0" />
                        {eq}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <Lightbulb className="w-3 h-3" />
                    {t('tipsLabel')}
                  </p>
                  <ul className="space-y-1">
                    {script.filming_tips.map((tip, i) => (
                      <li
                        key={i}
                        className="text-[12px] flex items-start gap-2"
                      >
                        <span className="w-1 h-1 rounded-full bg-accent/60 shrink-0 mt-1.5" />
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
      <div className="w-6 h-6 rounded-md bg-muted/50 flex items-center justify-center text-muted-foreground shrink-0 mt-0.5">
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
