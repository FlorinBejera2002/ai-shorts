# ClipForge launch readiness research

Last reviewed: 2026-06-30

## Market baseline

The closest mature products are OpusClip, quso/vidyo.ai, Vizard and Klap. The shared baseline users now expect from an AI clipping product:

- Long-form video import from upload and YouTube/TikTok/Zoom-style URLs.
- AI highlight detection with explainable scoring, hook detection and transcript context.
- Vertical, square and landscape exports with speaker-aware reframing.
- Fast subtitle generation with animated styles, emojis, keyword emphasis and custom brand presets.
- Text/transcript-based editing so users can trim clips without a timeline-first editor.
- Brand kits, reusable templates, safe areas and platform-specific export presets.
- Batch generation, regeneration, clip ranking, folders/projects and team workspaces.
- Publishing or scheduling to TikTok, YouTube Shorts, Instagram Reels and LinkedIn.
- Strong media lifecycle controls: private assets, expiring URLs, deletion, retention and auditability.
- Usage-based credits, plan limits, billing, onboarding and clear job progress/error recovery.

Useful references:

- OpusClip: https://www.opus.pro/
- quso/vidyo.ai: https://vidyo.ai/
- Vizard: https://vizard.ai/
- Klap: https://klap.app/
- OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- OWASP API Security Top 10: https://owasp.org/API-Security/editions/2023/en/0x11-t10/
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/

## Implemented in this hardening pass

- Backend CORS is now env-configurable instead of hard-coded.
- Backend docs/OpenAPI are disabled in production.
- Backend returns baseline security headers and HSTS in production.
- Backend authenticated routes can require an internal API key from the Next.js gateway.
- Frontend sends the internal API key to the backend when configured.
- Production Docker Compose no longer publishes Postgres, Redis, backend or frontend ports directly; Nginx is the public entry point.
- Nginx routes `/api/*` to Next.js so NextAuth, route handlers and rate limiting are not bypassed.
- Upload endpoint validates extension, MIME type, initial video signature and max byte size.
- Job creation validates uploaded file ownership and blocks private-network URL targets.
- Registration, upload and job creation have request rate limits at the Next route layer.
- Next image remote wildcard was removed; remote hosts must be explicitly configured.
- Next.js sends baseline browser security headers and a conservative CSP.
- Create flow now includes platform presets for TikTok, Reels, Shorts and LinkedIn.
- Dashboard now has a Review queue for sorting generated clips by viral score and publishing readiness.
- Clip detail now has a review workspace with editable title/hook, readiness checklist, platform fit, transcript copy and social caption copy.

## Product gaps before a serious public launch

- Add a clip review/editor flow: transcript trim, hook/title editing, subtitle style preview and manual crop override.
- Add AI clip scoring and reasons: hook strength, pacing, speaker clarity, topic, emotional peak and platform fit.
- Add brand templates with safe-area overlays for TikTok/Reels/Shorts.
- Add social publishing with OAuth per platform and post status tracking.
- Add team workspaces, roles and shared brand kits.
- Add deterministic media retention controls: delete source, delete outputs, export user data.
- Add onboarding with sample job and clear processing-time expectations.
- Add billing enforcement at every expensive path, not just job creation.

## Security and reliability gaps

- Replace in-memory rate limiting with Redis-backed rate limiting for multi-instance production.
- Validate JWT/session at the backend or keep backend private-only at the network layer.
- Run ffmpeg/video processing in a constrained sandbox with CPU, memory, timeout and filesystem limits.
- Add virus/malware scanning for uploads before processing.
- Store media in private object storage and serve clips through signed, expiring URLs.
- Add structured audit logs for auth, uploads, job creation, billing and deletion.
- Add Sentry/OpenTelemetry-style error tracking and trace IDs across Next, FastAPI and Celery.
- Add automated dependency scanning and container image scanning in CI.
- Add backup/restore drills for Postgres and object storage metadata.
- Add abuse controls for URL imports: allowlist supported domains where possible, DNS rebinding protection and fetch timeouts.

## Performance and scale gaps

- Move long uploads to direct-to-object-storage signed uploads.
- Generate low-resolution previews before final exports.
- Cache transcripts and intermediate analysis so users can regenerate clips cheaply.
- Split CPU/GPU worker queues and enforce per-plan concurrency.
- Add job cancellation that reliably stops child ffmpeg/process tasks.
- Add queue depth, processing duration and failure-rate metrics.

## Recommended next implementation order

1. Backend-private deployment and Redis rate limiter.
2. Signed private media URLs and retention/deletion controls.
3. Processing sandbox limits and upload malware scanning.
4. Full clip editor with transcript trim, subtitle preview and manual crop override.
5. AI score/reason model and regeneration controls.
6. Observability, audit logs and billing enforcement tests.
