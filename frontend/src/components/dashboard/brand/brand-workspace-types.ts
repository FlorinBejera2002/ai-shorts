import type { useBrandKit } from './use-brand-kit'

/** Everything the editor reads and changes for one brand kit. */
export type BrandKitController = ReturnType<typeof useBrandKit>
