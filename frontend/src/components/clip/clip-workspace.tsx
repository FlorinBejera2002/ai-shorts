'use client'

import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { apiFetch } from '@/lib/auth'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { Link, useRouter } from '@/i18n/navigation'
import {
  Check,
  Clipboard,
  Download,
  FileText,
  Gauge,
  Save,
  Scissors,
  Send,
  Sparkles,
  Trash2
} from 'lucide-react'
import { useLocale } from 'next-intl'
import { type CSSProperties, useMemo, useState } from 'react'

import { CALENDAR_PLATFORMS } from '@/components/calendar/calendar-utils'
import { PlatformOptionIcon } from '@/components/calendar/platform-mark'
import { useToast } from '@/components/ui/toast'
import {
  buildSocialCaption,
  getClipReadiness,
  getPlatformFit
} from '@/lib/clip-readiness'
import type { ContentPlatform } from '@/lib/content-calendar'

type ClipData = {
  id: string
  title: string
  hookText: string | null
  viralScore: number
  scoreReason: string | null
  duration: number
  resolution: string
  aspectRatio: string
  hasSubtitles: boolean
  transcriptText: string | null
  fileUrl: string | null
  createdAt: string
  captionTiktok: string | null
  captionInstagram: string | null
  captionYoutube: string | null
  suggestedHashtags: string | null
}

type ClipWorkspaceProps = {
  clip: ClipData
}

export function ClipWorkspace({ clip }: ClipWorkspaceProps) {
  const locale = useLocale()
  const router = useRouter()
  const toast = useToast()
  const [title, setTitle] = useState(clip.title)
  const [hookText, setHookText] = useState(clip.hookText ?? '')
  const [transcriptText, setTranscriptText] = useState(
    clip.transcriptText ?? ''
  )
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null)
  const [socialTab, setSocialTab] = useState<ContentPlatform>('tiktok')
  const [activePanel, setActivePanel] = useState<
    'edit' | 'captions' | 'publish'
  >('edit')
  const draftClip = useMemo(
    () => ({
      ...clip,
      title,
      hookText: hookText || null,
      transcriptText: transcriptText || null
    }),
    [clip, hookText, title, transcriptText]
  )
  const readiness = getClipReadiness(draftClip)
  const platformFit = getPlatformFit(draftClip)
  const caption = buildSocialCaption(draftClip)
  const addHashtags = (text: string) =>
    clip.suggestedHashtags && !text.includes(clip.suggestedHashtags)
      ? `${text}\n\n${clip.suggestedHashtags}`
      : text
  const socialCaptions: Record<ContentPlatform, string> = {
    tiktok: addHashtags(clip.captionTiktok || caption),
    instagram: addHashtags(clip.captionInstagram || caption),
    facebook: addHashtags(clip.captionInstagram || caption),
    youtube: addHashtags(clip.captionYoutube || caption),
    linkedin: caption,
    twitter: addHashtags(clip.captionTiktok || caption)
  }
  const platformLabels: Record<ContentPlatform, string> = {
    tiktok: 'TikTok',
    instagram: 'Instagram',
    facebook: 'Facebook',
    youtube: 'YouTube',
    linkedin: 'LinkedIn',
    twitter: 'X'
  }

  async function save() {
    setBusy('save')
    try {
      const response = await apiFetch(`/api/clips/${clip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, hookText, transcriptText })
      })
      const data = await response.json()
      if (!response.ok) {
        toast.add('error', data.error ?? 'Could not save clip')
        return
      }
      toast.add('success', 'Clip changes saved')
      router.refresh()
    } catch {
      toast.add('error', 'Could not save clip')
    } finally {
      setBusy(null)
    }
  }

  async function copyCaption() {
    await copyText(caption, 'Caption copied')
  }

  async function copyTranscript() {
    await copyText(transcriptText, 'Transcript copied')
  }

  async function copyText(text: string, success: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.add('success', success)
    } catch {
      toast.add(
        'error',
        'Could not copy. Select the text and copy it manually.'
      )
    }
  }

  async function deleteClip() {
    const confirmed = window.confirm('Delete this clip from your workspace?')
    if (!confirmed) return
    setBusy('delete')
    try {
      const response = await apiFetch(`/api/clips/${clip.id}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        toast.add('error', data.error ?? 'Could not delete clip')
        return
      }
      toast.add('success', 'Clip deleted')
      router.push('/dashboard/clips')
      router.refresh()
    } catch {
      toast.add('error', 'Could not delete clip')
    } finally {
      setBusy(null)
    }
  }

  return (
    <aside className="clip-editor-panel">
      <div className="clip-editor-tabs" role="tablist" aria-label="Clip tools">
        {(
          [
            ['edit', FileText, 'Edit'],
            ['captions', Sparkles, 'Captions'],
            ['publish', Gauge, 'Publish']
          ] as const
        ).map(([panel, Icon, label]) => (
          <button
            key={panel}
            type="button"
            role="tab"
            aria-selected={activePanel === panel}
            onClick={() => setActivePanel(panel)}
            className="clip-editor-tab"
          >
            <Icon className="size-4" />
            {label}
            {activePanel === panel && (
              <span className="clip-editor-tab-indicator" />
            )}
          </button>
        ))}
        <Button
          type="button"
          onClick={() => void save()}
          disabled={busy !== null}
          className="ml-auto"
        >
          {busy === 'save' ? (
            <LoadingIndicator className="size-4" />
          ) : (
            <Save className="size-4" />
          )}
          Save
        </Button>
      </div>

      <div key={activePanel} className="clip-editor-panel-content">
        {activePanel === 'edit' && (
          <div className="clip-editor-sections">
            <section>
              <div className="clip-editor-section-heading">
                <div>
                  <span>01</span>
                  <h2>Story</h2>
                </div>
              </div>
              <div className="clip-editor-fields">
                <div>
                  <Label htmlFor="clip-title">Title</Label>
                  <Input
                    id="clip-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={120}
                  />
                  <span className="clip-field-count">{title.length}/120</span>
                </div>
                <div>
                  <Label htmlFor="clip-hook">Opening hook</Label>
                  <Textarea
                    id="clip-hook"
                    value={hookText}
                    onChange={(event) => setHookText(event.target.value)}
                    maxLength={220}
                    rows={2}
                  />
                </div>
              </div>
            </section>
            <section>
              <div className="clip-editor-section-heading">
                <div>
                  <span>02</span>
                  <h2>Transcript</h2>
                </div>
                <Button
                  type="button"
                  onClick={() => void copyTranscript()}
                  disabled={!transcriptText}
                  variant="ghost"
                  size="sm"
                >
                  <Clipboard className="size-3.5" />
                  Copy
                </Button>
              </div>
              <Textarea
                id="clip-subtitles"
                value={transcriptText}
                onChange={(event) => setTranscriptText(event.target.value)}
                maxLength={20000}
                rows={12}
                spellCheck={true}
                placeholder="Add or correct the transcript…"
                className="clip-transcript-field"
              />
            </section>
            <section>
              <div className="clip-editor-section-heading">
                <div>
                  <span>03</span>
                  <h2>Timing</h2>
                </div>
              </div>
              <p className="clip-section-description">
                Open the clip cutter to adjust the timeline, combine multiple
                portions, split sections and export a new cut.
              </p>
              <Button asChild={true} variant="outline" className="mt-4">
                <Link href={`/dashboard/clips/${clip.id}/edit`}>
                  <Scissors className="size-4" />
                  Open clip cutter
                </Link>
              </Button>
            </section>
            <section>
              <div className="clip-editor-section-heading">
                <div>
                  <span>04</span>
                  <h2>Advanced editing</h2>
                </div>
              </div>
              <p className="clip-section-description">
                Open Studio when you need more complex changes such as
                subtitles, layouts, visual styling or detailed timeline edits.
              </p>
              <Button asChild={true} variant="outline" className="mt-4">
                <Link
                  href={`/dashboard/studio?clip=${encodeURIComponent(clip.id)}`}
                >
                  <Sparkles className="size-4" />
                  Open full Studio
                </Link>
              </Button>
            </section>
          </div>
        )}

        {activePanel === 'captions' && (
          <div className="clip-editor-sections">
            <section>
              <div className="clip-editor-section-heading">
                <div>
                  <span>01</span>
                  <h2>Ready-to-post caption</h2>
                </div>
                <Button
                  type="button"
                  onClick={() => void copyCaption()}
                  variant="outline"
                  size="sm"
                >
                  <Clipboard className="size-3.5" />
                  Copy
                </Button>
              </div>
              <div className="clip-caption-copy">{caption}</div>
            </section>
            <section>
              <div className="clip-editor-section-heading">
                <div>
                  <span>02</span>
                  <h2>Platform versions</h2>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void copyText(
                      socialCaptions[socialTab],
                      `${platformLabels[socialTab]} caption copied`
                    )
                  }
                >
                  <Clipboard className="size-3.5" />
                  Copy
                </Button>
              </div>
              <div className="clip-social-tabs">
                {CALENDAR_PLATFORMS.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setSocialTab(tab)}
                    data-active={socialTab === tab}
                  >
                    <PlatformOptionIcon platform={tab} />
                    <span>{platformLabels[tab]}</span>
                  </button>
                ))}
              </div>
              <div className="clip-caption-copy">
                {socialCaptions[socialTab]}
              </div>
            </section>
          </div>
        )}

        {activePanel === 'publish' && (
          <div className="clip-editor-sections">
            <section className="clip-readiness-hero">
              <div>
                <span>Publishing readiness</span>
                <strong>
                  {readiness.score}
                  <small>/100</small>
                </strong>
                <p>{readiness.label}</p>
              </div>
              <div
                className="clip-readiness-ring"
                style={{ '--score': readiness.score } as CSSProperties}
              >
                <span>
                  {readiness.items.filter((item) => item.done).length}/
                  {readiness.items.length}
                </span>
              </div>
            </section>
            <section className="clip-checklist">
              {readiness.items.map((item) => (
                <div key={item.label} data-done={item.done}>
                  <Check className="size-4" />
                  <span>{item.label}</span>
                </div>
              ))}
            </section>
            <section>
              <div className="clip-editor-section-heading">
                <div>
                  <span>Fit</span>
                  <h2>Platform check</h2>
                </div>
              </div>
              <div className="clip-platform-list">
                {platformFit.map((platform) => (
                  <div key={platform.name}>
                    <span className="clip-status-dot" data-fit={platform.fit} />
                    <strong>{platform.name}</strong>
                    <p>{platform.note}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      <footer className="clip-editor-actions">
        <button
          type="button"
          onClick={() => void deleteClip()}
          disabled={busy !== null}
          className="clip-delete-action"
        >
          {busy === 'delete' ? (
            <LoadingIndicator className="size-4" />
          ) : (
            <Trash2 className="size-4" />
          )}
          Delete
        </button>
        <div>
          {clip.fileUrl && (
            <Button asChild={true} variant="outline">
              <a href={clip.fileUrl} download={true}>
                <Download className="size-4" />
                Download
              </a>
            </Button>
          )}
          <Button asChild={true}>
            <Link
              href={`/dashboard/publish/new?clip=${encodeURIComponent(clip.id)}`}
            >
              <Send className="size-4" />
              {locale === 'ro' ? 'Publică clipul' : 'Publish clip'}
            </Link>
          </Button>
        </div>
      </footer>
    </aside>
  )
}
