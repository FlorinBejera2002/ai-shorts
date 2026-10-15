import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  CAPTION_PRESETS,
  type CaptionFont,
  type CaptionStyle
} from './caption-style'
import { ColorField } from './color-field'
import { browserFontFamily, loadCaptionFont } from './caption-fonts'
import { CaptionSpacingControls } from './caption-spacing-controls'

export function CaptionStyleEditor({
  value,
  onChange
}: {
  value: CaptionStyle
  onChange: (value: CaptionStyle) => void
}) {
  const t = useTranslations('brand'),
    [fonts, setFonts] = useState<CaptionFont[]>([]),
    [search, setSearch] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmed, setConfirmed] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let active = true
    void apiFetch('/api/user/brand/fonts')
      .then(async (r) => {
        if (!r.ok) throw Error()
        const data = await r.json()
        if (active) setFonts(data.fonts)
      })
      .catch(() => {
        if (active) setError(t('fontLoadError'))
      })
    return () => {
      active = false
    }
  }, [t])
  const selected = fonts.find((f) => f.id === value.font_id)
  const update = <K extends keyof CaptionStyle>(key: K, v: CaptionStyle[K]) =>
    onChange({ ...value, [key]: v })
  async function upload(file?: File) {
    if (!file || busy) return
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await apiFetch(
        `/api/user/brand/fonts?license_confirmed=${confirmed}`,
        { method: 'POST', body: form }
      )
      const data = await r.json()
      if (!r.ok) throw Error(data.error || t('fontUploadError'))
      setFonts((f) => [...f, data.font])
      onChange({
        ...value,
        font_id: data.font.id,
        weight: data.font.weights[0]
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : t('fontUploadError'))
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    if (!selected || selected.category !== 'custom' || busy) return
    setBusy(true)
    setError('')
    try {
      const r = await apiFetch(`/api/user/brand/fonts?id=${selected.id}`, {
        method: 'DELETE'
      })
      if (!r.ok) throw Error()
      setFonts((fs) =>
        fs.map((f) => (f.id === selected.id ? { ...f, archived: true } : f))
      )
      onChange({ ...value, font_id: 'builtin:inter', weight: 700 })
    } catch {
      setError(t('fontUploadError'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid gap-4 [--primary:var(--foreground)] [--primary-foreground:var(--background)] [--accent:var(--muted)]">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {CAPTION_PRESETS.map((p) => (
          <Button
            type="button"
            key={p}
            variant={value.preset === p ? 'default' : 'outline'}
            aria-pressed={value.preset === p}
            className="h-auto min-h-10 whitespace-normal px-2 py-2 text-xs"
            onClick={() => update('preset', p)}
          >
            {t(`preset_${p}`)}
          </Button>
        ))}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="caption-font-search">{t('subtitleFont')}</Label>
        <input
          id="caption-font-search"
          type="search"
          value={search}
          placeholder={t('fontSearch')}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div
          role="listbox"
          aria-label={t('subtitleFont')}
          className="max-h-40 overflow-y-auto rounded-md border"
        >
          {fonts
            .filter(
              (f) =>
                (!f.archived || f.id === value.font_id) &&
                `${f.family} ${f.category}`
                  .toLowerCase()
                  .includes(search.toLowerCase())
            )
            .map((f) => (
              <button
                type="button"
                role="option"
                aria-selected={value.font_id === f.id}
                key={f.id}
                onFocus={() =>
                  void loadCaptionFont(
                    f.id,
                    f.weights.includes(value.weight)
                      ? value.weight
                      : f.weights[0]!
                  ).catch(() => {})
                }
                onMouseEnter={() =>
                  void loadCaptionFont(
                    f.id,
                    f.weights.includes(value.weight)
                      ? value.weight
                      : f.weights[0]!
                  ).catch(() => {})
                }
                onClick={() =>
                  onChange({
                    ...value,
                    font_id: f.id,
                    weight: f.weights.includes(value.weight)
                      ? value.weight
                      : f.weights[0]!
                  })
                }
                className={`block w-full px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${value.font_id === f.id ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
                style={{
                  fontFamily: browserFontFamily(
                    f.id,
                    f.weights.includes(value.weight)
                      ? value.weight
                      : f.weights[0]!
                  )
                }}
              >
                {f.family}
                {f.archived ? ` · ${t('fontArchived')}` : ''}
              </button>
            ))}
        </div>
        <Label className="flex items-center gap-2">
          {t('fontWeight')}
          <select
            aria-label={t('fontWeight')}
            className="rounded-md border bg-background p-2"
            value={value.weight}
            onChange={(e) => update('weight', Number(e.target.value))}
          >
            {(selected?.weights ?? [value.weight]).map((w) => (
              <option key={w} value={w}>
                {w % 100 === 0 ? t(`fontWeight_${w}`) : selected?.style || w} · {w}
              </option>
            ))}
          </select>
        </Label>
      </div>
      <CaptionSpacingControls value={value} onChange={onChange} />
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {t('customFont')}
        </summary>
        <div className="mt-3 grid gap-3">
          <p className="text-xs text-muted-foreground">{t('customFontHint')}</p>
          <label className="flex gap-2 text-xs">
            <Switch
              checked={confirmed}
              onCheckedChange={setConfirmed}
              aria-label={t('fontPermission')}
            />
            {t('fontPermission')}
          </label>
          <input
            ref={input}
            type="file"
            accept=".ttf,.otf"
            className="sr-only"
            aria-label={t('customFont')}
            onChange={(e) => {
              void upload(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!confirmed || busy}
              onClick={() => input.current?.click()}
            >
              {busy
                ? t('fontLoading')
                : selected?.category === 'custom'
                  ? t('replace')
                  : t('fontUpload')}
            </Button>
            {selected?.category === 'custom' && !selected.archived && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void remove()}
              >
                {t('remove')}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t('fontRetention')}</p>
          {selected?.romanian === false && (
            <p className="text-xs text-destructive">
              {t('fontRomanianMissing')}
            </p>
          )}
        </div>
      </details>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <ColorField
          id="caption-text"
          label={t('textColor')}
          value={value.text_color}
          onChange={(v) => update('text_color', v)}
        />
        <ColorField
          id="caption-outline"
          label={t('outlineColor')}
          value={value.outline_color}
          onChange={(v) => update('outline_color', v)}
        />
        <ColorField
          id="caption-background"
          label={t('background')}
          value={value.background_color}
          onChange={(v) => update('background_color', v)}
        />
        <ColorField
          id="caption-highlight"
          label={t('highlightColor')}
          value={value.highlight_color}
          onChange={(v) => update('highlight_color', v)}
        />
      </div>
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {t('captionAdjust')}
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {(
            [
              ['size', 'captionSize', 0.02, 0.16, 0.005],
              ['max_width', 'captionWidth', 0.2, 0.96, 0.01],
              ['max_lines', 'captionLines', 1, 3, 1],
              ['outline', 'captionOutline', 0, 8, 0.5],
              ['shadow', 'captionShadow', 0, 8, 0.5],
              ['background_opacity', 'bgOpacity', 0, 1, 0.05]
            ] as const
          ).map(([key, label, min, max, step]) => (
            <label key={key} className="grid gap-1 text-xs">
              {t(label)}
              <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={value[key]}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (Number.isFinite(n))
                    update(key, Math.max(min, Math.min(max, n)))
                }}
                className="rounded-md border bg-background p-2 focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          ))}
          <label className="grid gap-1 text-xs">
            {t('captionAlign')}
            <select
              value={value.align}
              onChange={(e) =>
                update('align', e.target.value as CaptionStyle['align'])
              }
              className="rounded-md border bg-background p-2"
            >
              {(['left', 'center', 'right'] as const).map((v) => (
                <option key={v} value={v}>
                  {t(`align_${v}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>
      <div className="flex flex-wrap items-end gap-2">
        {(['x', 'y'] as const).map((axis) => (
          <label key={axis} className="grid gap-1 text-xs">
            {t(axis === 'x' ? 'captionX' : 'captionY')}
            <input
              type="number"
              min="0"
              max="100"
              value={Math.round(value.position[axis] * 100)}
              className="w-20 rounded-md border bg-background p-2"
              onChange={(e) =>
                update('position', {
                  ...value.position,
                  [axis]: Math.max(0, Math.min(1, Number(e.target.value) / 100))
                })
              }
            />
          </label>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            update('position', { x: 0.5, y: 0.84, anchor: 'center' })
          }
        >
          {t('resetPosition')}
        </Button>
      </div>
    </div>
  )
}
