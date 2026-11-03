# Clips and Scripts: approved Claude reference

On 2026-10-30 the user asked for the Clips ("Clipuri") and Scripts ("Scripturi") pages to be implemented exactly as drawn in the canvas [Sneepcut – Redesign Publish, Brand kit, Clipuri, Scripturi](https://claude.ai/artifact/GxXHfmy7iu1vKNB6KAZeAW) (pages *Clipuri* and *Scripturi*, including their Dark mode boards). This extends the Publish design exception in `AGENTS.md`.

## Theme

Both pages reuse `components/calendar/publishing-theme.module.css`: the root and every portal (menus, listboxes, dialogs, sheets) carry `theme.surface` and `data-reference-surface`; dialogs/sheets use `theme.overlay`. `#dashboard-main` is painted with the reference canvas, and `studio-shell.css` excludes `[data-reference-surface]` from its global card/input/button overrides. Light mode uses the reference palette; dark mode uses the scoped Publish dark tokens. Score and status colors that have no shared token are local to the component CSS with light/dark values taken from the canvas `dark.css`.

## Clips (`components/clips`, view `components/dashboard/views/projects.tsx`)

| Artboard | Implementation |
| --- | --- |
| Desktop page | Header with count pill and "Clip nou"; project rail card (`clips-project-rail`); search + Score/Format/Subtitles/Sort pills + "Șterge filtrele" (`clips-library-toolbar`); 9:14 tiles with score, CC, ⋯ and duration (`clip-library-card`); "1–24 din N" pagination |
| Menus and filters | Clip menu with Open/Publish/Download/Move/Delete (`clip-actions-menu`, `appearance="reference"`); project menu (Brand kit/Rename/Delete); score listbox with dots; drag-to-project with "Adaugă aici" |
| Dialogs | New/rename project, delete project and delete clip confirmations, project brand kit (`clips-dialogs`, `clips-brand-dialog`) |
| Mobile | Project picker sheet + dashed new-project button (`clips-mobile-projects`), filter sheet with chips and Apply (`clips-mobile-filters`), action sheet, bottom-sheet dialogs, full-screen brand kit |
| States | Empty library, empty project, no results, load error, loading skeleton (`clips-states`) |

`ClipCard` (dashboard Recent clips) keeps the default dashboard style. Deletion now uses a confirmation dialog instead of `window.confirm` on the Clips page. Deleting a project keeps its clips under "Fără proiect" (database `ON DELETE SET NULL`).

## Scripts (`components/script`, page `app/[locale]/dashboard/script-generator/page.tsx`)

Library (desktop cards / mobile rows, archived switch), states (empty, no matches, load error, empty document, generating), editor (pill header with status listbox, save state, versions, copy/download/⋯; brief card; navy 3D coach card; hook, scenes, CTA/caption/hashtags), mobile sheets (actions, versions) and the shooting coach (dark stage, Studio/Camera/Plan, playback bar, scene details, proportional timeline). Deviations: separate `<label for>` elements, two extra coach tiles so no information is lost, unmatched legacy tone/style values shown as an extra chip, header Download saves `.txt` while ⋯ › Download JSON keeps JSON.

## Verification (2026-10-30)

Run in a clean install of `frontend/` with mocked APIs (the device `node_modules` symlinks are unreadable from the Linux VM):

- `tsc -b` and oxlint on the changed folders: pass (only pre-existing warnings elsewhere).
- `node --test tests/clip-card-navigation.test.mjs tests/clips-library-query.test.mjs tests/script-platform-select.test.mjs tests/camera-visualization.test.mjs`: 20/20.
- `node tests/clips-layout.browser.mjs` and `node tests/scripts-layout.browser.mjs` (Scripts also with `RUN_FAST_REFRESH=1`): pass, including shell/sidebar identity, light/dark and desktop/tablet/mobile. Set `PLAYWRIGHT_CHANNEL=` (empty) to use Playwright's bundled Chromium instead of Chrome.
- Light/dark desktop and 390px screenshots were inspected against the canvas.

No deployment was performed. The Notion ticket required by `AGENTS.md` was not created: no Notion connection is available in this session.
