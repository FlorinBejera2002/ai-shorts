# Create & Clip Editor Redesign — Design

Date: 2026-07-06
Scope: `frontend/src/app/[locale]/dashboard/create/page.tsx`, `frontend/src/app/[locale]/dashboard/clips/[id]/edit/page.tsx`, `frontend/src/components/create/*`, `frontend/src/components/editor/*`, i18n messages (en/ro).

Goal: bring both pages to a professional, product-grade level — visually and functionally — without changing any backend API contract.

## Approaches considered

- **A. Incremental polish** of the existing pages. Low risk, but cannot deliver undo/redo, zoom, split, upload progress — the features that define a professional editor.
- **B. Full rewrite with component decomposition (chosen).** Same API contracts, same design tokens, new components per concern. Highest impact, moderate risk, contained to the two pages.
- **C. Adopt a video-editor library.** Heavy dependency, breaks visual cohesion, overkill for segment-based recut.

## Create page

Page stays the state owner; new components under `components/create/`:

- **`source-youtube.tsx`** — URL input with client-side validation (video-ID extraction), live preview card: thumbnail (`img.youtube.com`), title/author via YouTube oEmbed (graceful fallback if CORS/network fails), clear button.
- **`source-upload.tsx`** — real drag & drop (dragover states), client validation (type + 2 GB), upload via `XMLHttpRequest` to the existing `/api/upload` for progress % + cancel; file card with name, size, local duration probe; replace/remove.
- **`source-batch.tsx`** — per-row URL validation, multi-line paste splits into rows, duplicate detection, counter, max 20.
- **`settings-panel.tsx`** — platform presets that highlight only when current settings match (else "Custom"); clip-count slider; visual aspect-ratio picker (mini frames); visual subtitle-style cards (styled "Abc" preview); brand-kit toggle; collapsible Advanced: language (backend `language`), burn subtitles, smart crop — all already supported by `JobCreate`.
- **`summary-card.tsx`** — recap chips, cost = clips × 10 × videos, live balance from `/api/user/credits`, insufficient-credits warning linking to billing, generate CTA.

## Clip editor

- **`use-editor-state.ts`** — history stacks (`past`/`future`, cap 50), `UNDO`/`REDO`; drags push one history entry at `BEGIN_DRAG`, transient moves don't; new actions: `SPLIT_AT` (playhead), `DUPLICATE_SEGMENT`, `SET_TIMES` (numeric edit), `MARK_SAVED`.
- **`timeline.tsx`** — zoom 1–8× (buttons + Ctrl+wheel) with horizontal scroll and adaptive ruler ticks; scrub by dragging the ruler; snapping of drag/resize to segment edges + playhead (8 px threshold); segment labels (#, duration); playhead auto-follow during playback; double-click gap to add.
- **`filmstrip`** — background frame thumbnails drawn from a hidden `<video>` onto canvases (display survives canvas tainting; wrapped defensively — plain track on any failure).
- **`segment-player.tsx`** — custom controls: play/pause (segment mode aware), prev/next boundary, elapsed-of-total display, playback rate cycle, mute, mode toggle; active segment highlighted.
- **`segment-inspector.tsx`** — selected segment: numeric start/end (0.1 step), ±0.1 nudge, set start/end at playhead, duplicate, delete.
- **`segment-list.tsx`** — order badges, click-to-seek, duplicate, reorder, durations.
- **`export-dialog.tsx`** — confirm with summary; after 202 shows honest "re-rendering started" state (no fake success), link back to clip; marks editor saved.
- **Keyboard** (`use-editor-shortcuts.ts`): Space, ←/→ (±1 s, Shift ±5 s), ,/. (±0.1 s), S split, D duplicate, Del delete, [ / ] set start/end at playhead, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, +/- zoom. `shortcuts-help.tsx` popover documents them.
- **Validation status bar** — total duration, count, overlap/min-duration errors, soft warning > 60 s.
- **Dirty guard** — existing `beforeunload` + in-app confirm on Back while dirty.

## Constraints honored (backend)

- Recut: 1–10 segments, each ≥ 0.25 s, total ≥ 3 s, no overlap (`RecutRequest`).
- Jobs: `num_clips_requested` 1–15, ratios `9:16|1:1|16:9`, `language` optional (`JobCreate`).
- Upload rate limit 12/h; recut/trim 20/h.

## Error handling

All fetches keep the existing `extractError` pattern (string `error` / `detail` / FastAPI array `detail`). Upload XHR maps abort/network/HTTP errors to toasts. oEmbed and filmstrip fail silently to degraded-but-working UI.

## Testing

`tsc --noEmit` + `next build` must pass; manual verification via dev server; code-review agent pass at the end.
