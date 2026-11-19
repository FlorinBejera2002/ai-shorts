import type { FeaturePanel, FeatureRow, SiteCopy } from '@/content/copy/types'
import { FeatureTabs } from './feature-tabs'
import { PlatformLogo } from './platform-logo'
import styles from './features.module.css'

/** Waveform from the canvas; highlighted bars mark the three selected moments. */
const WAVEFORM = [20, 74, 30, 32, 27, 50, 58, 57, 66, 35, 32, 22, 58, 26, 78, 39, 52, 27, 31, 50, 49, 75, 36, 56, 20, 35, 28, 72, 47, 64, 44, 27, 33, 37, 72, 31, 73, 22, 30, 25, 56, 51, 65, 59, 40, 29, 26, 59, 25, 80, 29, 53, 24, 34, 46, 58]
const SELECTED_RANGES = [[3, 6], [16, 19], [42, 46]]
const isSelectedBar = (index: number) => SELECTED_RANGES.some(([from, to]) => index >= from && index <= to)

function PhonePreview({ duration, caption }: { duration: string; caption: [string, string] }) {
  return (
    <div className={styles.phone} aria-hidden="true">
      <img src="/landing/illustrations/clip-frame.webp" alt="" width={220} height={391} loading="lazy" decoding="async" />
      <span className={styles.duration}>{duration}</span>
      <span className={styles.caption}>
        {caption[0]}
        <span className={styles.highlight}>{caption[1]}</span>
      </span>
    </div>
  )
}

function RowMarker({ row, clip, selected }: { row: FeatureRow; clip: boolean; selected: boolean }) {
  if (row.platform) return <PlatformLogo platform={row.platform} size={28} radius={8} decorative />
  if (clip) return <span aria-hidden="true" className={`${styles.thumb} ${selected ? styles.thumbSelected : ''}`} />
  const ratio = row.title.match(/^(\d+):(\d+)/)
  if (ratio) {
    const [width, height] = [Number(ratio[1]), Number(ratio[2])]
    const scale = 24 / Math.max(width, height)
    return (
      <span aria-hidden="true" className={styles.ratioSlot}>
        <span className={styles.ratio} style={{ width: width * scale, height: height * scale }} />
      </span>
    )
  }
  return <span aria-hidden="true" className={styles.dot} />
}

function SourceTimeline({ summary }: { summary: [string, string] }) {
  return (
    <div className={styles.timeline}>
      <span className={`muted ${styles.timelineSummary}`}>
        <span>{summary[0]}</span>
        <span>{summary[1]}</span>
      </span>
      <span aria-hidden="true" className={styles.waveform}>
        {WAVEFORM.map((height, index) => (
          <span key={index} style={{ height: `${height}%` }} className={isSelectedBar(index) ? styles.barSelected : undefined} />
        ))}
      </span>
    </div>
  )
}

function FeaturePanelCard({ panel, home, withTimeline }: { panel: FeaturePanel; home: SiteCopy['home']; withTimeline: boolean }) {
  return (
    <div className={`card ${styles.panel}`}>
      <PhonePreview duration={home.clipDuration} caption={panel.caption} />
      <div className={styles.panelBody}>
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>{panel.heading}</h3>
          {panel.badge && <span className={styles.badge}>{panel.badge}</span>}
        </div>
        <ul className={styles.rows}>
          {panel.rows.map((row, index) => (
            <li key={row.title} className={styles.row}>
              <RowMarker row={row} clip={withTimeline} selected={index === 0} />
              <span className={styles.rowText}>
                <b>{row.title}</b>
                {row.meta && <span className="muted">{row.meta}</span>}
              </span>
            </li>
          ))}
        </ul>
        {withTimeline && <SourceTimeline summary={home.sourceSummary} />}
      </div>
    </div>
  )
}

export function FeatureShowcase({ copy, id }: { copy: SiteCopy['home']; id: string }) {
  const panels = copy.featurePanels.map((panel, index) => (
    <FeaturePanelCard key={panel.tab} panel={panel} home={copy} withTimeline={index === 0} />
  ))

  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <div className="container">
        <h2 id={`${id}-title`} className={`heading ${styles.title}`}>
          {copy.featuresTitle}
        </h2>
        <FeatureTabs label={copy.featuresLabel} tabs={copy.featurePanels.map((panel) => panel.tab)} panels={panels} idPrefix={`${id}-feature`} />
      </div>
    </section>
  )
}
