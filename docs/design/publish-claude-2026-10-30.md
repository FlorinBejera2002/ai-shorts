# Publish: approved Claude reference

The user requested implementation of all 16 desktop/mobile artboards in [Sneepcut – Redesign pagina Publish](https://claude.ai/artifact/GxXHfmy7iu1vKNB6KAZeAW#artboard-15dd8cd198dd) on 2026-10-30. The subsequent correction explicitly requires exact visual fidelity, including borders, cards, colors and rounding. This supersedes the initial adaptation to Sneep Cut's neutral palette and shared radii. The latest explicit requests add app-theme support and refine the Media chooser and form actions as described below.

## Exact reference styling

Publish and all its portals follow the app's light or dark theme. Light mode retains the reference palette: canvas `#f5f7fb`, white cards, text `#152035`, secondary text `#4f5c72` / `#647188`, borders `#e3e9f2`, blue primary actions `#2563eb`. Dark mode uses scoped theme tokens for surfaces, controls, text, borders, hover, selected and status states, including dialogs, sheets and dropdowns. Platform brand colors and image/video overlays retain their intended colors. Body text uses locally bundled Inter; headings use Sora. Primary actions and segmented controls are pills; cards use 24px desktop / 20px mobile radii, dialogs use 28px, and individual inputs/previews follow the artboard dimensions. Light-mode shadows use the reference's `rgba(21,32,53,…)` values, with a `rgba(21,32,53,.45)` modal backdrop without blur; dark-mode shadows and backdrops adapt through the scoped theme.

These are explicit exceptions documented in `AGENTS.md`, implemented through `publishing-theme.module.css` and component-specific styles. They do not change other dashboard routes or the mounted shared layout.

| Reference screens | Implementation |
| --- | --- |
| 1. Desktop publishing | Compact account controls, failed-post alert, All/Scheduled/Drafts/Published, day groups, month controls, selected-post preview |
| 2. Mobile publishing and accounts | Single-column queue and focused account sheet, reconnect/connect/disconnect |
| 3. Mobile post detail | Back, media, post text/date/destinations, edit, publish and delete |
| 4. Empty, error and loading | Empty queue, connection affordances, retryable load error, loading skeleton |
| 5–6. Desktop/mobile create and edit | One public text field, platform selection, media, platform options, schedule/mode, optional internal metadata, action footer |
| 7–8. Media | Clips search and pagination; device upload, progress, removal and pointer/keyboard ordering; pending selection with Cancel/Use |
| 9–10. Photo editing | Focused editor, aspect ratio, crop/zoom, reset, alt text, user tags; local pending edits and Done/Cancel |
| 11–12. Platform options | Selected-platform tabs with actual TikTok, YouTube, Instagram and Facebook settings and required provider consent |
| 13–14. Publishing status | Actual destination stages, indeterminate progress, success links, failures and recovery actions; mobile bottom sheet |
| 15–16. Confirmations and popups | Deletion, disconnect, connection success, expanded preview, date/time controls and timezone |

The desktop composer places its form on the left and preview on the right. The Media chooser occupies the full row and has no thumbnail; the separate preview displays the selected media. The mobile composer places a compact preview between destination selection and the public text. Form actions remain in normal document flow at the end of the form, without sticky or fixed positioning, and use the same Publish card and button styling as the other composer sections. Shared dashboard layout, navigation and state remain mounted. Queue view, selection and scroll are restored after editor navigation.

The theme, Media chooser and normal-flow action refinements have passed the focused checks described at the end of this document.

Choosing Publish now in a queue detail opens the editor in publish mode. Submission still runs the existing account, media and provider consent validation. A preview is a simulation; it does not publish anything. Tests mock authentication and every API request, so no provider connection or publication is required.

## Verification commands

Use the running local Vite server, or start `npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173 --strictPort`. Set `PLAYWRIGHT_MODULE` to an installed Playwright entry point and `FRONTEND_ORIGIN` to the local Vite origin.

- `npm --prefix frontend run typecheck`
- `npm --prefix frontend run lint`
- `node --test frontend/tests/publishing-layout.test.mjs frontend/tests/publishing-media.test.mjs frontend/tests/publishing-connections.test.mjs frontend/tests/post-composer-time.test.mjs frontend/tests/social-connection.test.mjs frontend/tests/instagram-post-settings.test.mjs frontend/tests/facebook-post-settings.test.mjs frontend/tests/youtube-post-settings.test.mjs frontend/tests/instagram-image.test.mjs`
- `node frontend/tests/publishing-layout.browser.mjs`
- `node frontend/tests/post-composer-layout.browser.mjs` (set `RUN_FAST_REFRESH=1` after all concurrent source edits finish)
- `node frontend/tests/publish-workflows.browser.mjs`
- `PUBLISH_THEME=dark node frontend/tests/publish-workflows.browser.mjs` (set the environment variable using the current shell)
- `npx react-doctor@latest --verbose --scope changed` from `frontend/`
- `node scripts/storage.mjs --check`

Browser screenshots/reports are written to ignored `frontend/test-results/`. Real OAuth and external social publication are outside these synthetic checks.

## Verified result

On 2026-10-30, TypeScript and all 54 focused unit tests passed. All three browser suites passed with mocked APIs, including desktop/mobile layouts, light/dark themes, Romanian labels, media selection and ordering, photo crop ratios and Cancel/Done, platform settings, scheduling, draft/publish payloads, failure recovery, status sheets and deletion. The composer suite also verified component Fast Refresh and mounted dashboard/sidebar/header identity; queue navigation preserved selection and scroll.

ESLint completed successfully with existing warnings. The final React Doctor changed-file scan reported no diagnostics (project score remained 66/100). The repository storage budget and diff whitespace checks passed. No deployment or real social publication was performed.

The exact-style follow-up added browser assertions against computed colors, radii, border widths, typography and modal overlays. The integrated workflow passed all nine interaction groups and 36 recorded style checks, including Romanian desktop/mobile views, 12px platform choices, square photo crops with a 2px white outline, a single 16px mobile queue gutter, and a bottom-aligned action bar with reachable fields. Queue and composer browser suites also passed after the visual changes. At that stage, the reference palette remained light when the surrounding dashboard used dark mode, and the mobile wordmark retained proper contrast. The latest requests supersede that fixed-light behavior and the earlier action-bar placement.

Tracking: the follow-up ticket `409c7071-a198-811a-a60e-f1bf1b9712e4` was created and moved to Testing. The final Notion update could not complete because the connection returned `object_not_found` for both the ticket and its board; completion evidence is retained here for reconciliation once access is restored.

The final TypeScript and focused lint checks passed after the shared platform-icon extraction. A repeated React Doctor scan did not complete while analyzing the larger, previously modified Create/Story file set and was stopped after an extended wait; that repeat is not counted as a pass. The preceding completed scan reported no diagnostics. Final browser verification and the storage budget check passed.

## Theme and composer refinements verified on 2026-10-30

TypeScript, focused calendar lint (existing warnings only), and 18 affected unit tests passed. The queue browser suite verified light/dark computed colors and switching themes without reloading, remounting the shared shell or losing queue state; the account portal also stayed mounted while changing themes. The composer suite passed media, options, save/edit, scheduling and mobile navigation checks.

The integrated workflow passed in both light and dark mode, including the entire Media row opening from its text and with Enter/Space, no duplicate thumbnail, draft/schedule/publish payloads, photo editing, provider options, status and deletion with mocked APIs. Action cards are the final form child, follow all expanded fields, keep visible text labels on phones, scroll out of view at the top of the mobile form, and remain clear of the shared workspace assistant. Dark-mode text contrast assertions passed for primary actions, captions, metadata and provider inputs. Desktop/mobile light and dark screenshots were inspected. The final React Doctor scan reported no diagnostics, with the project score unchanged at 66/100.

The final composer rerun with `RUN_FAST_REFRESH=1` passed: an open options drawer, unsaved caption, selected destinations/options and the dashboard DOM survived component refresh; the temporary source probe was restored. Storage budgets and whitespace checks passed.

Post-deployment browser testing exposed a production-only mobile positioning bug: CSS minification folded `translate: none` into `transform`, while Tailwind's independent translation still centered the edge-aligned dialogs outside the viewport. The scoped mobile media, photo, platform options, accounts, status, delete and schedule surfaces now also reset both Tailwind translation variables. The shared dialog component is unchanged. See [Tailwind translate properties](https://tailwindcss.com/docs/translate). The workflow asserts mobile dialog bounds and is also run against a built production preview (`npm --prefix frontend run build`, then `npm --prefix frontend run preview -- --host 127.0.0.1 --port 5174 --strictPort`, with `FRONTEND_ORIGIN` pointing at that preview). The minified build, queue suite, composer suite with stricter viewport-edge assertions, and full integrated workflows in light and dark mode all passed. The composer test now uses normal reconnect events to exercise retry behavior in development and production builds.

The required new task ticket could not be created because the connected Notion workspace returned `object_not_found` for Sneep Cut's IT board. No unrelated board was used. Real OAuth connections and external publication remain outside the synthetic checks.
