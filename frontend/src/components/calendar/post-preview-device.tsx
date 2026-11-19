'use client'

import type { ScheduledPostRecord } from '@/lib/content-calendar'
import type { PublishingData } from '@/lib/publishing'
import type { CSSProperties } from 'react'
import { CalendarPostMedia } from './calendar-post-media'
import { PlatformPreviewOverlay, type PreviewPlatform } from './post-preview-platform-overlay'
import styles from './post-preview-device.module.css'

/** Canvas presentations of the phone preview: scale of the 390px design screen and its frame. */
export type PreviewDeviceSize = 'inline-desktop' | 'inline-mobile' | 'expanded-desktop' | 'expanded-mobile'

type DeviceSpec = {
  scale: number
  /** Expanded previews show the phone status bar and platform navigation. */
  chrome: boolean
  /** Frame corner radius in rendered pixels. */
  radius: number
  /** Frame ring in rendered pixels; the canvas uses a dark ring on desktop and a hairline on mobile. */
  ring?: { width: number; color: string }
}

const deviceSpecs: Record<PreviewDeviceSize, DeviceSpec> = {
  'inline-desktop': { scale: 0.6154, chrome: false, radius: 24 },
  'inline-mobile': { scale: 0.5128, chrome: false, radius: 22 },
  'expanded-desktop': { scale: 0.7897, chrome: true, radius: 34, ring: { width: 8, color: '#0b0b0c' } },
  'expanded-mobile': { scale: 0.8532, chrome: true, radius: 30, ring: { width: 1, color: 'rgb(255 255 255 / 14%)' } }
}

const screenWidth = 390
const chromeScreenHeight = 844
const captureScreenHeight = 693

/** Inline and expanded previews share one stage: the media fills the design screen and the platform overlay sits above it. */
export function PostPreviewDevice({ size, platform, accountName, post, publishingClips }: {
  size: PreviewDeviceSize
  platform: PreviewPlatform
  accountName?: string
  post: ScheduledPostRecord
  publishingClips: PublishingData['clips']
}) {
  const spec = deviceSpecs[size]
  const screenHeight = spec.chrome ? chromeScreenHeight : captureScreenHeight
  const mediaHeight = spec.chrome ? chromeScreenHeight - 84 : captureScreenHeight
  const ring = spec.ring
  const stageStyle: CSSProperties = {
    zoom: spec.scale,
    height: screenHeight,
    borderRadius: spec.radius / spec.scale,
    boxShadow: ring ? `0 0 0 ${ring.width / spec.scale}px ${ring.color}` : undefined,
    '--media-height': `${mediaHeight}px`,
    '--publishing-image-height': `${mediaHeight}px`
  } as CSSProperties

  return (
    <div className={styles.device} style={{ width: screenWidth * spec.scale }}>
      <CalendarPostMedia
        post={post}
        publishingClips={publishingClips}
        stage={{ className: styles.screen, style: stageStyle }}
        overlay={(
          <PlatformPreviewOverlay
            platform={platform}
            accountName={accountName}
            caption={post.caption ?? ''}
            chrome={spec.chrome}
          />
        )}
      />
    </div>
  )
}
