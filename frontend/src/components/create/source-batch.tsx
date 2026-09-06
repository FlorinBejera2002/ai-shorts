'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { AlertCircle, CheckCircle2, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback } from 'react'

import { extractYouTubeId } from '@/lib/youtube'

const MAX_URLS = 20

interface SourceBatchProps {
  urls: string[]
  onChange: (urls: string[]) => void
}

export function SourceBatch({ urls, onChange }: SourceBatchProps) {
  const t = useTranslations('create')
  const validCount = urls.filter((u) => extractYouTubeId(u)).length

  const seen = new Map<string, number>()
  const rows = urls.map((url, index) => {
    const id = extractYouTubeId(url)
    let duplicate = false
    if (id) {
      const firstIndex = seen.get(id)
      if (firstIndex === undefined) {
        seen.set(id, index)
      } else {
        duplicate = true
      }
    }
    return { url, id, duplicate }
  })

  const updateUrl = useCallback(
    (index: number, value: string) => {
      // Pasting a multi-line list expands into individual rows
      const pieces = value
        .split(/[\n,;]+/)
        .map((p) => p.trim())
        .filter(Boolean)
      const updated = [...urls]
      if (pieces.length > 1) {
        updated.splice(index, 1, ...pieces)
        onChange(updated.slice(0, MAX_URLS))
      } else {
        updated[index] = value
        onChange(updated)
      }
    },
    [urls, onChange]
  )

  return (
    <div className="mt-5 animate-scale-in space-y-4 border-t border-border pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {t('batchUrls', { count: validCount })}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('batchHint', { max: MAX_URLS })}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => urls.length < MAX_URLS && onChange([...urls, ''])}
          disabled={urls.length >= MAX_URLS}
          variant="outline"
          className="min-h-9 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('addUrl')}
        </Button>
      </div>

      <div className="max-h-80 space-y-2 overflow-y-auto pr-2">
        {rows.map((row, index) => {
          const invalid = row.url.trim().length > 0 && !row.id
          return (
            <div key={index} className="space-y-1">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    aria-label={`${t('youtubeUrl')} ${index + 1}`}
                    value={row.url}
                    onChange={(e) => updateUrl(index, e.target.value)}
                    placeholder={`https://youtube.com/watch?v=... (${index + 1})`}
                    spellCheck={false}
                    aria-invalid={invalid || row.duplicate}
                    className={`w-full rounded-lg border bg-background py-2.5 pl-3 pr-8 text-[13px] text-foreground placeholder:text-muted-foreground/55 transition-all outline-none focus:ring-2 ${
                      invalid || row.duplicate
                        ? 'border-warning/60 focus:border-warning focus:ring-warning/15'
                        : 'border-input focus:border-primary focus:ring-primary/15'
                    }`}
                  />
                  {row.id && !row.duplicate && (
                    <CheckCircle2
                      className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-success"
                      strokeWidth={2}
                    />
                  )}
                </div>
                {urls.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onChange(urls.filter((_, i) => i !== index))}
                    aria-label={t('removeUrl')}
                    className="shrink-0 rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                )}
              </div>
              {(invalid || row.duplicate) && (
                <p className="flex items-center gap-1 pl-1 text-[11px] text-warning">
                  <AlertCircle
                    className="h-3 w-3 shrink-0"
                    strokeWidth={1.75}
                  />
                  {row.duplicate ? t('duplicateUrl') : t('invalidYoutubeUrl')}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
