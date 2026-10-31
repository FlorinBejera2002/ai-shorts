'use client'

import { useToast } from '@/components/ui/toast'
import type { CoachScene } from './shooting-coach'
import { apiFetch } from '@/lib/auth'
import { isPublishingProvider } from '@/lib/publishing'
import {
  type GeneratedScript,
  type ScriptRecord,
  type ScriptScene,
  type ScriptVersion,
  emptyScript
} from '@/lib/scripts-workspace'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

function responseError(data: unknown, fallback: string) {
  if (!data || typeof data !== 'object') return fallback
  const body = data as { detail?: unknown; error?: unknown }
  if (typeof body.detail === 'string') return body.detail
  if (typeof body.error === 'string') return body.error
  return fallback
}

export function useScriptsWorkspace() {
  const t = useTranslations('scriptGenerator')
  const toast = useToast()
  const [view, setView] = useState<'library' | 'editor'>('library')
  const [records, setRecords] = useState<ScriptRecord[]>([])
  const [query, setQuery] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [loadingLibrary, setLoadingLibrary] = useState(true)
  const [libraryError, setLibraryError] = useState('')
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
  const [updatedAt, setUpdatedAt] = useState('')
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<number | undefined>(undefined)

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
      setLibraryError('')
    } catch (error) {
      setLibraryError(
        error instanceof Error ? error.message : t('workspace.loadFailed')
      )
    } finally {
      setLoadingLibrary(false)
    }
  }, [includeArchived, query, t])

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
    setUpdatedAt(record.updatedAt)
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
    if (creating) return
    setCreating(true)
    const draftPlatform = isPublishingProvider(payload.platform)
      ? payload.platform
      : 'tiktok'
    try {
      const draft = emptyScript(t('workspace.untitled'))
      const response = await apiFetch('/api/scripts/items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          status: 'draft',
          platform: draftPlatform,
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
    } finally {
      setCreating(false)
    }
  }

  const save = useCallback(
    async (submitted: typeof payload, summary = '') => {
      if (
        !activeId ||
        savingRef.current ||
        !isPublishingProvider(submitted.platform)
      )
        return
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
        setUpdatedAt(data.script.updatedAt)
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
      !isPublishingProvider(platform) ||
      serializedPayload === lastSavedRef.current ||
      saveState === 'saving' ||
      saveState === 'error'
    )
      return
    const timer = window.setTimeout(() => save(payload), 900)
    return () => window.clearTimeout(timer)
  }, [activeId, payload, platform, save, saveState, serializedPayload])

  async function generate() {
    if (!isPublishingProvider(platform)) {
      toast.add('error', t('platformRequired'))
      return
    }
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
  /** Appends an empty scene and returns its editor id for selection. */
  function addScene() {
    const editorId = crypto.randomUUID()
    setScript((current) => ({
      ...current,
      scenes: [
        ...current.scenes,
        {
          scene_number: current.scenes.length + 1,
          editor_id: editorId,
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
    return editorId
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

  async function openVersions(open = true) {
    setShowVersions(open)
    if (!open || !activeId) return
    // Every save adds a version, so the history is refreshed on each open.
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

  function scriptText() {
    return [
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
  }
  async function copyScript() {
    try {
      await navigator.clipboard.writeText(scriptText())
    } catch {
      toast.add('error', t('workspace.copyFailed'))
      return
    }
    window.clearTimeout(copiedTimer.current)
    setCopied(true)
    copiedTimer.current = window.setTimeout(() => setCopied(false), 2200)
  }
  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])

  function download(body: string, type: string, extension: string) {
    const url = URL.createObjectURL(new Blob([body], { type }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${script.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'script'}.${extension}`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  function downloadScript() {
    download(scriptText(), 'text/plain;charset=utf-8', 'txt')
  }
  function downloadJson() {
    download(JSON.stringify(script, null, 2), 'application/json', 'json')
  }

  function backToLibrary() {
    setView('library')
    void loadLibrary()
  }

  return {
    view,
    records,
    query,
    setQuery,
    includeArchived,
    setIncludeArchived,
    loadingLibrary,
    libraryError,
    retryLibrary: loadLibrary,
    creating,
    copied,
    activeId,
    revision,
    saveState,
    updatedAt,
    versions,
    showVersions,
    topic,
    setTopic,
    platform,
    setPlatform,
    duration,
    setDuration,
    tone,
    setTone,
    style,
    setStyle,
    audience,
    setAudience,
    language,
    setLanguage,
    status,
    setStatus,
    script,
    setScript,
    generating,
    applyRecord,
    createScript,
    generate,
    updateScene,
    addScene,
    moveScene,
    deleteScene,
    openVersions,
    restoreVersion,
    archiveScript,
    copyScript,
    downloadScript,
    downloadJson,
    backToLibrary,
    retrySave: () => save(payload)
  }
}

export type ScriptsWorkspace = ReturnType<typeof useScriptsWorkspace>
