'use client'

import { useMemo } from 'react'
import { encodeQr } from './qr-code'

const FINDER = 7

/** The three finder squares and their light separators. */
function inFinder(x: number, y: number, size: number) {
  const low = (value: number) => value <= FINDER
  const high = (value: number) => value >= size - FINDER - 1
  return (low(x) && low(y)) || (high(x) && low(y)) || (low(x) && high(y))
}

/**
 * Setup QR in the canvas style: rounded finder squares, module dots and the Sneep Cut mark in
 * the middle. Level Q leaves enough redundancy for the mark it covers.
 */
export function SettingsQrCode({ value, label }: { value: string; label: string }) {
  const qr = useMemo(() => encodeQr(value, 'Q'), [value])
  const { size, modules } = qr
  const logo = Math.max(5, Math.round(size * 0.2) | 1)
  const logoStart = (size - logo) / 2
  const covered = (x: number, y: number) =>
    x >= logoStart - 0.5 && x < logoStart + logo + 0.5 && y >= logoStart - 0.5 && y < logoStart + logo + 0.5
  const dots: string[] = []
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark && !inFinder(x, y, size) && !covered(x, y)) dots.push(`M${x + 0.07} ${y + 0.07}h0.86v0.86h-0.86z`)
    })
  )
  const corners = [
    [0, 0],
    [size - FINDER, 0],
    [0, size - FINDER]
  ] as const
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} fill="#0b0b0c" data-settings-qr={qr.version}>
      <path d={dots.join('')} />
      {corners.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x + 0.5} y={y + 0.5} width={6} height={6} rx={1.45} fill="none" stroke="#0b0b0c" strokeWidth={1} />
          <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.7} />
        </g>
      ))}
      <rect x={logoStart} y={logoStart} width={logo} height={logo} rx={logo * 0.24} fill="#fff" />
      <image href="/sneepcut-symbol-black.svg" x={logoStart + logo * 0.18} y={logoStart + logo * 0.18} width={logo * 0.64} height={logo * 0.64} />
    </svg>
  )
}
