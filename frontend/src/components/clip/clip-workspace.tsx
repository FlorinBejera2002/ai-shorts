'use client'

import { useMemo, useState } from 'react'
import { useRouter, Link } from '@/i18n/navigation'
import {
  Check,
  Clipboard,
  Download,
  Loader2,
  Save,
  Scissors,
  Send,
  Trash2,
} from 'lucide-react'

import {
  buildSocialCaption,
  getClipReadiness,
  getPlatformFit,
} from '@/lib/clip-readiness'
import { useToast } from '@/components/ui/toast'

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
  const router = useRouter()
  const toast = useToast()
  const [title, setTitle] = useState(clip.title)
  const [hookText, setHookText] = useState(clip.hookText ?? '')
  const [transcriptText, setTranscriptText] = useState(clip.transcriptText ?? '')
  const [busy, setBusy] = useState<'save' | 'delete' | 'trim' | null>(null)
  const [socialTab, setSocialTab] = useState<'tiktok' | 'instagram' | 'youtube'>('tiktok')
  const [trimStart, setTrimStart] = useState(clip.duration > 0 ? 0 : 0)
  const [trimEnd, setTrimEnd] = useState(clip.duration)
  const [showTrim, setShowTrim] = useState(false)

  const socialCaptions = {
    tiktok: clip.captionTiktok,
    instagram: clip.captionInstagram,
    youtube: clip.captionYoutube,
  }
  const hasSocialCaptions = Object.values(socialCaptions).some(Boolean)

  const draftClip = useMemo(
    () => ({
      ...clip,
      title,
      hookText: hookText || null,
      transcriptText: transcriptText || null,
    }),
    [clip, hookText, title, transcriptText],
  )
  const readiness = getClipReadiness(draftClip)
  const platformFit = getPlatformFit(draftClip)
  const caption = buildSocialCaption(draftClip)

  async function save() {
    setBusy('save')
    try {
      const response = await fetch(`/api/clips/${clip.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, hookText, transcriptText }),
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
    await navigator.clipboard.writeText(caption)
    toast.add('success', 'Caption copied')
  }

  async function copyTranscript() {
    await navigator.clipboard.writeText(transcriptText)
    toast.add('success', 'Transcript copied')
  }

  async function trimClip() {
    if (trimEnd - trimStart < 3) {
      toast.add('error', 'Trimmed clip must be at least 3 seconds')
      return
    }
    setBusy('trim')
    try {
      const res = await fetch(`/api/clips/${clip.id}/trim`, {
        method: 'POST',
        body: JSON.stringify({
          start_time: trimStart,
          end_time: trimEnd,
          burn_subtitles: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.add('error', data.error ?? data.detail ?? 'Trim failed')
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
      const response = await fetch(`/api/clips/${clip.id}`, { method: 'DELETE' })
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
    <aside className="space-y-4 animate-slide-up" style={{ animationDelay: '100ms' }}>
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Publishing readiness
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {readiness.score}
              </span>
              <span className="text-xs text-muted-foreground">/100</span>
              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {readiness.label}
              </span>
            </div>
          </div>
          {clip.viralScore > 0 && (
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">Viral score</p>
              <p className="text-lg font-semibold tabular-nums">{clip.viralScore}/10</p>
            </div>
          )}
        </div>
        <div className="mt-3 progress-bar h-1.5">
          <div className="progress-bar-fill done" style={{ width: `${readiness.score}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {readiness.items.map((item) => (
            <div
              key={item.label}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs ${
                item.done ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
              }`}
            >
              <Check className="h-3 w-3" />
              {item.label}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-primary/40 bg-card p-4 shadow-sm shadow-primary/5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">
              Edit subtitles
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Correct transcription mistakes here before copying captions or exporting.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy !== null}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy === 'save' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save
          </button>
        </div>
        <label className="mt-3 block text-xs text-muted-foreground" htmlFor="clip-subtitles">
          Subtitle text / transcript
        </label>
        <textarea
          id="clip-subtitles"
          value={transcriptText}
          onChange={(event) => setTranscriptText(event.target.value)}
          maxLength={20000}
          rows={12}
          spellCheck={true}
          placeholder="No transcript saved yet. Paste or type corrected subtitle text here."
          className="mt-1 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-[13px] leading-relaxed"
        />
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
          <span>Saved text is used by transcript copy and caption pack.</span>
          <span className="tabular-nums">{transcriptText.length}/20000</span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Edit metadata
          </h2>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy === 'save' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save
          </button>
        </div>
        <label className="mt-3 block text-xs text-muted-foreground" htmlFor="clip-title">
          Title
        </label>
        <input
          id="clip-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px]"
        />
        <label className="mt-3 block text-xs text-muted-foreground" htmlFor="clip-hook">
          Hook
        </label>
        <textarea
          id="clip-hook"
          value={hookText}
          onChange={(event) => setHookText(event.target.value)}
          maxLength={220}
          rows={3}
          className="mt-1 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-[13px]"
        />
      </div>

      <div className="rounded-lg border border-primary/20 bg-card p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Timeline editor
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Adjust segment boundaries, reorder clips, and re-export with the visual timeline editor.
        </p>
        <Link
          href={`/dashboard/clips/${clip.id}/edit`}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Scissors className="h-3.5 w-3.5" />
          Edit on timeline →
        </Link>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Trim clip
          </h2>
          <button
            type="button"
            onClick={() => setShowTrim(!showTrim)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <Scissors className="h-3 w-3" />
            {showTrim ? 'Hide' : 'Edit'}
          </button>
        </div>
        {showTrim && (
          <div className="mt-3 space-y-3 animate-slide-down">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground" htmlFor="trim-start">
                  Start (s)
                </label>
                <input
                  id="trim-start"
                  type="number"
                  step={0.1}
                  min={0}
                  max={clip.duration}
                  value={trimStart}
                  onChange={(e) => setTrimStart(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] tabular-nums"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground" htmlFor="trim-end">
                  End (s)
                </label>
                <input
                  id="trim-end"
                  type="number"
                  step={0.1}
                  min={0}
                  max={clip.duration}
                  value={trimEnd}
                  onChange={(e) => setTrimEnd(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] tabular-nums"
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>New duration: {Math.max(0, trimEnd - trimStart).toFixed(1)}s</span>
              <span>Original: {clip.duration.toFixed(1)}s</span>
            </div>
            <button
              type="button"
              onClick={() => void trimClip()}
              disabled={busy !== null || trimEnd - trimStart < 3}
              className="w-full rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
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
            </button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Caption pack
        </h2>
        <div className="mt-3 rounded-lg bg-muted/60 p-3 text-[13px] leading-relaxed text-foreground">
          {caption}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyCaption()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <Clipboard className="h-3 w-3" />
            Copy caption
          </button>
          <button
            type="button"
            onClick={() => void copyTranscript()}
            disabled={!transcriptText}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-40"
          >
            <Clipboard className="h-3 w-3" />
            Copy transcript
          </button>
        </div>
      </div>

      {hasSocialCaptions && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            AI Social captions
          </h2>
          <div className="mt-3 flex rounded-lg bg-muted p-0.5">
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
                {tab === 'tiktok' ? 'TikTok' : tab === 'instagram' ? 'Instagram' : 'YouTube'}
              </button>
            ))}
          </div>
          <div className="mt-2 rounded-lg bg-muted/60 p-3 text-[13px] leading-relaxed text-foreground min-h-[60px]">
            {socialCaptions[socialTab] || 'No caption generated for this platform'}
          </div>
          {clip.suggestedHashtags && (
            <p className="mt-2 text-xs text-muted-foreground">{clip.suggestedHashtags}</p>
          )}
          <button
            type="button"
            onClick={async () => {
              const text = socialCaptions[socialTab]
              if (text) {
                await navigator.clipboard.writeText(text + (clip.suggestedHashtags ? `\n\n${clip.suggestedHashtags}` : ''))
                toast.add('success', `${socialTab} caption copied`)
              }
            }}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <Clipboard className="h-3 w-3" />
            Copy {socialTab === 'tiktok' ? 'TikTok' : socialTab === 'instagram' ? 'Instagram' : 'YouTube'} caption
          </button>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Platform fit
        </h2>
        <div className="mt-3 space-y-2">
          {platformFit.map((platform) => (
            <div key={platform.name} className="flex items-start gap-2 rounded-md bg-muted/50 p-2">
              <span
                className={`mt-1 h-2 w-2 rounded-full ${
                  platform.fit ? 'bg-success' : 'bg-warning'
                }`}
              />
              <div>
                <div className="text-[13px] font-medium">{platform.name}</div>
                <div className="text-xs text-muted-foreground">{platform.note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {clip.fileUrl && (
          <a
            href={clip.fileUrl}
            download={true}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </a>
        )}
        <Link
          href="/dashboard/publish"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-[13px] font-medium hover:bg-muted"
        >
          <Send className="w-3.5 h-3.5" />
          Publish
        </Link>
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
