# SneepCut editor integration — verification record

The source imported into `editor/` is HyperFrames, pinned during this task to
`ea7e1dbd0bd2afb77370b946461c4ea16afdb387`. Preserve upstream licensing and
attribution. Product branding does not transfer ownership of upstream code.

The dashboard integration and authenticated local server are implemented.
This is **not yet verified parity with the proprietary hosted AI services**;
do not advertise that or deploy this local configuration as production-ready.

The full Git LFS import has completed; `git lfs ls-files` reported no remaining
pointer-only entries. Assets are now vendored without upstream LFS filters.
The nested Git metadata was moved, recoverably, to the ignored root directory
`.editor-upstream-history/`. The editor is ordinary source in the SneepCut
repository, not a submodule. Licenses and attribution remain intact.

## Confirmed boundaries

The Studio editor and local Chromium/FFmpeg producer can run without HeyGen APIs.
The repository also contains clients for hosted services whose implementations,
models, voices, avatar identities, and catalogs are not included in this source.
Copying those clients does not reproduce those services.

## Required independence work

- Upstream telemetry in Studio, CLI, and media-use skills is disabled.
- Replace CLI OAuth, credential storage, cloud rendering, publication, and feedback
  with SneepCut-owned implementations; do not just rename endpoints.
- Serve the vendored block/template registry and skills from owned distribution.
- Replace HeyGen media providers and direct audio API calls. Local mflux/LTX/Kokoro
  fallbacks exist for some categories, but do not duplicate hosted model outputs,
  avatar identities, voices, music catalogs, lip-sync, or translation services.
- Bundle/cache rendering dependencies where necessary (GSAP, fonts, models).
- Authenticated project persistence, version-checked save/reopen and per-account
  Studio API/render-job state are implemented. Production render isolation
  still needs a reviewed deployment boundary.

## Verification still required

Build the pinned workspace; run affected Studio tests and React Doctor; compare
all editor/CLI/MCP/SDK operations against the pinned version; verify project
save/reopen, deterministic exports, authorization isolation, and network egress.
Use synthetic accounts and disposable test fixtures, not persistent user data.

## Confirmed direction

Independent replacement services can target the same feature categories, but
identical proprietary hosted assets/models cannot be promised from this source.
The user asked us to build our own implementation of these capabilities. Use
SneepCut-owned orchestration and replaceable providers; do not imply we own or
have trained a proprietary foundation model. Provisioning paid infrastructure
and deployment still require separate authorization.

## Implemented independence changes

- Initial Studio branding uses existing SneepCut assets.
- CLI registry default is the shipped local catalog (`sneepcut:bundled`).
  `SNEEPCUT_REGISTRY_DIR` configures its root for packaged deployments.
  Missing files and LFS pointers fail explicitly without remote fallback.
- Four isolated local-registry tests passed (size bounds, path containment,
  incomplete LFS detection, missing assets). The live local manifest loaded
  408 entries and its first item successfully after generating core artifacts.
- Studio upstream telemetry is removed; feedback is a local downloadable report.
  Six focused privacy/report tests passed, and changed-file lint passed.
- CLI and media-use telemetry transports are no-ops; two focused tests passed.
- Nine additional affected CLI telemetry tests passed; formatting/lint passed.
- Parsers, lint, studio-server, core and the full Studio build passed.
- The own server's TypeScript check and scoped lint passed. Its 26 tests pass
  (121 assertions after the upload-limit regression), including authenticated API save/reopen, stale-write
  rejection, tenant isolation, CSRF, revocation and independent AI proposals.
- The dashboard includes project creation/listing, the full editor iframe,
  fullscreen/new-tab controls and an explicit review/apply AI assistant.
- AI uses only the configured `SNEEPCUT_AI_BASE_URL`/model; missing configuration
  is reported as unavailable. No model service has been provisioned by this task.
- See `studio-self-hosting.md` for startup, storage and remaining release gates.
- Fourteen frontend/session-renewal/navigation tests pass. The Vite production
  build passes. Full frontend typecheck still reports unrelated calendar/jobs/
  settings errors; React Doctor stalled without returning a score.
- Browser preview, timeline play/pause and save were verified with a synthetic
  account. A real isolated thumbnail check produced a 240x135 PNG.
- Fixed the internal render servers overwriting native Request/Response globals,
  which broke the Bun host after rendering. Two live-server regression tests pass.
- Docker image verification was stopped during lengthy dependency installation;
  no successful container build or deployment is claimed.
- Final browser export passed: authenticated preview, play/pause, conditional
  save, render SSE completion and MP4 download (HTTP 200, video/mp4, valid ftyp).
  Independent ffprobe confirmed H.264, 1920x1080, 10 fps, 6.000000 seconds,
  81,341 bytes. Synthetic screenshot/video are in the server verification folder.
- Fixed ffprobe on Windows for long local render paths using native extended
  paths; all 116 affected metadata tests pass, including the new regression.
- Scoped the assistant body limit to its own route so media uploads do not
  inherit the much smaller AI prompt limit; affected integration tests pass.
