'use client'

import type { CameraVisualization } from '@/lib/camera-visualization'
import { motion } from 'framer-motion'
import { useId } from 'react'

export function ShootingCoachStage({
  label,
  reduceMotion,
  sceneNumber,
  visualization
}: {
  label: string
  reduceMotion: boolean
  sceneNumber: number
  visualization: CameraVisualization
}) {
  const rawId = useId().replace(/:/g, '')
  const backdropGradient = 'coach-backdrop-' + rawId
  const subjectGradient = 'coach-subject-' + rawId
  const cameraGradient = 'coach-camera-' + rawId
  const topView = visualization.view === 'top'
  const cameraView = visualization.view === 'camera'
  const shoulderPoints = visualization.subject.body?.points.slice(0, 2)
  const shoulderCenter =
    shoulderPoints?.length === 2
      ? {
          x: (shoulderPoints[0]!.x + shoulderPoints[1]!.x) / 2,
          y: (shoulderPoints[0]!.y + shoulderPoints[1]!.y) / 2
        }
      : null

  return (
    <motion.div
      key={visualization.view + '-' + String(sceneNumber)}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.28 }}
      className="absolute inset-0"
    >
      <svg
        viewBox={
          '0 0 ' +
          String(visualization.width) +
          ' ' +
          String(visualization.height)
        }
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        role="img"
        aria-label={label}
      >
        <defs>
          <linearGradient id={backdropGradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.025" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={subjectGradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#dedede" />
            <stop offset="0.5" stopColor="#a8a8a8" />
            <stop offset="1" stopColor="#757575" />
          </linearGradient>
          <linearGradient id={cameraGradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#292929" />
            <stop offset="1" stopColor="#0c0c0c" />
          </linearGradient>
          <radialGradient id={'coach-light-' + rawId}>
            <stop offset="0" stopColor="#fff6e5" stopOpacity="0.6" />
            <stop offset="1" stopColor="#fff6e5" stopOpacity="0" />
          </radialGradient>
          <filter
            id={'coach-glow-' + rawId}
            x="-100%"
            y="-100%"
            width="300%"
            height="300%"
          >
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect
          width={visualization.width}
          height={visualization.height}
          fill={'url(#' + backdropGradient + ')'}
        />

        <g
          fill="none"
          stroke="#c5c5c5"
          strokeOpacity={topView ? 0.18 : 0.16}
          strokeWidth="0.75"
        >
          <SvgSegments segments={visualization.floorLines} />
        </g>
        <g fill="none" stroke="#e0e0e0" strokeOpacity="0.32" strokeWidth="1.1">
          <SvgSegments segments={visualization.studioLines} />
        </g>
        <g fill="none" stroke="#d0d0d0" strokeOpacity="0.18" strokeWidth="1.25">
          <SvgSegments segments={visualization.stageLines} />
        </g>

        {visualization.light.beam && !cameraView && (
          <line
            x1={visualization.light.beam.from.x}
            y1={visualization.light.beam.from.y}
            x2={visualization.light.beam.to.x}
            y2={visualization.light.beam.to.y}
            stroke="#fff6e5"
            strokeOpacity="0.15"
            strokeWidth="1"
            strokeDasharray="5 7"
          />
        )}
        {visualization.light.position.visible && !cameraView && (
          <>
            <circle
              cx={visualization.light.position.x}
              cy={visualization.light.position.y}
              r="24"
              fill={'url(#coach-light-' + rawId + ')'}
            />
            <circle
              cx={visualization.light.position.x}
              cy={visualization.light.position.y}
              r="4"
              fill="#fff6e5"
              filter={'url(#coach-glow-' + rawId + ')'}
            />
          </>
        )}

        {!cameraView && (
          <g
            fill="none"
            stroke="#dedede"
            strokeOpacity="0.54"
            strokeWidth="1.2"
            strokeDasharray="6 5"
          >
            <SvgSegments segments={visualization.frustumLines} />
          </g>
        )}
        {visualization.focusLine && (
          <line
            x1={visualization.focusLine.from.x}
            y1={visualization.focusLine.from.y}
            x2={visualization.focusLine.to.x}
            y2={visualization.focusLine.to.y}
            stroke="#ffffff"
            strokeOpacity="0.22"
            strokeWidth="1.2"
            strokeDasharray="2 5"
          />
        )}

        {!cameraView && visualization.cameraRig.body && (
          <polygon
            points={polygonPoints(visualization.cameraRig.body)}
            fill={'url(#' + cameraGradient + ')'}
            stroke="#d0d0d0"
            strokeOpacity="0.55"
            strokeWidth="1.2"
          />
        )}
        {!cameraView && (
          <g fill="none" stroke="#6a6a6a" strokeOpacity="0.9" strokeWidth="4">
            <SvgSegments segments={visualization.cameraRig.tripod} />
          </g>
        )}
        {!cameraView && visualization.cameraRig.lens.visible && (
          <circle
            cx={visualization.cameraRig.lens.x}
            cy={visualization.cameraRig.lens.y}
            r={topView ? 4.5 : 3.5}
            fill="#161616"
            stroke="#999999"
            strokeWidth="1.5"
          />
        )}

        {topView ? (
          <>
            <circle
              cx={visualization.subject.ground.x}
              cy={visualization.subject.ground.y}
              r={Math.max(7, visualization.subject.groundRadius)}
              fill={'url(#' + subjectGradient + ')'}
              stroke="#ffffff"
              strokeOpacity="0.72"
              strokeWidth="1.4"
            />
            <circle
              cx={visualization.subject.ground.x}
              cy={visualization.subject.ground.y}
              r={Math.max(13, visualization.subject.groundRadius + 7)}
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.45"
              strokeWidth="1"
              strokeDasharray="5 4"
            />
          </>
        ) : (
          <>
            {shoulderCenter && visualization.subject.head.visible ? (
              <line
                x1={visualization.subject.head.x}
                y1={visualization.subject.head.y}
                x2={shoulderCenter.x}
                y2={shoulderCenter.y}
                stroke="#a5a5a5"
                strokeWidth={Math.max(
                  3,
                  visualization.subject.headRadius * 0.85
                )}
                strokeLinecap="round"
              />
            ) : null}
            {visualization.subject.body && (
              <polygon
                points={polygonPoints(visualization.subject.body)}
                fill={'url(#' + subjectGradient + ')'}
                stroke="#ffffff"
                strokeOpacity="0.45"
                strokeWidth="1"
              />
            )}
            <g
              fill="none"
              stroke={'url(#' + subjectGradient + ')'}
              strokeWidth={Math.max(
                3.5,
                visualization.subject.headRadius * 0.65
              )}
              strokeLinecap="round"
            >
              <SvgSegments segments={visualization.subject.limbs} />
            </g>
            {visualization.subject.head.visible && (
              <ellipse
                cx={visualization.subject.head.x}
                cy={visualization.subject.head.y}
                rx={visualization.subject.headRadius * 0.88}
                ry={visualization.subject.headRadius * 1.14}
                fill={'url(#' + subjectGradient + ')'}
                stroke="#ffffff"
                strokeOpacity="0.55"
                strokeWidth="1"
              />
            )}
          </>
        )}

        {cameraView && (
          <g fill="none" pointerEvents="none">
            <rect
              x={visualization.width * 0.08}
              y={visualization.height * 0.08}
              width={visualization.width * 0.84}
              height={visualization.height * 0.84}
              rx="0"
              stroke="#ffffff"
              strokeOpacity="0.38"
              strokeWidth="1"
            />
            {[1 / 3, 2 / 3].map((ratio) => (
              <g key={ratio}>
                <line
                  x1={visualization.width * ratio}
                  y1={visualization.height * 0.08}
                  x2={visualization.width * ratio}
                  y2={visualization.height * 0.92}
                  stroke="#ffffff"
                  strokeOpacity="0.4"
                />
                <line
                  x1={visualization.width * 0.08}
                  y1={visualization.height * ratio}
                  x2={visualization.width * 0.92}
                  y2={visualization.height * ratio}
                  stroke="#ffffff"
                  strokeOpacity="0.4"
                />
              </g>
            ))}
            <circle
              cx={visualization.width / 2}
              cy={visualization.height / 2}
              r="12"
              stroke="#ffffff"
              strokeOpacity="0.7"
              strokeWidth="1"
            />
            <line
              x1={visualization.width / 2 - 18}
              y1={visualization.height / 2}
              x2={visualization.width / 2 + 18}
              y2={visualization.height / 2}
              stroke="#ffffff"
              strokeOpacity="0.7"
            />
            <line
              x1={visualization.width / 2}
              y1={visualization.height / 2 - 18}
              x2={visualization.width / 2}
              y2={visualization.height / 2 + 18}
              stroke="#ffffff"
              strokeOpacity="0.7"
            />
          </g>
        )}
      </svg>
    </motion.div>
  )
}

function SvgSegments({
  segments
}: {
  segments: CameraVisualization['floorLines']
}) {
  return segments.map((segment, index) => (
    <line
      key={index}
      x1={segment.from.x}
      y1={segment.from.y}
      x2={segment.to.x}
      y2={segment.to.y}
      vectorEffect="non-scaling-stroke"
    />
  ))
}

function polygonPoints(polygon: CameraVisualization['subject']['body']) {
  if (!polygon) return ''
  return polygon.points
    .map((point) => String(point.x) + ',' + String(point.y))
    .join(' ')
}
