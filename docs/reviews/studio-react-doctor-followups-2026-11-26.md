# Studio React Doctor follow-ups (2026-11-26)

These are confirmed React Doctor findings from the Studio redesign that were not fixed before the release. Each would need a separate decision or refactor. They are recorded here because the GitHub CLI is not available in this environment. Open one GitHub issue per section when convenient.

## 1. Data fetching inside effects (`react-doctor/no-fetch-in-effect`)

- **Files:**
  - `editor/packages/studio/src/components/StudioConnectionLost.tsx:74`
  - `editor/packages/studio/src/components/shell/useProjectTitle.ts:48`
  - `editor/packages/studio/src/components/sidebar/useMediaLibrary.ts:57`
  - `editor/packages/studio/src/hooks/useBlockCatalog.ts:87`
- **Confidence:** high that the pattern is present; low that it causes user-visible bugs today.
- **Impact:** Each call already aborts on unmount and checks `res.ok`. What is missing:
  - shared caching
  - deduplication
  - consistent retry
- **Proposed fix:** Choose one data-fetching approach for Studio and migrate these four hooks to it. This is an architecture decision; the candidates are TanStack Query or a small shared `useResource` hook.

## 2. Parent callbacks driven by effects (`no-pass-data-to-parent`, `no-pass-live-state-to-parent`, `no-prop-callback-in-effect`)

- **Files:** `editor/packages/studio/src/player/components/Player.tsx:407` and `:411`.
- **Confidence:** medium.
- **Impact:** `onCompositionLoadingChange` and `onPreviewErrorChange` fire one render after the state changes. This causes an extra render, and the parent briefly sees stale state.
- **Proposed fix:**
  - Compute `reportedLoading` and `previewError` in the parent from the same sources, or
  - call the callbacks from each setter that changes those states.
- **Note:** This needs a refactor of the loading state machine, so it was left out of the redesign.

## 3. High control-flow complexity (`no-high-complexity-react-function`, about 30 functions) and large component (`no-giant-component`)

- **Examples:**
  - `StudioRightPanel.tsx:40`
  - `PropertyPanelFlat.tsx:37`
  - `Timeline.tsx:62`
  - `TimelineClip.tsx:37`
  - `AgentPanel.tsx:57`
  - `DomEditCropHandles.tsx:95` (large component)
- **Confidence:** high (style and maintainability).
- **Impact:** These functions are harder to change safely. No functional bug was found.
- **Proposed fix:** Split each function into smaller presentational parts when that area is next changed. Do not do this as a bulk cleanup.

## 4. Non-component exports in component files (`only-export-components`, about 85 sites)

- **Confidence:** high.
- **Impact:** Fast Refresh falls back to a full module reload for these files during development. AGENTS.md asks for component-scoped Fast Refresh.
- **Proposed fix:** Move constants, helpers and hooks out of each `.tsx` component file into sibling `.ts` modules. Do this area by area: inspector (`editor/propertyPanel*`), sidebar, then player.

## 5. Kept by design

- **`ui/Sheet.tsx:32` (`prefer-html-dialog`):** `useDialogBehavior` already provides:
  - a focus trap
  - Escape to close
  - initial focus
  - focus restore

  Moving to native `<dialog>` would change portal stacking above the timeline.
- **`sidebar/RenamePopover.tsx` (`no-autofocus`):** The rename field is focused on open on purpose. It is now focused from an effect rather than with `autoFocus`.
- **Label findings in `motionUi.tsx` and `propertyPanelFlatMotionSection.tsx`:** These are false positives. `CommitField` renders a native `<input>` inside the label.
- **`editor/propertyPanelColorGradeLutFiles.ts:69` (`no-promise-then-side-effect-in-effect-without-catch`):** This is a false positive. The chain already ends in `.catch(() => undefined)`. The rejections it absorbs are aborts on unmount or a failed HEAD request for a file size that is only shown for information.
- **`sidebar/CompositionsTab.tsx:211`, `:276` (`prefer-html-dialog`) and `:368` (`prefer-tag-over-role`):** These custom overlays existed before the redesign. Moving them to the shared `ui/Dialog` is a small follow-up. Confidence is medium and the accessibility impact is low, because both already close on Escape.
