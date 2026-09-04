'use client'

import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform
} from 'framer-motion'
import Image from 'next/image'
import { type ReactNode, useCallback, useEffect, useRef } from 'react'

/* ── Canvas-based stage lighting + atmosphere ── */
function StageCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef(0)
  const animateRef = useRef(false)
  const startedAtRef = useRef<number | null>(null)

  const spots = useRef([
    {
      origin: 'top',
      x: 0.06,
      color: [81, 57, 239],
      intensity: 0.62,
      phase: 0
    },
    {
      origin: 'top',
      x: 0.21,
      color: [81, 57, 239],
      intensity: 0.76,
      phase: 2
    },
    {
      origin: 'top',
      x: 0.35,
      color: [81, 57, 239],
      intensity: 0.88,
      phase: 0.5
    },
    {
      origin: 'top',
      x: 0.5,
      color: [81, 57, 239],
      intensity: 1,
      phase: 0.8
    },
    {
      origin: 'top',
      x: 0.65,
      color: [81, 57, 239],
      intensity: 0.84,
      phase: 4
    },
    {
      origin: 'top',
      x: 0.79,
      color: [81, 57, 239],
      intensity: 0.72,
      phase: 3
    },
    {
      origin: 'top',
      x: 0.94,
      color: [81, 57, 239],
      intensity: 0.6,
      phase: 1.2
    }
  ])

  const stars = useRef(
    Array.from({ length: 120 }, () => ({
      x: Math.random(),
      y: Math.random() * 0.5,
      size: 0.3 + Math.random() * 1.5,
      twinkle: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 2
    }))
  )

  const dust = useRef(
    Array.from({ length: 70 }, () => ({
      x: Math.random(),
      y: 0.1 + Math.random() * 0.6,
      vx: (Math.random() - 0.5) * 0.0002,
      vy: (Math.random() - 0.5) * 0.0001,
      size: 0.5 + Math.random() * 2,
      brightness: 0.2 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2
    }))
  )

  const draw = useCallback((time: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    const t = time * 0.001
    if (startedAtRef.current === null) startedAtRef.current = time
    const elapsed = time - startedAtRef.current

    ctx.clearRect(0, 0, w, h)

    // ── Sky / atmosphere gradient ──
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.7)
    skyGrad.addColorStop(0, '#020202')
    skyGrad.addColorStop(0.15, '#060606')
    skyGrad.addColorStop(0.35, '#0a0a0a')
    skyGrad.addColorStop(0.5, '#080808')
    skyGrad.addColorStop(0.7, '#030303')
    ctx.fillStyle = skyGrad
    ctx.fillRect(0, 0, w, h)

    // ── Nebula / cosmic glow ──
    const drawNebula = (
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      r: number,
      g: number,
      b: number,
      alpha: number
    ) => {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(1, ry / rx)
      const ng = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
      ng.addColorStop(0, `rgba(${r},${g},${b},${alpha})`)
      ng.addColorStop(0.4, `rgba(${r},${g},${b},${alpha * 0.4})`)
      ng.addColorStop(0.7, `rgba(${r},${g},${b},${alpha * 0.1})`)
      ng.addColorStop(1, 'transparent')
      ctx.fillStyle = ng
      ctx.fillRect(-rx, -rx, rx * 2, rx * 2)
      ctx.restore()
    }

    drawNebula(
      w * 0.3,
      h * 0.15,
      w * 0.35,
      w * 0.2,
      81,
      57,
      239,
      0.12 + Math.sin(t * 0.2) * 0.03
    )
    drawNebula(
      w * 0.7,
      h * 0.1,
      w * 0.3,
      w * 0.18,
      81,
      57,
      239,
      0.1 + Math.sin(t * 0.25 + 1) * 0.025
    )
    drawNebula(
      w * 0.5,
      h * 0.25,
      w * 0.25,
      w * 0.15,
      81,
      57,
      239,
      0.08 + Math.sin(t * 0.3 + 2) * 0.02
    )
    drawNebula(w * 0.15, h * 0.3, w * 0.2, w * 0.12, 81, 57, 239, 0.06)
    drawNebula(w * 0.85, h * 0.25, w * 0.2, w * 0.1, 81, 57, 239, 0.07)

    // ── Stars ──
    for (const s of stars.current) {
      const twinkle = 0.3 + Math.sin(t * s.speed + s.twinkle) * 0.4 + 0.3
      ctx.beginPath()
      ctx.arc(s.x * w, s.y * h, s.size, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(232,232,232,${twinkle})`
      ctx.fill()

      if (s.size > 1) {
        ctx.beginPath()
        ctx.arc(s.x * w, s.y * h, s.size * 3, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(200,200,200,${twinkle * 0.1})`
        ctx.fill()
      }
    }

    // ── 3D round stage platform ──
    const floorY = h * 0.76

    const dpr = Math.min(window.devicePixelRatio, 2)
    const maxStageW = 1200 * dpr
    const stageRx = Math.min(w * 0.46, maxStageW / 2)
    const stageRy = stageRx * 0.22
    const stageCx = w * 0.5
    const stageCy = floorY + stageRy * 0.5
    const stageThickness = stageRy * 1.8

    // Drop shadow on ground
    ctx.save()
    ctx.translate(stageCx, stageCy + stageThickness + stageRy * 0.5)
    ctx.scale(1, 0.25)
    const shadowG = ctx.createRadialGradient(0, 0, 0, 0, 0, stageRx * 1.4)
    shadowG.addColorStop(0, 'rgba(0,0,0,0.7)')
    shadowG.addColorStop(0.4, 'rgba(0,0,0,0.35)')
    shadowG.addColorStop(0.7, 'rgba(0,0,0,0.1)')
    shadowG.addColorStop(1, 'transparent')
    ctx.fillStyle = shadowG
    ctx.beginPath()
    ctx.arc(0, 0, stageRx * 1.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Stage side (3D thickness — taller cylinder)
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(
      stageCx,
      stageCy + stageThickness,
      stageRx,
      stageRy,
      0,
      0,
      Math.PI
    )
    ctx.lineTo(stageCx - stageRx, stageCy)
    ctx.ellipse(stageCx, stageCy, stageRx, stageRy, 0, Math.PI, 0, true)
    ctx.closePath()

    // Side gradient: darker at edges, slightly lighter in the center for 3D volume
    const sideGrad = ctx.createLinearGradient(
      stageCx - stageRx,
      0,
      stageCx + stageRx,
      0
    )
    sideGrad.addColorStop(0, '#030303')
    sideGrad.addColorStop(0.15, '#070707')
    sideGrad.addColorStop(0.35, '#0b0b0b')
    sideGrad.addColorStop(0.5, '#0e0e0e')
    sideGrad.addColorStop(0.65, '#0b0b0b')
    sideGrad.addColorStop(0.85, '#070707')
    sideGrad.addColorStop(1, '#030303')
    ctx.fillStyle = sideGrad
    ctx.fill()

    // Vertical shading on the side for depth
    const sideVGrad = ctx.createLinearGradient(
      0,
      stageCy,
      0,
      stageCy + stageThickness
    )
    sideVGrad.addColorStop(0, 'rgba(255,255,255,0.03)')
    sideVGrad.addColorStop(0.3, 'transparent')
    sideVGrad.addColorStop(0.8, 'rgba(0,0,0,0.15)')
    sideVGrad.addColorStop(1, 'rgba(0,0,0,0.25)')
    ctx.fillStyle = sideVGrad
    ctx.fill()
    ctx.restore()

    // Horizontal band detail on the side
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(
      stageCx,
      stageCy + stageThickness,
      stageRx,
      stageRy,
      0,
      0,
      Math.PI
    )
    ctx.lineTo(stageCx - stageRx, stageCy)
    ctx.ellipse(stageCx, stageCy, stageRx, stageRy, 0, Math.PI, 0, true)
    ctx.closePath()
    ctx.clip()
    const bandY = stageCy + stageThickness * 0.5
    ctx.strokeStyle = 'rgba(255,255,255,0.025)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(stageCx, bandY, stageRx, stageRy, 0, 0, Math.PI)
    ctx.stroke()
    const bandY2 = stageCy + stageThickness * 0.75
    ctx.beginPath()
    ctx.ellipse(stageCx, bandY2, stageRx, stageRy, 0, 0, Math.PI)
    ctx.stroke()
    ctx.restore()

    // Rim light on stage edge (bottom ellipse)
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(
      stageCx,
      stageCy + stageThickness,
      stageRx,
      stageRy,
      0,
      0.05,
      Math.PI - 0.05
    )
    const rimGrad = ctx.createLinearGradient(
      stageCx - stageRx,
      0,
      stageCx + stageRx,
      0
    )
    rimGrad.addColorStop(0, 'transparent')
    rimGrad.addColorStop(0.15, 'rgba(81,57,239,0.3)')
    rimGrad.addColorStop(0.35, 'rgba(81,57,239,0.15)')
    rimGrad.addColorStop(0.5, 'rgba(255,255,255,0.1)')
    rimGrad.addColorStop(0.65, 'rgba(81,57,239,0.15)')
    rimGrad.addColorStop(0.85, 'rgba(81,57,239,0.3)')
    rimGrad.addColorStop(1, 'transparent')
    ctx.strokeStyle = rimGrad
    ctx.lineWidth = 1.5
    ctx.shadowColor = 'rgba(81,57,239,0.3)'
    ctx.shadowBlur = 10
    ctx.stroke()
    ctx.restore()

    // Stage top surface (dark ellipse)
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(stageCx, stageCy, stageRx, stageRy, 0, 0, Math.PI * 2)
    ctx.closePath()
    const topGrad = ctx.createRadialGradient(
      stageCx,
      stageCy - stageRy * 0.2,
      0,
      stageCx,
      stageCy,
      stageRx
    )
    topGrad.addColorStop(0, '#121212')
    topGrad.addColorStop(0.35, '#0d0d0d')
    topGrad.addColorStop(0.7, '#090909')
    topGrad.addColorStop(1, '#050505')
    ctx.fillStyle = topGrad
    ctx.fill()

    // Subtle wood grain on top
    ctx.clip()
    ctx.globalAlpha = 0.12
    for (let gy = stageCy - stageRy; gy < stageCy + stageRy; gy += 4) {
      const frac = (gy - (stageCy - stageRy)) / (stageRy * 2)
      const grain = 38 + (gy % 18)
      ctx.strokeStyle = `rgba(${grain},${grain},${grain},0.4)`
      ctx.lineWidth = 0.3 + ((gy * 3) % 2) * 0.3
      ctx.beginPath()
      const rowHalf =
        Math.sqrt(Math.max(0, 1 - Math.pow(frac * 2 - 1, 2))) * stageRx
      ctx.moveTo(stageCx - rowHalf, gy)
      ctx.lineTo(stageCx + rowHalf, gy)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // Concentric rings for plank effect
    ctx.globalAlpha = 0.06
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1
    for (let ring = 0.3; ring < 1; ring += 0.2) {
      ctx.beginPath()
      ctx.ellipse(
        stageCx,
        stageCy,
        stageRx * ring,
        stageRy * ring,
        0,
        0,
        Math.PI * 2
      )
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    ctx.restore()

    // Top edge rim light
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(stageCx, stageCy, stageRx, stageRy, 0, Math.PI + 0.15, -0.15)
    const topRimGrad = ctx.createLinearGradient(
      stageCx - stageRx,
      0,
      stageCx + stageRx,
      0
    )
    topRimGrad.addColorStop(0, 'transparent')
    topRimGrad.addColorStop(0.2, 'rgba(81,57,239,0.25)')
    topRimGrad.addColorStop(0.4, 'rgba(81,57,239,0.15)')
    topRimGrad.addColorStop(0.5, 'rgba(255,255,255,0.1)')
    topRimGrad.addColorStop(0.6, 'rgba(81,57,239,0.15)')
    topRimGrad.addColorStop(0.8, 'rgba(81,57,239,0.25)')
    topRimGrad.addColorStop(1, 'transparent')
    ctx.strokeStyle = topRimGrad
    ctx.lineWidth = 1.2
    ctx.globalAlpha = 0.7 + Math.sin(t * 0.5) * 0.3
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.restore()

    // ── Spotlights ──
    ctx.globalCompositeOperation = 'screen'

    for (const [index, spot] of spots.current.entries()) {
      const fromTop = spot.origin === 'top'
      const fromLeft = spot.origin === 'left'
      const sx = fromTop
        ? (spot.x ?? 0.5) * w
        : fromLeft
          ? -w * 0.035
          : w * 1.035
      // Keep every ceiling fixture anchored to a visible, fixed pivot.
      // The beam can sweep during the intro, but its origin never slides along the top edge.
      const sy = fromTop ? 2 * dpr : h * (0.035 + (index % 3) * 0.045)
      const targetX =
        stageCx + (index - (spots.current.length - 1) / 2) * stageRx * 0.075
      const targetY = stageCy - stageRy * 0.08
      const finalAngle =
        (Math.atan2(targetX - sx, targetY - sy) * 180) / Math.PI
      const topX = spot.x ?? 0.5
      const entryAngle = fromTop
        ? topX < 0.5
          ? -34
          : topX > 0.5
            ? 34
            : 0
        : fromLeft
          ? -58
          : 58
      const introDelay = index * 90
      const introProgress = Math.max(
        0,
        Math.min(1, (elapsed - introDelay) / 1900)
      )
      const easedProgress = 1 - (1 - introProgress) ** 4
      const settleProgress = Math.max(
        0,
        Math.min(1, (elapsed - introDelay - 1900) / 900)
      )
      const settleEnvelope =
        settleProgress * settleProgress * (3 - 2 * settleProgress)
      const fanDistance =
        Math.abs(index - (spots.current.length - 1) / 2) /
        ((spots.current.length - 1) / 2)
      const sweepDeg = animateRef.current
        ? Math.sin(t * 0.18 + spot.phase * 0.35) *
          (1.8 + fanDistance * 1.2) *
          settleEnvelope
        : 0
      const angleDeg =
        entryAngle + (finalAngle - entryAngle) * easedProgress + sweepDeg
      const angleRad = (angleDeg * Math.PI) / 180
      const settledPulse = 0.9 + Math.sin(t * 0.45 + spot.phase) * 0.06
      const pulse =
        (0.18 + introProgress * 0.82) * settledPulse * spot.intensity

      const len = h * 1.25
      const endX = sx + Math.sin(angleRad) * len
      const endY = sy + Math.cos(angleRad) * len
      const distanceFromCenter =
        Math.abs(index - (spots.current.length - 1) / 2) / 3
      const spread = len * (0.14 + distanceFromCenter * 0.035)
      const perpX = Math.cos(angleRad)
      const perpY = -Math.sin(angleRad)
      const [r, g, b] = spot.color

      // Wide glow
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(endX - perpX * spread * 1.4, endY - perpY * spread * 1.4)
      ctx.lineTo(endX + perpX * spread * 1.4, endY + perpY * spread * 1.4)
      ctx.closePath()
      const g1 = ctx.createLinearGradient(sx, sy, endX, endY)
      g1.addColorStop(0, `rgba(${r},${g},${b},${0.22 * pulse})`)
      g1.addColorStop(0.2, `rgba(${r},${g},${b},${0.07 * pulse})`)
      g1.addColorStop(0.5, `rgba(${r},${g},${b},${0.025 * pulse})`)
      g1.addColorStop(1, 'transparent')
      ctx.fillStyle = g1
      ctx.filter = 'blur(18px)'
      ctx.fill()
      ctx.restore()

      // Main beam
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(endX - perpX * spread, endY - perpY * spread)
      ctx.lineTo(endX + perpX * spread, endY + perpY * spread)
      ctx.closePath()
      const g2 = ctx.createLinearGradient(sx, sy, endX, endY)
      g2.addColorStop(0, `rgba(${r},${g},${b},${0.55 * pulse})`)
      g2.addColorStop(0.07, `rgba(${r},${g},${b},${0.3 * pulse})`)
      g2.addColorStop(0.22, `rgba(${r},${g},${b},${0.12 * pulse})`)
      g2.addColorStop(0.5, `rgba(${r},${g},${b},${0.04 * pulse})`)
      g2.addColorStop(1, 'transparent')
      ctx.fillStyle = g2
      ctx.filter = 'blur(2px)'
      ctx.fill()
      ctx.restore()

      // Core
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(endX - perpX * spread * 0.25, endY - perpY * spread * 0.25)
      ctx.lineTo(endX + perpX * spread * 0.25, endY + perpY * spread * 0.25)
      ctx.closePath()
      const g3 = ctx.createLinearGradient(sx, sy, endX, endY)
      g3.addColorStop(0, `rgba(255,255,255,${0.35 * pulse})`)
      g3.addColorStop(0.03, `rgba(${r},${g},${b},${0.45 * pulse})`)
      g3.addColorStop(0.12, `rgba(${r},${g},${b},${0.1 * pulse})`)
      g3.addColorStop(0.35, 'transparent')
      ctx.fillStyle = g3
      ctx.filter = 'blur(6px)'
      ctx.fill()
      ctx.restore()

      // Lamp glow
      const lampY = Math.max(2 * dpr, sy)
      const lg = ctx.createRadialGradient(sx, lampY, 0, sx, lampY, 35 * dpr)
      lg.addColorStop(0, `rgba(255,255,255,${0.85 * pulse})`)
      lg.addColorStop(0.15, `rgba(${r},${g},${b},${0.7 * pulse})`)
      lg.addColorStop(0.5, `rgba(${r},${g},${b},${0.2 * pulse})`)
      lg.addColorStop(1, 'transparent')
      ctx.fillStyle = lg
      ctx.fillRect(sx - 35 * dpr, 0, 70 * dpr, 55 * dpr)

      // Floor pool on round stage
      const poolCx = sx + Math.tan(angleRad) * (stageCy - sy)
      const poolR = spread * 0.6
      ctx.save()
      ctx.beginPath()
      ctx.ellipse(stageCx, stageCy, stageRx, stageRy, 0, 0, Math.PI * 2)
      ctx.clip()
      ctx.translate(poolCx, stageCy)
      ctx.scale(1, 0.4)
      const pg = ctx.createRadialGradient(0, 0, 0, 0, 0, poolR)
      pg.addColorStop(0, `rgba(${r},${g},${b},${0.35 * pulse})`)
      pg.addColorStop(0.3, `rgba(${r},${g},${b},${0.14 * pulse})`)
      pg.addColorStop(0.65, `rgba(${r},${g},${b},${0.04 * pulse})`)
      pg.addColorStop(1, 'transparent')
      ctx.fillStyle = pg
      ctx.beginPath()
      ctx.arc(0, 0, poolR, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    ctx.globalCompositeOperation = 'source-over'

    // ── Dust ──
    for (const p of dust.current) {
      p.x += p.vx + Math.sin(t + p.phase) * 0.00012
      p.y += p.vy + Math.cos(t * 0.7 + p.phase) * 0.00008
      if (p.x < -0.02) p.x = 1.02
      if (p.x > 1.02) p.x = -0.02
      if (p.y < 0.08) p.y = 0.7
      if (p.y > 0.75) p.y = 0.08

      const alpha = p.brightness * (0.25 + Math.sin(t * 1.8 + p.phase) * 0.25)
      ctx.beginPath()
      ctx.arc(p.x * w, p.y * h, p.size, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(224,224,224,${alpha})`
      ctx.fill()
    }

    // ── Vignette ──
    const vg = ctx.createRadialGradient(
      w * 0.5,
      h * 0.42,
      w * 0.22,
      w * 0.5,
      h * 0.42,
      w * 0.72
    )
    vg.addColorStop(0, 'transparent')
    vg.addColorStop(1, 'rgba(0,0,0,0.45)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, w, h)

    if (animateRef.current) frameRef.current = requestAnimationFrame(draw)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2)
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
      if (!animateRef.current) draw(5000)
    }
    resize()
    window.addEventListener('resize', resize)

    const motionPreference = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    )
    let isVisible = true

    const renderStaticFrame = () => {
      cancelAnimationFrame(frameRef.current)
      animateRef.current = false
      startedAtRef.current = 0
      draw(5000)
    }

    const syncAnimation = () => {
      const shouldAnimate =
        !motionPreference.matches && !document.hidden && isVisible
      if (shouldAnimate === animateRef.current) return

      cancelAnimationFrame(frameRef.current)
      animateRef.current = shouldAnimate
      if (shouldAnimate) {
        startedAtRef.current = null
        frameRef.current = requestAnimationFrame(draw)
      } else if (motionPreference.matches) {
        renderStaticFrame()
      }
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry?.isIntersecting ?? false
        syncAnimation()
      },
      { threshold: 0.01 }
    )
    const handleVisibilityChange = () => syncAnimation()
    const handleMotionChange = () => syncAnimation()

    observer.observe(canvas)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    motionPreference.addEventListener('change', handleMotionChange)
    syncAnimation()

    return () => {
      animateRef.current = false
      cancelAnimationFrame(frameRef.current)
      observer.disconnect()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      motionPreference.removeEventListener('change', handleMotionChange)
      window.removeEventListener('resize', resize)
    }
  }, [draw])

  return (
    <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-0" />
  )
}

/* ── (Equipment silhouettes removed) ── */

/* ── Main export ── */
export function StudioHero({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start']
  })
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0])

  return (
    <section
      ref={ref}
      className="relative min-h-dvh flex items-center overflow-hidden bg-black"
    >
      <StageCanvas />

      {/* Logo watermark */}
      <div className="absolute left-1/2 top-[34%] -translate-x-1/2 -translate-y-1/2 z-[2] pointer-events-none select-none">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
          animate={
            reduceMotion
              ? { opacity: 0.06, scale: 1 }
              : { opacity: 0.06, scale: 1, y: [0, -4, 0] }
          }
          transition={
            reduceMotion
              ? { duration: 0 }
              : {
                  opacity: { duration: 2.5 },
                  scale: { duration: 2 },
                  y: { duration: 6, repeat: Infinity, ease: 'easeInOut' }
                }
          }
        >
          <Image
            src="/logo.webp"
            alt=""
            width={56}
            height={56}
            className="rounded-2xl"
            aria-hidden={true}
          />
        </motion.div>
      </div>

      <motion.div
        className="relative z-10 w-full"
        style={reduceMotion ? undefined : { opacity }}
      >
        {children}
      </motion.div>

      <div className="absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-[#060606] to-transparent z-10" />
    </section>
  )
}
