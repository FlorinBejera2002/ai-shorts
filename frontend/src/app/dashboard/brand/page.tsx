'use client'

import { useToast } from '@/components/ui/toast'
import {
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowLeftRight,
  Captions,
  Check,
  Copy,
  CornerDownLeft,
  CornerDownRight,
  CornerUpLeft,
  CornerUpRight,
  Loader2,
  Palette,
  Pipette,
  RotateCcw,
  Save,
  Stamp
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

type BrandKit = {
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
}

const DEFAULTS: BrandKit = {
  primaryColor: '#6366f1',
  secondaryColor: '#8b5cf6',
  fontFamily: 'Inter',
  subtitleFont: 'Inter Bold',
  subtitleColor: '#FFFFFF',
  subtitleBgColor: '#000000',
  subtitleBgOpacity: 0.7,
  subtitlePosition: 'bottom',
  watermarkPosition: 'bottom-right',
  watermarkOpacity: 0.8
}

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
  { value: 'top-left', label: 'Top left', icon: CornerUpLeft },
  { value: 'top-right', label: 'Top right', icon: CornerUpRight },
  { value: 'bottom-left', label: 'Bottom left', icon: CornerDownLeft },
  { value: 'bottom-right', label: 'Bottom right', icon: CornerDownRight }
]

const PALETTES = [
  { name: 'Indigo', primary: '#6366f1', secondary: '#8b5cf6' },
  { name: 'Sunset', primary: '#f97316', secondary: '#ec4899' },
  { name: 'Ocean', primary: '#0ea5e9', secondary: '#06b6d4' },
  { name: 'Forest', primary: '#16a34a', secondary: '#84cc16' },
  { name: 'Berry', primary: '#e11d48', secondary: '#be185d' },
  { name: 'Midnight', primary: '#1e293b', secondary: '#4f46e5' },
  { name: 'Gold', primary: '#d97706', secondary: '#eab308' },
  { name: 'Mint', primary: '#10b981', secondary: '#5eead4' },
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
      <label className="text-xs text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <div className="mt-1 flex items-center gap-1.5">
        <input
          id={id}
          type="color"
          value={valid ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 shrink-0 rounded-lg border border-input cursor-pointer bg-transparent p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          spellCheck={false}
          className={`min-w-[92px] flex-1 rounded-lg border bg-background px-2.5 py-2 text-[13px] font-mono uppercase ${
            showError ? 'border-red-500/70 text-red-500' : 'border-input'
          }`}
        />
        {supportsEyeDropper && (
          <button
            type="button"
            title="Pick color from screen"
            onClick={() => void pickColor()}
            className="shrink-0 rounded-lg border border-input p-2 hover:bg-muted transition-colors"
          >
            <Pipette className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          title="Copy hex code"
          onClick={() => void copyHex()}
          className="shrink-0 rounded-lg border border-input p-2 hover:bg-muted transition-colors"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
      {showError && (
        <p className="mt-1 text-[11px] text-red-500">
          Enter a valid hex color, e.g. #6366F1
        </p>
      )}
    </div>
  )
}

export default function BrandPage() {
  const toast = useToast()
  const [kit, setKit] = useState<BrandKit>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const loadKit = useCallback(async () => {
    try {
      const res = await fetch('/api/user/brand')
      const data = await res.json()
      if (data.brandKit) {
        setKit({ ...DEFAULTS, ...data.brandKit })
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
      toast.add('error', 'Fix the invalid color codes before saving')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/user/brand', {
        method: 'PUT',
        body: JSON.stringify(kit),
        headers: { 'Content-Type': 'application/json' }
      })
      if (!res.ok) {
        toast.add('error', 'Could not save brand kit')
        return
      }
      toast.add('success', 'Brand kit saved')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      toast.add('error', 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function update<K extends keyof BrandKit>(key: K, value: BrandKit[K]) {
    setKit((prev) => ({ ...prev, [key]: value }))
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
    <div className="animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Brand Kit</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Colors, fonts, and watermark settings applied to your clips
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setKit(DEFAULTS)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || hasInvalidColor}
            title={hasInvalidColor ? 'Fix invalid colors first' : undefined}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : saved ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-col xl:flex-row gap-4 items-start">
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 items-start w-full">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-[13px] font-semibold">Colors</h2>
              </div>
              <button
                type="button"
                onClick={swapColors}
                title="Swap primary and secondary"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Swap
              </button>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">
                Palette presets
              </label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {PALETTES.map((p) => {
                  const active =
                    sameColor(kit.primaryColor, p.primary) &&
                    sameColor(kit.secondaryColor, p.secondary)
                  return (
                    <button
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
                          ? 'ring-2 ring-offset-2 ring-offset-card ring-primary'
                          : ''
                      }`}
                      style={{
                        background: `linear-gradient(135deg, ${p.primary} 50%, ${p.secondary} 50%)`
                      }}
                    >
                      {active && (
                        <Check className="absolute inset-0 m-auto w-3.5 h-3.5 text-white drop-shadow" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ColorField
                id="primary-color"
                label="Primary"
                value={kit.primaryColor}
                onChange={(v) => update('primaryColor', v)}
              />
              <ColorField
                id="secondary-color"
                label="Secondary"
                value={kit.secondaryColor}
                onChange={(v) => update('secondaryColor', v)}
              />
            </div>

            <div>
              <label
                className="text-xs text-muted-foreground"
                htmlFor="font-family"
              >
                Font family
              </label>
              <select
                id="font-family"
                value={kit.fontFamily}
                onChange={(e) => update('fontFamily', e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-[13px]"
              >
                {FONTS.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: f }}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Captions className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-[13px] font-semibold">Subtitle style</h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ColorField
                id="sub-color"
                label="Text color"
                value={kit.subtitleColor}
                onChange={(v) => update('subtitleColor', v)}
              />
              <ColorField
                id="sub-bg"
                label="Background"
                value={kit.subtitleBgColor}
                onChange={(v) => update('subtitleBgColor', v)}
              />
            </div>

            <div>
              <label
                className="text-xs text-muted-foreground"
                htmlFor="sub-font"
              >
                Subtitle font
              </label>
              <select
                id="sub-font"
                value={kit.subtitleFont}
                onChange={(e) => update('subtitleFont', e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-[13px]"
              >
                {SUBTITLE_FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-xs text-muted-foreground">
                  Background opacity
                </span>
                <span className="tabular-nums text-xs">
                  {Math.round(kit.subtitleBgOpacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(kit.subtitleBgOpacity * 100)}
                onChange={(e) =>
                  update('subtitleBgOpacity', Number(e.target.value) / 100)
                }
                className="mt-1 w-full"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Position</label>
              <div className="mt-1 grid grid-cols-3 gap-1.5">
                {SUBTITLE_POSITIONS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => update('subtitlePosition', value)}
                    className={`flex flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                      kit.subtitlePosition === value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-4 lg:col-span-2">
            <div className="flex items-center gap-2">
              <Stamp className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-[13px] font-semibold">Watermark</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Your logo mark appears on every exported clip.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">
                  Position
                </label>
                <div className="mt-1 grid grid-cols-2 gap-1.5">
                  {WATERMARK_POSITIONS.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => update('watermarkPosition', value)}
                      className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                        kit.watermarkPosition === value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-xs text-muted-foreground">Opacity</span>
                  <span className="tabular-nums text-xs">
                    {Math.round(kit.watermarkOpacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={Math.round(kit.watermarkOpacity * 100)}
                  onChange={(e) =>
                    update('watermarkOpacity', Number(e.target.value) / 100)
                  }
                  className="mt-3 w-full"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="xl:w-80 shrink-0 w-full">
          <div className="sticky top-6 rounded-xl border border-border bg-card p-5">
            <h2 className="text-[13px] font-semibold mb-3">Preview</h2>
            <div className="mx-auto max-w-[240px] rounded-[28px] border-4 border-muted bg-black p-1.5 shadow-lg">
              <div
                className="aspect-[9/16] rounded-[20px] overflow-hidden relative"
                style={{ backgroundColor: kit.primaryColor + '20' }}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${kit.primaryColor}, ${kit.secondaryColor})`
                    }}
                  >
                    <span
                      className="text-white text-xl font-bold"
                      style={{ fontFamily: kit.fontFamily }}
                    >
                      CF
                    </span>
                  </div>
                </div>

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
                    Sample subtitle text
                  </span>
                </div>

                <div
                  className={`absolute text-[10px] font-bold ${
                    kit.watermarkPosition === 'top-left'
                      ? 'top-2 left-2'
                      : kit.watermarkPosition === 'top-right'
                        ? 'top-2 right-2'
                        : kit.watermarkPosition === 'bottom-left'
                          ? 'bottom-2 left-2'
                          : 'bottom-2 right-2'
                  }`}
                  style={{
                    opacity: kit.watermarkOpacity,
                    color: kit.primaryColor
                  }}
                >
                  ClipForge
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Updates live as you edit
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
