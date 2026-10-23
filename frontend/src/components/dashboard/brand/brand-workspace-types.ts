import type { CaptionEditorSection } from './caption-editor-types'
import type { useBrandKit } from './use-brand-kit'

export type BrandWorkspaceSection = CaptionEditorSection | 'logo'
export type BrandKitController = ReturnType<typeof useBrandKit>
