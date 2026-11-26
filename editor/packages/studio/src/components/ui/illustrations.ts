// Ana și Radu and Studio illustrations, served from public/illustrations.
// Names match the files in editor/packages/studio/public/illustrations (copied from the app).
export const STUDIO_ILLUSTRATIONS = [
  "delete",
  "agent-avatar-duo",
  "agent-welcome",
  "agent-thinking",
  "agent-approval",
  "agent-resources",
  "agent-paused",
  "agent-help",
  "agent-navigate",
  "agent-done",
  "agent-offline",
  "agent-busy",
  "agent-history-empty",
  "agent-no-suggestions",
  "agent-working",
  "agent-failed",
  "agent-stopped",
  "agent-listening",
  "agent-typing",
  "studio-crash",
  "studio-drop",
  "studio-empty-project",
  "studio-export-failed",
  "studio-exported",
  "studio-import",
  "studio-media-empty",
  "studio-nothing-selected",
  "studio-offline",
  "studio-opening",
  "studio-preview-error",
  "studio-rendering",
  "studio-save-failed",
] as const;

export type StudioIllustrationName = (typeof STUDIO_ILLUSTRATIONS)[number];

export function illustrationSrc(name: StudioIllustrationName): string {
  return `/illustrations/${name}.webp`;
}
