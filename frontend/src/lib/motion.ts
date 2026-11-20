import type { Transition } from 'framer-motion'

/*
 * framer-motion transitions for overlays, mirroring the CSS tokens in `app/motion.css`.
 * Springs use bounce 0 (critically damped, no overshoot); exits are short, soft tweens.
 */

/** Apple-style curves, the same values as `--ease-apple-out` / `--ease-apple-in`. */
const easeOut = [0.32, 0.72, 0, 1] as const
const easeIn = [0.3, 0, 0.8, 0.15] as const

/** Bottom sheets and menu panels rising into place. */
export const sheetEnter: Transition = { type: 'spring', visualDuration: 0.5, bounce: 0 }
export const sheetExit: Transition = { type: 'tween', duration: 0.32, ease: easeIn }

/** Centred dialogs and popups. */
export const dialogEnter: Transition = { type: 'spring', visualDuration: 0.4, bounce: 0 }
export const dialogExit: Transition = { type: 'tween', duration: 0.24, ease: easeIn }

/** Scrims behind overlays. */
export const backdropEnter: Transition = { type: 'tween', duration: 0.34, ease: easeOut }
export const backdropExit: Transition = { type: 'tween', duration: 0.26, ease: easeIn }
