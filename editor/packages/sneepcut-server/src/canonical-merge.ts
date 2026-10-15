/** Public canonical revision API; merges are staged before the service performs CAS. */
export { CanonicalMergeConflict } from "./canonical-merge-html";
export {
  mergeCanonicalFiles,
  readEffectiveComposition,
  type CanonicalMergeResult,
  type EffectiveComposition,
  type EffectiveScene,
} from "./canonical-merge-files";
export {
  mergeCompositionProject,
  removePlatformBadge,
  type MergeCompositionProjectOptions,
} from "./canonical-merge-project";
