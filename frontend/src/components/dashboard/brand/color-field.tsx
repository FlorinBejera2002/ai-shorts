'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Check, Copy, Pipette } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { CaptionColorPicker } from './caption-color-picker'
import { HEX_RE, normalizeHex } from './utils'
import styles from './caption-editor.module.css'

type EyeDropperResult = { sRGBHex: string }
type EyeDropperCtor = new () => { open: () => Promise<EyeDropperResult> }

export function ColorField({ id, label, value, onChange, open, onOpenChange }: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const t = useTranslations('brand')
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [touched, setTouched] = useState(false)
  const [localOpen, setLocalOpen] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const valid = HEX_RE.test(value)
  const canPickFromScreen = typeof window !== 'undefined' && 'EyeDropper' in window
  const setOpen = onOpenChange ?? setLocalOpen
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current) }, [])

  async function pickColor() {
    if (!canPickFromScreen) return
    try {
      const EyeDropper = (window as unknown as { EyeDropper: EyeDropperCtor }).EyeDropper
      const result = await new EyeDropper().open()
      onChange(normalizeHex(result.sRGBHex))
    } catch {
      // Cancelling the native picker leaves the selected color unchanged.
    }
  }

  async function copyHex() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setCopyError(false)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 1200)
    } catch { setCopyError(true) }
  }

  return (
    <div className={styles.colorField} data-brand-color-field={id}>
      <Label htmlFor={id}>{label}</Label>
      <div className={styles.colorInput} data-invalid={touched && !valid}>
        <CaptionColorPicker label={label} value={value} onChange={onChange} open={open ?? localOpen} onOpenChange={setOpen}>
          <button type="button" className={styles.colorSwatch} aria-label={`${label} ${t('editorDesign.chooseColor')}`}
            style={{ backgroundColor: valid ? normalizeHex(value) : 'transparent' }} />
        </CaptionColorPicker>
        <input
          id={id} type="text" aria-label={`${label} HEX`} value={value}
          onChange={event => onChange(event.target.value)}
          onBlur={() => { setTouched(true); if (valid) onChange(normalizeHex(value)) }}
          spellCheck={false} aria-invalid={touched && !valid}
        />
        {canPickFromScreen && (
          <Button variant="ghost" size="icon-sm" type="button" title={t('pickColor')} aria-label={t('pickColor')}
            onClick={() => void pickColor()} className={styles.colorAction}><Pipette aria-hidden="true" /></Button>
        )}
        <Button variant="ghost" size="icon-sm" type="button" title={t('copyHex')} aria-label={t('copyHex')}
          onClick={() => void copyHex()} className={styles.colorAction}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        </Button>
      </div>
      {touched && !valid && <p role="alert" className={styles.error}>{t('invalidHex')}</p>}
      {copyError && <p role="alert" className={styles.error}>{t('editorDesign.copyFailed')}</p>}
    </div>
  )
}
