# Go / Vite migration verification — 2026-09-21

Status: **partial parity, not approved as an identical replacement yet**.

Reference: Git HEAD `0e5b3e2` and the existing React UI components. The migration was already present as extensive uncommitted changes. This audit preserves those changes. No deployment or production database mutation was performed. The user waived Notion ticket creation.

## Corrected regressions

- Restored the actual global stylesheet and self-hosted Sora, Manrope and Bodoni Moda fonts.
- Repaired navigation compatibility imports, dedicated Brand/Billing routes, legacy redirects and the client-side Studio route.
- Restored the six additional legal routes and their page titles/descriptions.
- Restored generated robots.txt and sitemap.xml from the shared site configuration using Vite build/server hooks.
- Replaced Axios's Fetch emulation with native Fetch, preserving binary responses, multipart uploads and long requests. Account changes clear the account-scoped query cache.
- Stabilized API-resource reload callbacks; preserved the dashboard layout across child-route navigation.
- Repaired Vite's CSS configuration, development ports/proxies and polling configuration, production proxy paths and static HTML caching.
- Added the missing Go worker executable and Docker worker image with FFmpeg, whisper.cpp, speech model and face detector. Restored worker services in Compose and deployment scripts. An untargeted backend Docker build now starts the API rather than the migrator.
- Fixed FFmpeg video stream mapping, invalid hook-text drawtext argument, platform badge tracking and clean TikTok derivative generation.
- Restored subtitle word grouping and crossfade timestamp mapping. Persisted highlight score reasons and suggested hashtags.
- Restored Calendar's TikTok eligibility condition: a clip containing the platform badge needs a clean derivative.
- Updated obsolete migration test expectations/fixtures and frontend checks tied to removed Next/Cloudflare artifacts.

## Verification completed

| Check | Result |
| --- | --- |
| Vite production build and TypeScript | Passed, including robots.txt and sitemap.xml output |
| Frontend tests | 136 total: 135 passed, 1 skipped (native Bash deployment harness on Windows) |
| Frontend lint | Exit 0; existing warnings remain |
| Go suite in Linux with dedicated PostgreSQL | Initial run exposed Calendar and migration failures; affected packages passed after fixes |
| Go vet in Linux | Passed |
| Worker Docker build | Passed, including build-stage Go race tests/vet; build-stage DB tests skip without their database fixture |
| Worker completion integration | Passed: clip persistence, stale ownership rejection and exactly-once failure refund |
| FFmpeg render regression | Passed on real synthetic video/audio, including badge and clean TikTok outputs |
| Whisper runtime | Successfully transcribed the upstream JFK sample using the bundled base model |
| Compose development and production configuration | Parsed successfully; production validation used synthetic environment values |
| Browser authenticated pages | Home, Brand, Billing, Settings, Publish, new post, Scripts, Studio gallery, Clips and clip detail rendered |
| Browser mutations | Brand color and synthetic clip title saved through the Go API |
| Fast Refresh | Component hot update preserved the unsaved Settings display name and collapsed sidebar |
| Route navigation | Shared sidebar remained collapsed across routes; stable accessibility nodes observed |
| Mobile | Clip detail inspected at 390 × 844; no full mobile page matrix completed |

Browser writes used a synthetic account and a disposable PostgreSQL container whose database is named `sneepcut_integration_test`. Database tests used isolated schemas. User database/media volumes were not used as fixtures.

Local logs: `.migration-frontend-final.log`, `.migration-build-final.log`, `.migration-lint-final.log`, `.migration-go-linux.log`, `.migration-go-regressions.log`, `.migration-go-vet.log`, `.migration-worker-build.log`, `.migration-whisper.log`. React Doctor did not finish all maintainability checks and produced no complete score; it is not a clean bill of health.

## Remaining differences and unverified flows

1. **YouTube input is not equivalent.** `backend/internal/processing/source.go` chooses a combined MP4 with audio. The previous downloader selected adaptive video/audio formats, merged them and supported proof-token provider configuration. Videos without a combined format and provider-blocked requests remain a compatibility risk.
2. **Brand render parity is incomplete.** The Go hook overlay currently uses fixed white text and a single background, with byte truncation. It does not reproduce the prior selected font, secondary-color decoration, measured line wrapping and contrast behavior. Exact exported-video appearance is not established.
3. **Speech/highlight output equivalence is not established.** Running whisper.cpp successfully does not prove identical transcripts, timing or AI-selected highlights relative to the previous Python stack. A representative input/output comparison is still required.
4. **Visual identity is not certified for every page/state.** Existing UI components are reused, but no complete screenshot baseline against the previous Next application was run. Public locale variants, all mobile sections, menus, validation/error/loading states and populated editor states need a full comparison matrix.
5. **Full video workflow is not certified.** FFmpeg, speech runtime, persistence and UI metadata saving were tested separately. An upload/YouTube → AI highlights → worker → playable media → cutter/Studio export round trip was not completed. The browser clip fixture had metadata only, so its unavailable media preview is not a playback pass.
6. **External providers were not exercised.** OAuth, email delivery, Stripe checkout/webhooks and social publishing need isolated provider test credentials/accounts. Disabled provider buttons in the audit environment are expected and do not prove integration success.
7. **Development tooling still has legacy coverage gaps.** The old `scripts/test-dev-reload.mjs` targets the previous stack. Worker source changes currently require rebuilding the worker image; the Go API has Compose Watch and frontend components have Vite Fast Refresh.
8. A transient React hook-order error was observed during earlier hot updates; a fresh load and subsequent component Fast Refresh check passed. It was not reproduced as a normal route-navigation failure.

The migration must not be represented as fully functional or pixel-identical based only on the passing checks above.

Implementation reference: [official Vite plugin API](https://vite.dev/guide/api-plugin), used for generated site assets and development middleware.
