# Brand rendering and caption style v1

Brand Kit has two customer sections: **Logo & watermark** and **Captions**. General
palette/typeface fields remain readable for legacy projects but are no longer
customer controls. New kit defaults keep brand-color overlays disabled. Legacy
explicit hook overlays retain their existing Go/FFmpeg behavior.

## Persisted settings and historical projects

Migration `046_20261014_caption_styles.sql` adds `brand_kits.caption_style`, logo
watermark enabled/size/margin, private `caption_fonts`, and job/story brand
snapshots. New jobs capture the owner's kit. A Story using its Brand Kit snapshots
the kit on first generation; later global changes do not rewrite that project.
Existing rows without a versioned style retain the old caption rendering path.
When explicitly moving a legacy kit into new styled generation, exact curated
family/weight pairs are preserved. A proprietary/local legacy family without a
bundled resource must be uploaded or explicitly replaced; it is never silently
remapped to Inter or a lookalike. Historical projects/settings remain intact.
Explicit Story caption styles override the snapshot caption style. Logo resource
ownership and Agency-only platform-badge removal are still enforced server-side.

Logo removal detaches supported raster files rather than removing bytes needed
by saved snapshots. Font removal archives its resource; saved projects can still
read and export it. Account cleanup removes both retained owner namespaces.

## One caption contract

`internal/captions.Style` and the frontend `CaptionStyle` define version 1. Font
resource ID, supported weight, short-edge-relative size, colors, outline/shadow,
background opacity, alignment, maximum width/lines, line spacing and center-anchor
position are persisted. X/Y are normalized against the video content. Aspect-ratio
changes retain the normalized anchor; text is rewrapped and its visible bounding
box clamped within the new frame. Long tokens and large blocks are scaled to fit.
The preview is the video frame itself, so surrounding layout and letterboxing do
not affect saved coordinates. Pointer capture supports mouse and touch; arrow
keys nudge 1%, Shift+arrow 5%; center snapping and reset are available.

The same selected font bytes are loaded on demand through authenticated API calls
and materialized into an isolated per-render FFmpeg/libass font directory. The
renderer fails when a requested asset, weight, or required glyph is unavailable;
it does not knowingly substitute another font. The catalog contains 32 embedded
families with verified Romanian glyphs, supported static weights, source URLs,
SHA-256 hashes and bundled licenses. Only requested preview fonts load in the
browser; a bounded font-face cache retains currently mounted selections.

Custom uploads accept validated TTF/OTF outlines (8 MiB per font). sfnt metadata
preserves multiword family/style names, checks glyph tables and reads the actual
weight. WOFF, WOFF2 and collections are rejected rather than claiming unsupported
normalization. Uploads require explicit license confirmation, authentication and
membership. Opaque resource IDs map to owner-isolated storage keys; cross-account
reads/settings are rejected. Private bytes are served through the authenticated API
with no-store caching, including for object storage; bucket CORS is not required
for font previews. Existing archived fonts remain usable by their owner.

## Presentation and timing

Twelve preset IDs implement actual ASS presentation: classic, minimal,
bold-outline, contrast-box, headline, word-by-word, karaoke, active-color,
active-background, phrase-pop, subtle-fade, stacked. Stacked uses two lines when
allowed, and respects a one-line maximum. Timed effects use aligned word bounds;
word display and active highlighting disappear in real gaps, karaoke fill uses
centisecond libass timing, and phrase pop/fade operate on phrase boundaries.

Ordinary clips with no word alignment can use static captions only from complete,
measured transcript segments inside the selected cut. Such fallback preserves the
real phrase bounds and disables word animation; it never distributes guessed word
times. Missing/invalid bounds yield an actionable error when transcript text exists.
Story source verification already withholds unverified text/timing and records its
caption warning. Invalid word groups reaching the styled renderer now fail rather
than silently disappearing.

Preview timing is explicitly demonstration content, not a speech alignment claim.
The CSS/canvas preview uses the selected font metrics, contract, layout and preset
behavior. Browser and libass rasterization/outline rendering are not pixel-identical.
The authoritative check is an exported video. JASSUB was considered: exact libass
browser rasterization would add WASM/worker assets, browser compatibility and
optional cross-origin isolation headers for multithreading. No preview dependency or deployment changes
are required for this implementation. A future libass preview can consume the same
contract and ASS output without changing persisted projects.

## Verification

- Caption unit tests validate all 32 families/weights, Romanian characters,
  malformed custom files, multiword family metadata, contract roundtrip,
  distinct ASS events, real timing, long-token scaling and static fallback.
- Native media regression renders all 12 presets at 9:16, 1:1 and 16:9 with an
  uploaded private Open Sans font and Romanian text; decoded pixels verify
  visible text and normalized placement.
- Isolated `sneepcut_integration_test` coverage checks owner isolation, saved
  positions, brand snapshot behavior, HTTP permission/content validation,
  archival and real Story plus ordinary/TikTok exports.
- `frontend/tests/brand-captions.browser.mjs` checks both sections, lazy loading,
  search/custom upload, keyboard/drag persistence, and desktop/mobile overflow.

References: [Go sfnt](https://pkg.go.dev/golang.org/x/image/font/sfnt),
[FFmpeg subtitles](https://ffmpeg.org/ffmpeg-filters.html#subtitles-1),
[ASS tags](https://aegisub.org/docs/latest/ass_tags/),
[JASSUB](https://github.com/ThaUnknown/jassub).
