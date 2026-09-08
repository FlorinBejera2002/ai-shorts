'use client'

import { apiFetch } from '@/lib/auth'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Slider } from '@/components/ui/slider'
import { Switch as ShadcnSwitch } from '@/components/ui/switch'

import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/toast'
import { Link } from '@/i18n/navigation'
import {
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowLeftRight,
  ArrowUpRight,
  Captions,
  Check,
  Copy,
  CornerDownLeft,
  CornerDownRight,
  CornerUpLeft,
  CornerUpRight,
  ImagePlus,
  Loader2,
  Lock,
  Palette,
  Pipette,
  RotateCcw,
  Save,
  Stamp,
  Trash2,
  Upload
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'

type BrandKit = {
  logoUrl: string | null
  primaryColor: string
  secondaryColor: string
  fontFamily: string
  subtitleFont: string
  subtitleColor: string
  subtitleBgColor: string
  subtitleBgOpacity: number
  subtitlePosition: string
  watermarkPosition: string
  watermarkOpacity: number
  hidePlatformBadge: boolean
}

const DEFAULTS: BrandKit = {
  logoUrl: null,
  primaryColor: '#6366f1',
  secondaryColor: '#8b5cf6',
  fontFamily: 'Inter',
  subtitleFont: 'Inter Bold',
  subtitleColor: '#FFFFFF',
  subtitleBgColor: '#000000',
  subtitleBgOpacity: 0.7,
  subtitlePosition: 'bottom',
  watermarkPosition: 'bottom-right',
  watermarkOpacity: 0.8,
  hidePlatformBadge: false
}

const WHITE_LABEL_PLAN = 'agency'
const LOGO_MAX_BYTES = 5 * 1024 * 1024
const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp'
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']

const FONTS = [
  'Inter',
  'Montserrat',
  'Roboto',
  'Poppins',
  'Open Sans',
  'Lato',
  'Oswald',
  'Playfair Display'
]
const SUBTITLE_FONTS = [
  'Inter Bold',
  'Montserrat Bold',
  'Roboto Bold',
  'Poppins Bold',
  'Oswald',
  'Impact'
]

const SUBTITLE_POSITIONS = [
  { value: 'top', label: 'Top', icon: AlignVerticalJustifyStart },
  { value: 'center', label: 'Center', icon: AlignVerticalJustifyCenter },
  { value: 'bottom', label: 'Bottom', icon: AlignVerticalJustifyEnd }
]

const WATERMARK_POSITIONS = [
  { value: 'top-left', label: 'topLeft', icon: CornerUpLeft },
  { value: 'top-right', label: 'topRight', icon: CornerUpRight },
  { value: 'bottom-left', label: 'bottomLeft', icon: CornerDownLeft },
  { value: 'bottom-right', label: 'bottomRight', icon: CornerDownRight }
]

const PALETTES = [
  { name: 'Indigo', primary: '#6366f1', secondary: '#8b5cf6' },
  { name: 'Sunset', primary: '#f97316', secondary: '#ec4899' },
  { name: 'Ocean', primary: '#0ea5e9', secondary: '#06b6d4' },
  { name: 'Cobalt', primary: '#2563eb', secondary: '#60a5fa' },
  { name: 'Berry', primary: '#e11d48', secondary: '#be185d' },
  { name: 'Midnight', primary: '#1e293b', secondary: '#4f46e5' },
  { name: 'Gold', primary: '#d97706', secondary: '#eab308' },
  { name: 'Ember', primary: '#c2410c', secondary: '#fb7185' },
  { name: 'Grape', primary: '#7c3aed', secondary: '#c026d3' },
  { name: 'Slate', primary: '#475569', secondary: '#94a3b8' }
]

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function sameColor(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase()
}

type EyeDropperResult = { sRGBHex: string }
type EyeDropperCtor = new () => { open: () => Promise<EyeDropperResult> }

function ColorField({
  id,
  label,
  value,
  onChange
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const [touched, setTouched] = useState(false)
  const valid = HEX_RE.test(value)
  const showError = touched && !valid
  const supportsEyeDropper =
    typeof window !== 'undefined' && 'EyeDropper' in window

  async function pickColor() {
    try {
      const EyeDropper = (window as unknown as { EyeDropper: EyeDropperCtor })
        .EyeDropper
      const result = await new EyeDropper().open()
      onChange(result.sRGBHex)
    } catch {
      // user cancelled the pick
    }
  }

  async function copyHex() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div>
      <Label className="text-xs text-muted-foreground" htmlFor={id}>
        {label}
      </Label>
      <div className="mt-1 flex items-center gap-1.5">
        <input
          id={id}
          type="color"
          value={valid ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-11 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent p-0.5"
        />
        <Input
          type="text"
          aria-label={`${label} HEX`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          spellCheck={false}
          className={`min-w-[92px] flex-1 rounded-lg border bg-background px-2.5 py-2 text-[13px] font-mono uppercase text-foreground outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-primary/15 ${
            showError
              ? 'border-destructive text-destructive'
              : 'border-input focus-visible:border-primary'
          }`}
        />
        {supportsEyeDropper && (
          <Button
            variant="ghost"
            type="button"
            title="Pick color from screen"
            onClick={() => void pickColor()}
            className="h-auto whitespace-normal flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pipette className="w-3.5 h-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          type="button"
          title="Copy hex code"
          onClick={() => void copyHex()}
          className="h-auto whitespace-normal flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>
      {showError && (
        <p className="mt-1 text-[11px] text-destructive">
          Enter a valid hex color, e.g. #6366F1
        </p>
      )}
    </div>
  )
}

function Switch({
  checked,
  onChange,
  disabled,
  label
}: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <ShadcnSwitch
      checked={checked}
      aria-label={label}
      disabled={disabled}
      onCheckedChange={onChange}
    />
  )
}

export default function BrandPage() {
  const t = useTranslations('brand')
  const common = useTranslations('common')
  const toast = useToast()
  const [kit, setKit] = useState<BrandKit>(DEFAULTS)
  const [plan, setPlan] = useState('free')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canWhiteLabel = plan === WHITE_LABEL_PLAN

  const loadKit = useCallback(async () => {
    try {
      const res = await apiFetch('/api/user/brand')
      const data = await res.json()
      if (data.brandKit) {
        setKit({ ...DEFAULTS, ...data.brandKit })
      }
      if (data.plan) {
        setPlan(data.plan)
      }
    } catch {
      // keep defaults
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadKit()
  }, [loadKit])

  const hasInvalidColor = ![
    kit.primaryColor,
    kit.secondaryColor,
    kit.subtitleColor,
    kit.subtitleBgColor
  ].every((c) => HEX_RE.test(c))

  async function save() {
    if (hasInvalidColor) {
      toast.add('error', t('fixColors'))
      return
    }
    setSaving(true)
    try {
      const brandSettings = {
        primaryColor: kit.primaryColor,
        secondaryColor: kit.secondaryColor,
        fontFamily: kit.fontFamily,
        subtitleFont: kit.subtitleFont,
        subtitleColor: kit.subtitleColor,
        subtitleBgColor: kit.subtitleBgColor,
        subtitleBgOpacity: kit.subtitleBgOpacity,
        subtitlePosition: kit.subtitlePosition,
        watermarkPosition: kit.watermarkPosition,
        watermarkOpacity: kit.watermarkOpacity,
        hidePlatformBadge: kit.hidePlatformBadge
      }
      const res = await apiFetch('/api/user/brand', {
        method: 'PUT',
        body: JSON.stringify(brandSettings),
        headers: { 'Content-Type': 'application/json' }
      })
      if (!res.ok) {
        toast.add('error', t('saveFailed'))
        return
      }
      toast.add('success', t('kitSaved'))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      toast.add('error', t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  function update<K extends keyof BrandKit>(key: K, value: BrandKit[K]) {
    setKit((prev) => ({ ...prev, [key]: value }))
  }

  async function uploadLogo(file: File) {
    if (!LOGO_TYPES.includes(file.type)) {
      toast.add('error', t('useFormats'))
      return
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast.add('error', t('logoTooLarge'))
      return
    }
    setLogoBusy(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await apiFetch('/api/user/brand/logo', {
        method: 'POST',
        body: formData
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
        toast.add('error', msg || t('uploadFailed'))
        return
      }
      update('logoUrl', data.brandKit.logoUrl)
      toast.add('success', t('logoUploaded'))
    } catch {
      toast.add('error', t('uploadFailed'))
    } finally {
      setLogoBusy(false)
    }
  }

  async function removeLogo() {
    setLogoBusy(true)
    try {
      const res = await apiFetch('/api/user/brand/logo', { method: 'DELETE' })
      if (!res.ok) {
        toast.add('error', t('uploadFailed'))
        return
      }
      update('logoUrl', null)
    } catch {
      toast.add('error', t('uploadFailed'))
    } finally {
      setLogoBusy(false)
    }
  }

  function handleLogoDrop(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void uploadLogo(file)
  }

  function swapColors() {
    setKit((prev) => ({
      ...prev,
      primaryColor: prev.secondaryColor,
      secondaryColor: prev.primaryColor
    }))
  }

  if (loading) {
    return (
      <div className="animate-fade-in flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="brand-workspace animate-fade-in">
      <PageHeader
        title={t('title')}
        description={t('desc')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() =>
                setKit((prev) => ({ ...DEFAULTS, logoUrl: prev.logoUrl }))
              }
              variant="outline"
              className="rounded-lg"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {common('reset')}
            </Button>
            <Button
              type="button"
              onClick={() => void save()}
              disabled={saving || hasInvalidColor}
              title={hasInvalidColor ? t('fixColors') : undefined}
              variant="default"
              className="rounded-lg disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : saved ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {saved ? common('saved') : common('save')}
            </Button>
          </div>
        }
      />

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="brand-control-grid grid w-full items-start gap-4 lg:grid-cols-2">
          <Card as="section" className="block gap-0 py-0 space-y-4 p-5">
            <div className="flex items-center gap-2">
              <ImagePlus className="h-4 w-4 text-primary" />
              <h2 className="section-label">{t('logo')}</h2>
            </div>
            <p className="text-xs text-muted-foreground">{t('logoDesc')}</p>

            <input
              ref={fileInputRef}
              type="file"
              accept={LOGO_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void uploadLogo(file)
                e.target.value = ''
              }}
            />

            {kit.logoUrl ? (
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-border bg-[repeating-conic-gradient(#00000014_0_25%,transparent_0_50%)] bg-[length:12px_12px] p-2">
                  <img
                    src={kit.logoUrl}
                    alt={t('yourLogo')}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Button
                    type="button"
                    disabled={logoBusy}
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    className="min-h-9 rounded-lg px-3 text-[11px] disabled:opacity-50"
                  >
                    <Upload className="w-3 h-3" />
                    {t('replace')}
                  </Button>
                  <Button
                    variant="ghost"
                    type="button"
                    disabled={logoBusy}
                    onClick={() => void removeLogo()}
                    className="h-auto whitespace-normal inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-destructive/30 px-3 text-[11px] font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3" />
                    {t('remove')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                type="button"
                disabled={logoBusy}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragActive(true)
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleLogoDrop}
                className={`flex h-auto min-h-32 w-full whitespace-normal flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
                  dragActive
                    ? 'border-primary bg-primary/5'
                    : 'border-input hover:bg-muted/70'
                }`}
              >
                {logoBusy ? (
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                ) : (
                  <ImagePlus className="w-5 h-5 text-muted-foreground" />
                )}
                <span className="text-xs font-medium">{t('clickOrDrag')}</span>
                <span className="text-[11px] text-muted-foreground">
                  {t('logoFormats')}
                </span>
              </Button>
            )}
          </Card>

          <Card as="section" className="block gap-0 py-0 space-y-4 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" />
                <h2 className="section-label">{t('colors')}</h2>
              </div>
              <Button
                variant="ghost"
                type="button"
                onClick={swapColors}
                title={t('swap')}
                className="h-auto whitespace-normal inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                {t('swap')}
              </Button>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">
                {t('palettePresets')}
              </Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {PALETTES.map((p) => {
                  const active =
                    sameColor(kit.primaryColor, p.primary) &&
                    sameColor(kit.secondaryColor, p.secondary)
                  return (
                    <Button
                      variant="ghost"
                      key={p.name}
                      type="button"
                      title={p.name}
                      onClick={() =>
                        setKit((prev) => ({
                          ...prev,
                          primaryColor: p.primary,
                          secondaryColor: p.secondary
                        }))
                      }
                      className={`relative h-9 w-9 rounded-full transition-transform hover:scale-110 ${
                        active
                          ? 'ring-2 ring-primary ring-offset-2 ring-offset-card'
                          : ''
                      }`}
                      style={{
                        background: `linear-gradient(135deg, ${p.primary} 50%, ${p.secondary} 50%)`
                      }}
                    >
                      {active && (
                        <Check className="absolute inset-0 m-auto w-3.5 h-3.5 text-white drop-shadow" />
                      )}
                    </Button>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-3">
              <ColorField
                id="primary-color"
                label={t('primary')}
                value={kit.primaryColor}
                onChange={(v) => update('primaryColor', v)}
              />
              <ColorField
                id="secondary-color"
                label={t('secondary')}
                value={kit.secondaryColor}
                onChange={(v) => update('secondaryColor', v)}
              />
            </div>

            <div>
              <Label
                className="text-xs text-muted-foreground"
                htmlFor="font-family"
              >
                {t('fontFamily')}
              </Label>
              <NativeSelect
                id="font-family"
                value={kit.fontFamily}
                onChange={(e) => update('fontFamily', e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
              >
                {FONTS.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: f }}>
                    {f}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </Card>

          <Card
            as="section"
            className="block gap-0 py-0 space-y-4 p-5 lg:col-span-2"
          >
            <div className="flex items-center gap-2">
              <Captions className="h-4 w-4 text-primary" />
              <h2 className="section-label">{t('subtitleStyle')}</h2>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-4">
                <div className="grid gap-3">
                  <ColorField
                    id="sub-color"
                    label={t('textColor')}
                    value={kit.subtitleColor}
                    onChange={(v) => update('subtitleColor', v)}
                  />
                  <ColorField
                    id="sub-bg"
                    label={t('background')}
                    value={kit.subtitleBgColor}
                    onChange={(v) => update('subtitleBgColor', v)}
                  />
                </div>

                <div>
                  <Label
                    className="text-xs text-muted-foreground"
                    htmlFor="sub-font"
                  >
                    {t('subtitleFont')}
                  </Label>
                  <NativeSelect
                    id="sub-font"
                    value={kit.subtitleFont}
                    onChange={(e) => update('subtitleFont', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
                  >
                    {SUBTITLE_FONTS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-xs text-muted-foreground">
                      {t('bgOpacity')}
                    </span>
                    <span className="tabular-nums text-xs">
                      {Math.round(kit.subtitleBgOpacity * 100)}%
                    </span>
                  </div>
                  <Slider
                    aria-label={t('bgOpacity')}
                    min={0}
                    max={100}
                    value={[Math.round(kit.subtitleBgOpacity * 100)]}
                    onValueChange={([
                      value = Math.round(kit.subtitleBgOpacity * 100)
                    ]) => update('subtitleBgOpacity', value / 100)}
                    className="mt-1 w-full"
                  />
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">
                    {t('position')}
                  </Label>
                  <div className="mt-1 grid grid-cols-3 gap-1.5">
                    {SUBTITLE_POSITIONS.map(({ value, icon: Icon }) => (
                      <Button
                        variant="ghost"
                        key={value}
                        type="button"
                        onClick={() => update('subtitlePosition', value)}
                        className={`flex h-auto min-h-12 flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                          kit.subtitlePosition === value
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {t(value as 'top' | 'center' | 'bottom')}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card
            as="section"
            className="block gap-0 py-0 space-y-4 p-5 lg:col-span-2"
          >
            <div className="flex items-center gap-2">
              <Stamp className="h-4 w-4 text-primary" />
              <h2 className="section-label">{t('watermark')}</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('watermarkDesc')}
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label className="text-xs text-muted-foreground">
                  {t('position')}
                </Label>
                <div className="mt-1 grid grid-cols-2 gap-1.5">
                  {WATERMARK_POSITIONS.map(({ value, label, icon: Icon }) => (
                    <Button
                      variant="ghost"
                      key={value}
                      type="button"
                      onClick={() => update('watermarkPosition', value)}
                      className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                        kit.watermarkPosition === value
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {t(label)}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-xs text-muted-foreground">
                    {t('opacity')}
                  </span>
                  <span className="tabular-nums text-xs">
                    {Math.round(kit.watermarkOpacity * 100)}%
                  </span>
                </div>
                <Slider
                  aria-label={t('opacity')}
                  min={10}
                  max={100}
                  value={[Math.round(kit.watermarkOpacity * 100)]}
                  onValueChange={([
                    value = Math.round(kit.watermarkOpacity * 100)
                  ]) => update('watermarkOpacity', value / 100)}
                  className="mt-3 w-full"
                />
              </div>

              <Card className="block gap-0 py-0 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    {!canWhiteLabel && (
                      <Lock className="w-3 h-3 text-muted-foreground" />
                    )}
                    {t('platformBadge')}
                  </div>
                  <Switch
                    checked={!canWhiteLabel || !kit.hidePlatformBadge}
                    disabled={!canWhiteLabel}
                    label={t('platformBadge')}
                    onChange={(value) => update('hidePlatformBadge', !value)}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {canWhiteLabel ? t('badgeOnDesc') : t('badgeLockedDesc')}
                </p>
                {!canWhiteLabel && (
                  <Link
                    href="/dashboard/billing"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                  >
                    {t('upgradeAgency')}
                    <ArrowUpRight className="w-3 h-3" />
                  </Link>
                )}
              </Card>
            </div>
          </Card>
        </div>

        <aside className="brand-inspector w-full xl:sticky xl:top-24">
          <Card className="block gap-0 py-0 p-5">
            <div className="mb-4">
              <p className="section-label">{t('preview')}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('previewLive')}
              </p>
            </div>
            <div className="mx-auto max-w-[240px] rounded-[28px] border-4 border-white/[0.04] bg-black p-1.5 shadow-2xl shadow-black/60">
              <div
                className="aspect-[9/16] rounded-[20px] overflow-hidden relative"
                style={{ backgroundColor: kit.primaryColor + '20' }}
              >
                <div
                  className={`absolute left-2 right-2 flex justify-center ${
                    kit.subtitlePosition === 'top'
                      ? 'top-4'
                      : kit.subtitlePosition === 'center'
                        ? 'top-1/2 -translate-y-1/2'
                        : 'bottom-4'
                  }`}
                >
                  <span
                    className="px-3 py-1.5 rounded-md text-xs font-semibold text-center"
                    style={{
                      color: kit.subtitleColor,
                      backgroundColor:
                        kit.subtitleBgColor +
                        Math.round(kit.subtitleBgOpacity * 255)
                          .toString(16)
                          .padStart(2, '0'),
                      fontFamily: kit.subtitleFont.split(' ')[0]
                    }}
                  >
                    {t('sampleSubtitle')}
                  </span>
                </div>

                <div
                  className={`absolute ${
                    kit.watermarkPosition === 'top-left'
                      ? 'top-2 left-2'
                      : kit.watermarkPosition === 'top-right'
                        ? 'top-2 right-2'
                        : kit.watermarkPosition === 'bottom-left'
                          ? 'bottom-2 left-2'
                          : 'bottom-2 right-2'
                  }`}
                  style={{ opacity: kit.watermarkOpacity }}
                >
                  {kit.logoUrl ? (
                    <img
                      src={kit.logoUrl}
                      alt={t('yourLogo')}
                      className="h-6 max-w-[56px] object-contain"
                    />
                  ) : (
                    <span
                      className="text-[10px] font-bold"
                      style={{ color: kit.primaryColor }}
                    >
                      {t('yourLogo')}
                    </span>
                  )}
                </div>

                {(!canWhiteLabel || !kit.hidePlatformBadge) && (
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-semibold text-white/60">
                    {t('madeWithSneepcut')}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  )
}
