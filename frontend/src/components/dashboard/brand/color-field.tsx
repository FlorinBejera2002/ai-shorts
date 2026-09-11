'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Check, Copy, Pipette } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { HEX_RE, normalizeHex } from './utils'

type EyeDropperResult = { sRGBHex: string }
type EyeDropperCtor = new () => { open: () => Promise<EyeDropperResult> }

export function ColorField({
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
  const t = useTranslations('brand')
  const [copied, setCopied] = useState(false)
  const [touched, setTouched] = useState(false)
  const valid = HEX_RE.test(value)

  async function pickColor() {
    if (!('EyeDropper' in window)) return
    try {
      const EyeDropper = (window as unknown as { EyeDropper: EyeDropperCtor })
        .EyeDropper
      const result = await new EyeDropper().open()
      onChange(normalizeHex(result.sRGBHex))
    } catch {
      // Cancelling the native picker is expected and needs no feedback.
    }
  }

  async function copyHex() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div>
      <Label className="text-xs text-muted-foreground" htmlFor={id}>
        {label}
      </Label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={valid ? normalizeHex(value) : '#000000'}
          onChange={(event) => onChange(normalizeHex(event.target.value))}
          className="size-10 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent p-0.5"
        />
        <Input
          type="text"
          aria-label={`${label} HEX`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => {
            setTouched(true)
            if (valid) onChange(normalizeHex(value))
          }}
          spellCheck={false}
          aria-invalid={touched && !valid}
          className="min-w-[104px] flex-1 rounded-lg font-mono text-[13px] uppercase"
        />
        <Button
          variant="outline"
          size="icon"
          type="button"
          title={t('pickColor')}
          aria-label={t('pickColor')}
          onClick={() => void pickColor()}
          className="size-10 rounded-lg"
        >
          <Pipette aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          type="button"
          title={t('copyHex')}
          aria-label={t('copyHex')}
          onClick={() => void copyHex()}
          className="size-10 rounded-lg"
        >
          {copied ? (
            <Check aria-hidden="true" className="text-success" />
          ) : (
            <Copy aria-hidden="true" />
          )}
        </Button>
      </div>
      {touched && !valid && (
        <p className="mt-1.5 text-[11px] text-destructive">{t('invalidHex')}</p>
      )}
    </div>
  )
}
