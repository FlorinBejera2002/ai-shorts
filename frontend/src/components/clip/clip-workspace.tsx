'use client'

import { apiFetch } from '@/lib/auth'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { Link, useRouter } from '@/i18n/navigation'
import {
  Check,
  Clipboard,
  Download,
  Loader2,
  Save,
  Scissors,
  Send,
  Trash2
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { useToast } from '@/components/ui/toast'
import {
  buildSocialCaption,
  getClipReadiness,
  getPlatformFit
} from '@/lib/clip-readiness'

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
  const sections = useTranslations('dashboardSections')
  const router = useRouter()
  const toast = useToast()
  const [title, setTitle] = useState(clip.title)
  const [hookText, setHookText] = useState(clip.hookText ?? '')
  const [transcriptText, setTranscriptText] = useState(
    clip.transcriptText ?? ''
  )
  const [busy, setBusy] = useState<'save' | 'delete' | 'trim' | null>(null)
  const [socialTab, setSocialTab] = useState<
    'tiktok' | 'instagram' | 'youtube'
  >('tiktok')
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(clip.duration)
  const [showTrim, setShowTrim] = useState(false)
  const validTrim =
    Number.isFinite(trimStart) &&
    Number.isFinite(trimEnd) &&
    trimStart >= 0 &&
    trimEnd <= clip.duration &&
    trimEnd - trimStart >= 3

  const socialCaptions = {
    tiktok: clip.captionTiktok,
    instagram: clip.captionInstagram,
    youtube: clip.captionYoutube
  }
  const hasSocialCaptions = Object.values(socialCaptions).some(Boolean)

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

  async function trimClip() {
    if (!validTrim) {
      toast.add('error', 'Choose a range within the clip of at least 3 seconds')
      return
    }
    setBusy('trim')
    try {
      const res = await apiFetch(`/api/clips/${clip.id}/trim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_time: trimStart,
          end_time: trimEnd,
          burn_subtitles: true
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
        toast.add('error', msg || 'Trim failed')
        return
      }
      toast.add('success', 'Clip is being trimmed. Refresh in a moment.')
      setShowTrim(false)
    } catch {
      toast.add('error', 'Could not trim clip')
    } finally {
      setBusy(null)
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
    <aside
      className="media-inspector space-y-4 animate-slide-up"
      style={{ animationDelay: '100ms' }}
    >
      <Card className="block gap-0 py-0 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="section-label">Publishing readiness</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                className="text-2xl font-semibold tabular-nums"
                style={{
                  fontFamily: 'var(--font-cinematic), "Bodoni Moda", serif'
                }}
              >
                {readiness.score}
              </span>
              <span className="text-xs text-muted-foreground">/100</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  readiness.score >= 85
                    ? 'bg-success/10 text-success'
                    : 'bg-primary/10 text-primary'
                }`}
              >
                {readiness.label}
              </span>
            </div>
          </div>
          {clip.viralScore > 0 && (
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">Viral score</p>
              <p className="text-lg font-semibold tabular-nums">
                {clip.viralScore}/10
              </p>
            </div>
          )}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${
              readiness.score >= 85 ? 'bg-success' : 'bg-primary'
            }`}
            style={{ width: `${readiness.score}%` }}
          />
        </div>
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {readiness.items.map((item) => (
            <div
              key={item.label}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs ${
                item.done
                  ? 'bg-success/10 text-success'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <Check className="h-3 w-3" />
              {item.label}
            </div>
          ))}
        </div>
      </Card>

      <Card className="block gap-0 py-0 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="section-label text-primary">Edit subtitles</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Correct transcription mistakes here before copying captions or
              exporting.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => void save()}
            disabled={busy !== null}
            variant="default"
            className="shrink-0 rounded-lg px-3 py-2 text-xs disabled:opacity-50"
          >
            {busy === 'save' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save
          </Button>
        </div>
        <Label
          className="mt-3 block text-xs text-muted-foreground"
          htmlFor="clip-subtitles"
          style={{ fontFamily: 'var(--font-studio), "Manrope", sans-serif' }}
        >
          Subtitle text / transcript
        </Label>
        <Textarea
          id="clip-subtitles"
          value={transcriptText}
          onChange={(event) => setTranscriptText(event.target.value)}
          maxLength={20000}
          rows={12}
          spellCheck={true}
          placeholder="No transcript saved yet. Paste or type corrected subtitle text here."
          className="mt-1 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-[13px] leading-relaxed text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
        />
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
          <span>Saved text is used by transcript copy and caption pack.</span>
          <span className="tabular-nums">{transcriptText.length}/20000</span>
        </div>
      </Card>

      <Card className="block gap-0 py-0 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="section-label">Edit metadata</h2>
          <Button
            type="button"
            onClick={() => void save()}
            disabled={busy !== null}
            variant="default"
            className="rounded-lg px-3 py-2 text-xs disabled:opacity-50"
          >
            {busy === 'save' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save
          </Button>
        </div>
        <Label
          className="mt-3 block text-xs text-muted-foreground"
          htmlFor="clip-title"
          style={{ fontFamily: 'var(--font-studio), "Manrope", sans-serif' }}
        >
          Title
        </Label>
        <Input
          id="clip-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] text-foreground outline-none transition-shadow focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
        />
        <Label
          className="mt-3 block text-xs text-muted-foreground"
          htmlFor="clip-hook"
          style={{ fontFamily: 'var(--font-studio), "Manrope", sans-serif' }}
        >
          Hook
        </Label>
        <Textarea
          id="clip-hook"
          value={hookText}
          onChange={(event) => setHookText(event.target.value)}
          maxLength={220}
          rows={3}
          className="mt-1 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-[13px] text-foreground outline-none transition-shadow focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
        />
      </Card>

      <Card className="block gap-0 py-0 p-4">
        <h2 className="section-label">Studio</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Continue editing this video in Studio.
        </p>
        <Button asChild={true} variant="default">
          <Link
            href={`/dashboard/studio?clip=${encodeURIComponent(clip.id)}`}
            className="mt-3 rounded-lg"
          >
            <Scissors className="h-3.5 w-3.5" />
            Open in Studio →
          </Link>
        </Button>
      </Card>

      <Card className="block gap-0 py-0 p-4">
        <div className="flex items-center justify-between">
          <h2 className="section-label">Trim clip</h2>
          <Button
            type="button"
            onClick={() => setShowTrim(!showTrim)}
            variant="outline"
            className="rounded-lg px-3 py-2 text-xs"
          >
            <Scissors className="h-3 w-3" />
            {showTrim ? 'Hide' : 'Edit'}
          </Button>
        </div>
        {showTrim && (
          <div className="mt-3 space-y-3 animate-slide-down">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label
                  className="text-xs text-muted-foreground"
                  htmlFor="trim-start"
                  style={{
                    fontFamily: 'var(--font-studio), "Manrope", sans-serif'
                  }}
                >
                  Start (s)
                </Label>
                <Input
                  id="trim-start"
                  type="number"
                  step={0.1}
                  min={0}
                  max={clip.duration}
                  value={trimStart}
                  onChange={(e) => setTrimStart(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] text-foreground tabular-nums outline-none transition-shadow focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
                />
              </div>
              <div>
                <Label
                  className="text-xs text-muted-foreground"
                  htmlFor="trim-end"
                  style={{
                    fontFamily: 'var(--font-studio), "Manrope", sans-serif'
                  }}
                >
                  End (s)
                </Label>
                <Input
                  id="trim-end"
                  type="number"
                  step={0.1}
                  min={0}
                  max={clip.duration}
                  value={trimEnd}
                  onChange={(e) => setTrimEnd(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] text-foreground tabular-nums outline-none transition-shadow focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                New duration: {Math.max(0, trimEnd - trimStart).toFixed(1)}s
              </span>
              <span>Original: {clip.duration.toFixed(1)}s</span>
            </div>
            <Button
              type="button"
              onClick={() => void trimClip()}
              disabled={busy !== null || !validTrim}
              variant="default"
              className="w-full rounded-lg text-xs disabled:opacity-40"
            >
              {busy === 'trim' ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Trimming...
                </>
              ) : (
                <>
                  <Scissors className="h-3 w-3" />
                  Trim &amp; re-export
                </>
              )}
            </Button>
          </div>
        )}
      </Card>

      <Card className="block gap-0 py-0 p-4">
        <h2 className="section-label">Caption pack</h2>
        <div className="mt-3 rounded-lg bg-muted/70 p-3 text-[13px] leading-relaxed text-foreground">
          {caption}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void copyCaption()}
            variant="outline"
            className="rounded-lg px-3 py-2 text-xs"
          >
            <Clipboard className="h-3 w-3" />
            Copy caption
          </Button>
          <Button
            type="button"
            onClick={() => void copyTranscript()}
            disabled={!transcriptText}
            variant="outline"
            className="rounded-lg px-3 py-2 text-xs disabled:opacity-40"
          >
            <Clipboard className="h-3 w-3" />
            Copy transcript
          </Button>
        </div>
      </Card>

      {hasSocialCaptions && (
        <Card className="block gap-0 py-0 p-4">
          <h2 className="section-label">AI Social captions</h2>
          <div className="mt-3 flex rounded-lg bg-muted p-1">
            {(['tiktok', 'instagram', 'youtube'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setSocialTab(tab)}
                className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all ${
                  socialTab === tab
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'tiktok'
                  ? 'TikTok'
                  : tab === 'instagram'
                    ? 'Instagram'
                    : 'YouTube'}
              </button>
            ))}
          </div>
          <div className="mt-2 min-h-[60px] rounded-lg bg-muted/70 p-3 text-[13px] leading-relaxed text-foreground">
            {socialCaptions[socialTab] ||
              'No caption generated for this platform'}
          </div>
          {clip.suggestedHashtags && (
            <p className="mt-2 text-xs text-muted-foreground">
              {clip.suggestedHashtags}
            </p>
          )}
          <Button
            type="button"
            onClick={async () => {
              const text = socialCaptions[socialTab]
              if (text) {
                await copyText(
                  text +
                    (clip.suggestedHashtags
                      ? `\n\n${clip.suggestedHashtags}`
                      : ''),
                  `${socialTab} caption copied`
                )
              }
            }}
            variant="outline"
            className="mt-2 rounded-lg px-3 py-2 text-xs"
          >
            <Clipboard className="h-3 w-3" />
            Copy{' '}
            {socialTab === 'tiktok'
              ? 'TikTok'
              : socialTab === 'instagram'
                ? 'Instagram'
                : 'YouTube'}{' '}
            caption
          </Button>
        </Card>
      )}

      <Card className="block gap-0 py-0 p-4">
        <h2 className="section-label">Platform fit</h2>
        <div className="mt-3 space-y-2">
          {platformFit.map((platform) => (
            <div
              key={platform.name}
              className="flex items-start gap-2 rounded-md bg-muted/70 p-2.5"
            >
              <span
                className={`mt-1 h-2 w-2 rounded-full ${
                  platform.fit ? 'bg-success' : 'bg-warning'
                }`}
              />
              <div>
                <div className="text-[13px] font-medium">{platform.name}</div>
                <div className="text-xs text-muted-foreground">
                  {platform.note}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        {clip.fileUrl && (
          <Button asChild={true} variant="default">
            <a href={clip.fileUrl} download={true} className="rounded-lg">
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
          </Button>
        )}
        <Button asChild={true} variant="outline">
          <Link href="/dashboard/publish" className="rounded-lg">
            <Send className="w-3.5 h-3.5" />
            {sections('planPost')}
          </Link>
        </Button>
        <button
          type="button"
          onClick={() => void deleteClip()}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 px-4 py-2.5 text-[13px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          {busy === 'delete' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
          Delete
        </button>
      </div>
    </aside>
  )
}
