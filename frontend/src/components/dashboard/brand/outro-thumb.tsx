import styles from './outro-thumb.module.css'

/** Miniature of the Sneep Cut ending played over the preview clip's frame. */
export function OutroThumb({ poster }: { poster?: string }) {
  const frame = poster ? <img src={poster} alt="" /> : <span />
  return (
    <span className={styles.thumb} aria-hidden="true" data-brand-outro="">
      <span className={styles.half}>{frame}</span>
      <span className={styles.half}>{frame}</span>
      <span className={styles.line} />
      <span className={styles.end}>
        <span className={styles.halo} />
        <img className={styles.mark} src="/logo-icon.svg" alt="" />
      </span>
    </span>
  )
}
