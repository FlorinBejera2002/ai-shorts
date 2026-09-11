'use client'

import { Button } from '@/components/ui/button'
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
      <Label className="text-[11px] font-medium text-muted-foreground" htmlFor={id}>
        {label}
      </Label>
      <div
        className={`mt-1 flex h-9 items-center overflow-hidden rounded-md border bg-card px-1 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/15 ${
          touched && !valid ? 'border-destructive' : 'border-input'
        }`}
      >
        <span className="size-7 shrink-0 overflow-hidden rounded-full">
          <input
            id={`${id}-picker`}
            type="color"
            aria-label={`${label} ${t('pickColor')}`}
            value={valid ? normalizeHex(value) : '#000000'}
            onChange={(event) => onChange(normalizeHex(event.target.value))}
            className="-m-1 size-9 cursor-pointer border-0 bg-transparent p-0"
          />
        </span>
        <input
          id={id}
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
          className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-left font-mono text-xs uppercase outline-none"
        />
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            title={t('pickColor')}
            aria-label={t('pickColor')}
            onClick={() => void pickColor()}
            className="rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pipette aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            title={t('copyHex')}
            aria-label={t('copyHex')}
            onClick={() => void copyHex()}
            className="rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {copied ? (
              <Check aria-hidden="true" className="text-success" />
            ) : (
              <Copy aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>
      {touched && !valid && (
        <p className="mt-1.5 text-[11px] text-destructive">{t('invalidHex')}</p>
      )}
    </div>
  )
}
