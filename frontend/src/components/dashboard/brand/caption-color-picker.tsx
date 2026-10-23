import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { Dialog, Popover } from 'radix-ui'
import { useTranslations } from 'next-intl'
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import { hexToHsv, hsvToHex } from './caption-color-utils'
import { HEX_RE, normalizeHex } from './utils'
import styles from './caption-editor.module.css'

export function CaptionColorPicker({ label, value, onChange, open, onOpenChange, children }: {
  label: string
  value: string
  onChange: (value: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  const t = useTranslations('brand.editorDesign')
  const isMobile = useIsMobile()
  const body = <ColorSpectrum label={label} value={value} onChange={onChange} />
  if (isMobile) return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.colorOverlay} />
        <Dialog.Content className={styles.colorSheet} aria-describedby={undefined}>
          <span className={styles.sheetHandle} aria-hidden="true" />
          <div className={styles.colorSheetHeader}>
            <Dialog.Title>{label}</Dialog.Title>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t('done')}</Button>
          </div>
          {body}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.colorPopup} aria-label={label} side="right" align="start" sideOffset={12} collisionPadding={16}>
          {body}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function ColorSpectrum({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const t = useTranslations('brand.editorDesign')
  const valid = HEX_RE.test(value)
  const hsv = hexToHsv(valid ? value : '#000000')
  const [grayHue, setGrayHue] = useState(hsv.h)
  const hue = hsv.s === 0 ? grayHue : hsv.h
  const plane = useRef<HTMLDivElement>(null)

  function changeSaturation(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const s = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const v = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height))
    onChange(hsvToHex({ h: hue, s, v }))
  }

  function changeWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    const amount = event.shiftKey ? 0.1 : 0.01
    const next = { h: hue, s: hsv.s, v: hsv.v }
    if (event.key === 'ArrowLeft') next.s -= amount
    else if (event.key === 'ArrowRight') next.s += amount
    else if (event.key === 'ArrowDown') next.v -= amount
    else if (event.key === 'ArrowUp') next.v += amount
    else return
    event.preventDefault()
    onChange(hsvToHex(next))
  }

  return (
    <div className={styles.colorSpectrum}>
      <div
        ref={plane} role="slider" tabIndex={0} data-color-saturation=""
        aria-label={t('saturationBrightness')} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={t('colorCoordinates', { saturation: Math.round(hsv.s * 100), brightness: Math.round(hsv.v * 100) })}
        className={styles.saturationPlane} style={{ backgroundColor: `hsl(${hue} 100% 50%)` }}
        onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus(); changeSaturation(event) }}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) changeSaturation(event) }}
        onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
        onKeyDown={changeWithKeyboard}
      >
        <span className={styles.saturationHandle} style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
      </div>
      <input type="range" aria-label={t('hue')} min={0} max={360} step={1} value={hue}
        className={styles.hueSlider}
        onChange={event => {
          const h = Number(event.target.value)
          setGrayHue(h)
          onChange(hsvToHex({ ...hsv, h }))
        }} />
      <label className={styles.pickerHex}>
        <span>HEX</span>
        <input aria-label={`${label} HEX ${t('picker')}`} value={value} spellCheck={false}
          onChange={event => onChange(event.target.value)} aria-invalid={!valid}
          onBlur={() => { if (valid) onChange(normalizeHex(value)) }} />
      </label>
    </div>
  )
}
