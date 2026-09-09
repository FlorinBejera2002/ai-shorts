# Production launch audit — 2026-09-09

Status: in progress. This is an evidence log, not a launch approval.

## Verified against production

- Target: https://sneepcut.com and https://api.sneepcut.com.
- Current server release at audit start: `58ec93626f72ea2a`.
- Homepage and Romanian pricing page render; the first pricing FAQ expands.
- Romanian privacy and data-deletion pages render with `admin@sneepcut.com` contact links.
- SSH access works directly to `root@159.195.254.38`; the local `sc` alias does not resolve.
- Production containers are running; API, frontend, database, Redis and ClamAV report healthy.
- Aggregate database inspection: one completed job, two failed jobs. Both failures are YouTube bot checks.
- Both stored clips pass ffprobe: H.264 video at 1080×1920 and AAC audio; durations 18.333 and 22.600 seconds, sizes 2,015,129 and 2,290,555 bytes. This does not verify playback in the browser, editorial quality, subtitles or reframing.

## Confirmed launch blockers

- Stripe keys and all paid price IDs are missing on the server. Local Stripe values are placeholders, not usable credentials. Live pricing displays unavailable prices.
- Resend key is missing. Email delivery has not been verified.
- YouTube cookie file is absent or empty; two existing jobs failed the bot challenge despite the provider service being running.
- Instagram app secret and TikTok client credentials are missing. Provider setup and approval status must be rechecked before claiming publishing works.
- Google sign-in reached the consent screen for `admin@sneepcut.com`. Automatic approval review rejected clicking Continue pending explicit authorization to transfer name, profile photo and email to Sneepcut. No bypass was attempted.

## Corrections in progress

- Pricing Agency CTA advertised contacting sales but linked to registration. Updated it to use the configured contact email, with a registration label fallback when no contact email exists. TypeScript check passed; React Doctor pending.
- Dashboard design commit `3abaa5b` is already on main but was not deployed at audit start.
- Existing uncommitted YouTube and deployment changes remain under review; they are not yet validated or committed by this audit.

## Still requiring actual functional verification

Both locales, responsive layouts, all public navigation and auth forms; dashboard home, create, upload, YouTube import, review, clip playback/download/editor, history/job details, analytics, calendar, scripts, publishing, brand kit, billing, settings and account-data actions. Run controlled end-to-end jobs and inspect resulting video/audio/captions. Check provider callbacks and publishing outcomes with a specifically authorized test post. Record individual results and failures, then deploy fixes and repeat affected live checks.

Do not mark the launch task Done while these checks and external configuration blockers remain.
