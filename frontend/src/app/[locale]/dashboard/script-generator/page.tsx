'use client'

import '@/components/create/creation-workbench.css'

import { ScriptLibrary } from '@/components/script/script-library'
import {
  type CoachScene,
  ShootingCoach,
  type ShootingCoachLabels
} from '@/components/script/shooting-coach'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { PageHeader } from '@/components/ui/page-header'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { Link } from '@/i18n/navigation'
import { apiFetch } from '@/lib/auth'
import {
  type GeneratedScript,
  type ScriptRecord,
  type ScriptScene,
  type ScriptVersion,
  emptyScript
} from '@/lib/scripts-workspace'
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Clock,
  Copy,
  Download,
  FileClock,
  FileText,
  Plus,
  Save,
  Sparkles,
  Trash2
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const PLATFORMS = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram Reels' },
  { value: 'youtube', label: 'YouTube Shorts' },
  { value: 'linkedin', label: 'LinkedIn' }
]
const DURATIONS = [15, 30, 45, 60, 90, 120, 180]
const LANGUAGES = ['en', 'ro', 'es', 'fr', 'de', 'it', 'pt']
const STATUSES = [
  'idea',
  'draft',
  'review',
  'ready',
  'in_production',
  'published'
]

function responseError(data: unknown, fallback: string) {
  if (!data || typeof data !== 'object') return fallback
  const body = data as { detail?: unknown; error?: unknown }
  if (typeof body.detail === 'string') return body.detail
  if (typeof body.error === 'string') return body.error
  return fallback
}

export default function ScriptGeneratorPage() {
  const t = useTranslations('scriptGenerator')
  const sections = useTranslations('dashboardSections')
  const toast = useToast()
  const [view, setView] = useState<'library' | 'editor'>('library')
  const [records, setRecords] = useState<ScriptRecord[]>([])
  const [query, setQuery] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [loadingLibrary, setLoadingLibrary] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const revisionRef = useRef(0)
  const lastSavedRef = useRef('')
  const savingRef = useRef(false)
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const [versions, setVersions] = useState<ScriptVersion[]>([])
  const [showVersions, setShowVersions] = useState(false)
  const [topic, setTopic] = useState('')
  const [platform, setPlatform] = useState('tiktok')
  const [duration, setDuration] = useState(30)
  const [tone, setTone] = useState('entertaining')
  const [style, setStyle] = useState('talking_head')
  const [audience, setAudience] = useState('')
  const [language, setLanguage] = useState('en')
  const [status, setStatus] = useState('draft')
  const [script, setScript] = useState<GeneratedScript>(() => emptyScript())
  const [generating, setGenerating] = useState(false)

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

  const payload = useMemo(
    () => ({
      title: script.title,
      status,
      topic,
      platform,
      language,
      target_duration_seconds: duration,
      tone,
      style,
      audience,
      snapshot: script
    }),
    [audience, duration, language, platform, script, status, style, tone, topic]
  )
  const serializedPayload = useMemo(() => JSON.stringify(payload), [payload])

  const loadLibrary = useCallback(async () => {
    setLoadingLibrary(true)
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('query', query.trim())
      if (includeArchived) params.set('archived', 'true')
      const response = await apiFetch(`/api/scripts/items?${params}`)
      const data = await response.json()
      if (!response.ok)
        throw new Error(responseError(data, t('workspace.loadFailed')))
      setRecords(data.scripts ?? [])
    } catch (error) {
      toast.add(
        'error',
        error instanceof Error ? error.message : t('workspace.loadFailed')
      )
    } finally {
      setLoadingLibrary(false)
    }
  }, [includeArchived, query, t, toast])

  useEffect(() => {
    const timer = window.setTimeout(loadLibrary, 250)
    return () => window.clearTimeout(timer)
  }, [loadLibrary])

  function applyRecord(record: ScriptRecord) {
    const storedSnapshot = record.snapshot?.title
      ? record.snapshot
      : emptyScript(record.title)
    const snapshot = {
      ...storedSnapshot,
      scenes: storedSnapshot.scenes.map((scene) => ({
        ...scene,
        editor_id: scene.editor_id ?? crypto.randomUUID()
      }))
    }
    setActiveId(record.id)
    setRevision(record.revision)
    revisionRef.current = record.revision
    setTopic(record.topic)
    setPlatform(record.platform)
    setLanguage(record.language)
    setDuration(record.targetDurationSeconds)
    setTone(record.tone)
    setStyle(record.style)
    setAudience(record.audience)
    setStatus(record.status)
    setScript(snapshot)
    setVersions([])
    setShowVersions(false)
    setView('editor')
    lastSavedRef.current = JSON.stringify({
      title: snapshot.title,
      status: record.status,
      topic: record.topic,
      platform: record.platform,
      language: record.language,
      target_duration_seconds: record.targetDurationSeconds,
      tone: record.tone,
      style: record.style,
      audience: record.audience,
      snapshot
    })
    setSaveState('saved')
  }

  async function createScript() {
    try {
      const draft = emptyScript(t('workspace.untitled'))
      const response = await apiFetch('/api/scripts/items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          title: draft.title,
          snapshot: draft
        })
      })
      const data = await response.json()
      if (!response.ok)
        throw new Error(responseError(data, t('workspace.createFailed')))
      applyRecord(data.script)
    } catch (error) {
      toast.add(
        'error',
        error instanceof Error ? error.message : t('workspace.createFailed')
      )
    }
  }

  const save = useCallback(
    async (submitted: typeof payload, summary = '') => {
      if (!activeId || savingRef.current) return
      savingRef.current = true
      setSaveState('saving')
      const serialized = JSON.stringify(submitted)
      try {
        const response = await apiFetch(`/api/scripts/items/${activeId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...submitted,
            revision: revisionRef.current,
            summary
          })
        })
        const data = await response.json()
        if (!response.ok)
          throw new Error(responseError(data, t('workspace.saveFailed')))
        revisionRef.current = data.script.revision
        setRevision(data.script.revision)
        lastSavedRef.current = serialized
        setSaveState('saved')
      } catch (error) {
        setSaveState('error')
        toast.add(
          'error',
          error instanceof Error ? error.message : t('workspace.saveFailed')
        )
      } finally {
        savingRef.current = false
      }
    },
    [activeId, t, toast]
  )

  useEffect(() => {
    if (
      !activeId ||
      serializedPayload === lastSavedRef.current ||
      saveState === 'saving' ||
      saveState === 'error'
    )
      return
    const timer = window.setTimeout(() => save(payload), 900)
    return () => window.clearTimeout(timer)
  }, [activeId, payload, save, saveState, serializedPayload])

  async function generate() {
    if (!topic.trim()) {
      toast.add('error', t('topicRequired'))
      return
    }
    setGenerating(true)
    try {
      const response = await apiFetch('/api/scripts/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          platform,
          duration,
          tone,
          target_audience: audience.trim(),
          language,
          style
        })
      })
      const data = await response.json()
      if (!response.ok)
        throw new Error(responseError(data, t('generateFailed')))
      const generatedScript: GeneratedScript = {
        ...data.script,
        scenes: data.script.scenes.map((scene: ScriptScene) => ({
          ...scene,
          editor_id: crypto.randomUUID()
        }))
      }
      setScript(generatedScript)
      await save(
        {
          ...payload,
          title: generatedScript.title,
          snapshot: generatedScript
        },
        'AI generation'
      )
      toast.add('success', t('generateSuccess'))
    } catch (error) {
      toast.add(
        'error',
        error instanceof Error ? error.message : t('generateFailed')
      )
    } finally {
      setGenerating(false)
    }
  }

  function updateScene(index: number, patch: Partial<CoachScene>) {
    setScript((current) => ({
      ...current,
      scenes: current.scenes.map((scene, i) =>
        i === index ? { ...scene, ...patch } : scene
      )
    }))
  }
  function addScene() {
    setScript((current) => ({
      ...current,
      scenes: [
        ...current.scenes,
        {
          scene_number: current.scenes.length + 1,
          editor_id: crypto.randomUUID(),
          duration_seconds: 5,
          visual_description: '',
          camera_angle: 'Eye level',
          camera_movement: 'Static',
          camera_movement_type: 'static',
          camera_movement_direction: 'none',
          dialogue: '',
          text_overlay: '',
          music_mood: '',
          transition: 'Cut'
        }
      ]
    }))
  }
  function moveScene(index: number, direction: -1 | 1) {
    setScript((current) => {
      const scenes = [...current.scenes]
      const target = index + direction
      if (target < 0 || target >= scenes.length) return current
      const currentScene = scenes[index]
      const targetScene = scenes[target]
      if (!currentScene || !targetScene) return current
      scenes[index] = targetScene
      scenes[target] = currentScene
      return {
        ...current,
        scenes: scenes.map((scene, i) => ({ ...scene, scene_number: i + 1 }))
      }
    })
  }
  function deleteScene(index: number) {
    setScript((current) => ({
      ...current,
      scenes: current.scenes.reduce<ScriptScene[]>((next, scene, i) => {
        if (i !== index) next.push({ ...scene, scene_number: next.length + 1 })
        return next
      }, [])
    }))
  }

  async function loadVersions() {
    if (!activeId) return
    setShowVersions((current) => !current)
    if (versions.length) return
    const response = await apiFetch(`/api/scripts/items/${activeId}/versions`)
    const data = await response.json()
    if (response.ok) setVersions(data.versions ?? [])
    else toast.add('error', responseError(data, t('workspace.versionsFailed')))
  }
  async function restoreVersion(versionId: string) {
    if (!activeId) return
    const response = await apiFetch(
      `/api/scripts/items/${activeId}/versions/${versionId}/restore`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ revision: revisionRef.current })
      }
    )
    const data = await response.json()
    if (!response.ok) {
      toast.add('error', responseError(data, t('workspace.restoreFailed')))
      return
    }
    applyRecord(data.script)
    toast.add('success', t('workspace.restored'))
  }
  async function archiveScript() {
    if (!activeId) return
    const response = await apiFetch(`/api/scripts/items/${activeId}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      toast.add('error', t('workspace.archiveFailed'))
      return
    }
    setView('library')
    await loadLibrary()
  }

  function copyScript() {
    const text = [
      script.title,
      script.hook,
      ...script.scenes.flatMap((scene) => [
        `Scene ${scene.scene_number} (${scene.duration_seconds}s)`,
        scene.visual_description,
        scene.dialogue
      ]),
      script.call_to_action,
      script.caption,
      script.hashtags.map((tag) => `#${tag}`).join(' ')
    ].join('\n\n')
    navigator.clipboard.writeText(text)
    toast.add('success', t('copied'))
  }
  function downloadScript() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(script, null, 2)], { type: 'application/json' })
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${script.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'script'}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="script-workbench dashboard-workspace w-full animate-fade-in">
      <PageHeader
        title={view === 'library' ? t('workspace.title') : script.title}
        description={
          view === 'library'
            ? t('workspace.description')
            : t('workspace.editorDescription')
        }
        actions={
          view === 'library' ? (
            <Button asChild={true} variant="outline">
              <Link href="/dashboard/create">{sections('backToCreate')}</Link>
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                setView('library')
                loadLibrary()
              }}
            >
              <ArrowLeft />
              {t('workspace.backToLibrary')}
            </Button>
          )
        }
      />
      <div className="mt-6">
        {view === 'library' ? (
          <ScriptLibrary
            records={records}
            query={query}
            includeArchived={includeArchived}
            busy={loadingLibrary}
            onQueryChange={setQuery}
            onArchivedChange={setIncludeArchived}
            onOpen={applyRecord}
            onNew={createScript}
            labels={{
              title: t('workspace.title'),
              search: t('workspace.search'),
              archived: t('workspace.showArchived'),
              new: t('workspace.new'),
              emptyTitle: t('workspace.emptyTitle'),
              emptyDescription: t('workspace.emptyDescription'),
              noBrief: t('workspace.noBrief')
            }}
          />
        ) : (
          <div className="space-y-5">
            <div className="sticky top-3 z-20 flex flex-wrap items-center gap-2 rounded-2xl border bg-background/95 p-3 shadow-sm backdrop-blur">
              <NativeSelect
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="w-40"
              >
                {STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {t(`workspace.status.${value}`)}
                  </option>
                ))}
              </NativeSelect>
              <span className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
                <Save />
                {saveState === 'saving'
                  ? t('workspace.saving')
                  : saveState === 'error'
                    ? t('workspace.saveError')
                    : t('workspace.saved', { revision })}
              </span>
              {saveState === 'error' && (
                <Button size="sm" onClick={() => save(payload)}>
                  {t('workspace.retrySave')}
                </Button>
              )}
              <span className="mr-auto" />
              <Button variant="outline" size="sm" onClick={loadVersions}>
                <FileClock />
                {t('workspace.versions')}
              </Button>
              <Button variant="outline" size="sm" onClick={copyScript}>
                <Copy />
                {t('copyAll')}
              </Button>
              <Button variant="outline" size="sm" onClick={downloadScript}>
                <Download />
                {t('download')}
              </Button>
              <Button variant="destructive" size="sm" onClick={archiveScript}>
                <Archive />
                {t('workspace.archive')}
              </Button>
            </div>
            {showVersions && (
              <Card className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">
                    {t('workspace.versionHistory')}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {versions.length}
                  </span>
                </div>
                <div className="divide-y">
                  {versions.map((version) => (
                    <div
                      key={version.id}
                      className="flex items-center gap-3 py-3"
                    >
                      <span className="rounded-full bg-muted px-2 py-1 text-xs font-bold">
                        v{version.versionNumber}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          {version.summary || version.changeType}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(version.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {version.versionNumber !== revision && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => restoreVersion(version.id)}
                        >
                          {t('workspace.restore')}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
            <div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.45fr)] xl:items-start">
              <aside className="space-y-4 xl:sticky xl:top-20">
                <Card className="space-y-4 p-5">
                  <div>
                    <Label htmlFor="script-topic">{t('topicLabel')}</Label>
                    <Textarea
                      id="script-topic"
                      value={topic}
                      onChange={(event) => setTopic(event.target.value)}
                      rows={4}
                      maxLength={1000}
                      placeholder={t('topicPlaceholder')}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>{t('platformLabel')}</Label>
                    <NativeSelect
                      value={platform}
                      onChange={(event) => setPlatform(event.target.value)}
                      className="mt-2 w-full"
                    >
                      {PLATFORMS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>{t('durationLabel')}</Label>
                      <NativeSelect
                        value={duration}
                        onChange={(event) =>
                          setDuration(Number(event.target.value))
                        }
                        className="mt-2 w-full"
                      >
                        {DURATIONS.map((value) => (
                          <option key={value} value={value}>
                            {value}s
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                    <div>
                      <Label>{t('languageLabel')}</Label>
                      <NativeSelect
                        value={language}
                        onChange={(event) => setLanguage(event.target.value)}
                        className="mt-2 w-full"
                      >
                        {LANGUAGES.map((value) => (
                          <option key={value} value={value}>
                            {value.toUpperCase()}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  </div>
                  <div>
                    <Label>{t('toneLabel')}</Label>
                    <Input
                      value={tone}
                      onChange={(event) => setTone(event.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>{t('styleLabel')}</Label>
                    <Input
                      value={style}
                      onChange={(event) => setStyle(event.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>{t('audienceLabel')}</Label>
                    <Textarea
                      value={audience}
                      onChange={(event) => setAudience(event.target.value)}
                      rows={2}
                      className="mt-2"
                      placeholder={t('audiencePlaceholder')}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={generate}
                    disabled={generating}
                  >
                    {generating ? (
                      <>
                        <Sparkles className="animate-pulse" />
                        {t('generating')}
                      </>
                    ) : (
                      <>
                        <Sparkles />
                        {t('generateButton')}
                      </>
                    )}
                  </Button>
                </Card>
              </aside>
              <main className="min-w-0 space-y-4">
                <Card className="space-y-4 p-5">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <FileText />
                    {t('workspace.scriptDocument')}
                  </div>
                  <div>
                    <Label htmlFor="script-title">
                      {t('workspace.scriptTitle')}
                    </Label>
                    <Input
                      id="script-title"
                      value={script.title}
                      onChange={(event) =>
                        setScript((current) => ({
                          ...current,
                          title: event.target.value
                        }))
                      }
                      className="mt-2 text-lg font-semibold"
                    />
                  </div>
                  <div>
                    <Label htmlFor="script-hook">{t('hookLabel')}</Label>
                    <Textarea
                      id="script-hook"
                      value={script.hook}
                      onChange={(event) =>
                        setScript((current) => ({
                          ...current,
                          hook: event.target.value
                        }))
                      }
                      rows={3}
                      className="mt-2 border-primary/25 bg-primary/5"
                    />
                  </div>
                </Card>
                {script.scenes.map((scene, index) => (
                  <Card
                    key={scene.editor_id ?? scene.scene_number}
                    className="space-y-4 p-5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                        {index + 1}
                      </span>
                      <div className="mr-auto">
                        <h3 className="text-sm font-semibold">
                          {t('sceneN', { n: index + 1 })}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {scene.duration_seconds}s · {scene.camera_angle}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={index === 0}
                        onClick={() => moveScene(index, -1)}
                        aria-label={t('workspace.moveUp')}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={index === script.scenes.length - 1}
                        onClick={() => moveScene(index, 1)}
                        aria-label={t('workspace.moveDown')}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => deleteScene(index)}
                        aria-label={t('workspace.deleteScene')}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <div>
                      <Label>{t('visualLabel')}</Label>
                      <Textarea
                        value={scene.visual_description}
                        onChange={(event) =>
                          updateScene(index, {
                            visual_description: event.target.value
                          })
                        }
                        rows={2}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label>{t('dialogueLabel')}</Label>
                      <Textarea
                        value={scene.dialogue}
                        onChange={(event) =>
                          updateScene(index, { dialogue: event.target.value })
                        }
                        rows={2}
                        className="mt-2"
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label>{t('cameraLabel')}</Label>
                        <Input
                          value={scene.camera_angle}
                          onChange={(event) =>
                            updateScene(index, {
                              camera_angle: event.target.value
                            })
                          }
                          className="mt-2"
                        />
                      </div>
                      <div>
                        <Label>{t('transitionLabel')}</Label>
                        <Input
                          value={scene.transition}
                          onChange={(event) =>
                            updateScene(index, {
                              transition: event.target.value
                            })
                          }
                          className="mt-2"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>{t('overlayLabel')}</Label>
                      <Input
                        value={scene.text_overlay}
                        onChange={(event) =>
                          updateScene(index, {
                            text_overlay: event.target.value
                          })
                        }
                        className="mt-2"
                      />
                    </div>
                  </Card>
                ))}
                <Button
                  variant="outline"
                  className="w-full border-dashed"
                  onClick={addScene}
                >
                  <Plus />
                  {t('workspace.addScene')}
                </Button>
                <Card className="space-y-4 p-5">
                  <div>
                    <Label>{t('ctaLabel')}</Label>
                    <Textarea
                      value={script.call_to_action}
                      onChange={(event) =>
                        setScript((current) => ({
                          ...current,
                          call_to_action: event.target.value
                        }))
                      }
                      rows={2}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>{t('captionLabel')}</Label>
                    <Textarea
                      value={script.caption}
                      onChange={(event) =>
                        setScript((current) => ({
                          ...current,
                          caption: event.target.value
                        }))
                      }
                      rows={3}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>{t('hashtagsLabel')}</Label>
                    <Input
                      value={script.hashtags.join(', ')}
                      onChange={(event) =>
                        setScript((current) => ({
                          ...current,
                          hashtags: event.target.value
                            .split(',')
                            .map((value) => value.trim().replace(/^#/, ''))
                            .filter(Boolean)
                        }))
                      }
                      className="mt-2"
                    />
                  </div>
                </Card>
                <ShootingCoach scenes={script.scenes} labels={coachLabels} />
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Clock />
                  {script.scenes.reduce(
                    (total, scene) => total + scene.duration_seconds,
                    0
                  )}
                  s · {script.scenes.length} {t('scenes')}
                </div>
              </main>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
