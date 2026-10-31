# Approved Sneep Cut design direction

For Publish, the user approved a newer complete desktop/mobile reference on 2026-10-30: [Claude Publish screens and implementation mapping](publish-claude-2026-10-30.md). The subsequent explicit request requires its exact borders, cards, colors, radii and typography. This supersedes the older Publish visual rules below, including the neutral brand/radius adaptation; functional requirements still apply.

The user approved this direction on 2026-10-22. Use it as the starting visual language for Sneep Cut UI design, especially Publish and New post. Read this guide and open the relevant image before extending these surfaces. Explicit later user feedback takes precedence.

## Visual sources

- [Approved New post](assets/new-post-approved-2026-10-22.png): the third displayed New post concept, simplified after the user rejected separate title and description fields.
- [Publish reference](assets/publish-reference-2026-10-22.png): the refined second Publish concept, with a queue and selected-post preview.
- [Desktop and mobile interaction mockups](new-post-states-2026-10-22/README.md): Platform options, device upload, generated clip selection and the mobile composer, generated from the approved design. These detail states remain design mockups for review.

These images are approved design references, not screenshots of implemented interfaces. Existing application behavior must be retained when implementing them. Image-generation artifacts such as a stray blue navigation marker are not design tokens: follow the neutral interaction-color rules in AGENTS.md.

## Visual language

- Calm, minimal product UI with clear alignment, consistent spacing and little explanatory text.
- Black and white are the brand interaction colors. Use semantic foreground/background tokens, with appropriate inversion in dark mode. The references use near-black backgrounds and charcoal surfaces.
- Preserve the existing violet logo and authentic social-platform marks. Do not add blue or purple accents to actions or selection states.
- Use existing Manrope body and Sora heading typography, readable body sizes and restrained metadata.
- Use shared radius tokens: md for cards, inputs, buttons, popups and previews; sm for inset labels and small text badges; full only for circles and progress controls.
- Use whitespace, alignment and thin dividers before tinted panels or borders. Avoid cards inside cards, large decorative headers, repeated branding, shadows and pill-shaped text controls.
- Preserve the mounted dashboard sidebar, header and layout. Only route content changes.

## New post

- Keep a compact New post heading without a descriptive subtitle.
- Show one public post-text field. Do not reintroduce a separate visible Post title field or duplicate the caption in another editor.
- Preserve internal title requirements by deriving an internal title from the selected clip or the post text. Keep provider-required metadata, including YouTube-specific settings, available in platform options.
- On desktop, put a vertical media preview on the left and compact account selection, post text, platform options and scheduling controls on the right.
- Keep account selection compact. Expose handles when needed for disambiguating accounts; do not hide account identity or platform consent behind decoration.
- Group advanced settings in Platform options. Show relevant settings for selected destinations and media type; keep provider validation and consent intact.
- Change media must expose both device upload and the platform's generated clips. Device upload must work from a phone as well as desktop. Do not present uploads as the only media source.
- Keep Draft, Schedule and Publish now behavior, optional notes, upload progress, media selection/removal/reordering and accessibility controls.
- Use one clear primary action appropriate to the selected mode, with quieter Cancel and Save draft actions when applicable.

## Mobile

- Recompose the content for a single column; do not shrink the desktop split view.
- Preserve the currently mounted mobile app shell and its existing sidebar access or dock. Do not invent another permanent navigation. Older image headers do not establish which shell components are mounted now; check the current code before implementing.
- Keep the text editor, destinations and main action easy to reach. Keep previews compact or in a dedicated view rather than pushing essential controls far offscreen.
- Open complex platform options and media selection as focused, scrollable views or sheets with a clear way back and a visible action footer.
- Provide both From device and My clips in Change media. Device selection invokes the native picker during implementation; an image mockup is not proof of native-picker behavior.
- Preserve the draft text and selections when returning from media or options. Publish queue navigation should preserve filter, month and scroll position.

## Clips library

- [Clips mockups](clips-2026-10-22/README.md) extend this direction to the desktop and phone library.
- The user confirmed the compact card layout and the three-dot action menu. Preserve Open in Studio, Publish, Download and Delete in that menu on desktop and mobile. Thumbnail/title still opens Studio directly.
- Keep search, project organization, existing filters and sorting accessible through compact controls. Retain the existing 24-item pagination behavior.
- Do not clutter default cards with a repeated title/description pair, technical metadata rows or a four-button action matrix. Preserve the underlying data and actions.

## Brand Kit exploration

- [Brand Kit final folder](brand-kit-final/README.md) contains all 20 images, including six paired desktop/mobile page states: overview, logo/watermark, caption presets, typography/custom fonts, colors/effects, and layout/preview. These are new mockups for review, not yet an approved implementation target.
- Keep the overview short. Expand detailed controls only within the relevant group; retain the live preview on desktop and a compact preview with an expand action on mobile.
- Preserve the existing caption controls, uploads, permission checks and save behavior documented in the gallery. The currently unmounted global palette/font sections are outside this exploration.
- Follow project tokens over generated-image artifacts: unsaved status is neutral, destructive actions use the existing destructive token, and popups/sheets use the shared md radius. Only one picker or select popup opens at a time.
- The user requested platform context beyond aspect ratios. [Social preview mockups](brand-kit-final/social-preview-details.md) add Instagram Reels, TikTok, YouTube Shorts and Facebook Reels overlays on desktop and mobile: account, post text, audio and viewer controls. Keep Canvas ratios available as a separate mode; platform selection changes the preview overlay without changing the brand settings. These are simulations for review, not live platform renders or universal pixel-safe guarantees.

## Plan & billing exploration

- [Plan & billing mockups](plan-billing-final/README.md) include desktop/mobile pairs for the overview, plan selection, full invoices, expanded billing details, Free with empty invoices, scheduled cancellation, checkout confirmation, canceled checkout, past due, initial loading and initial load error. These are new mockups for review, not an approved or implemented target.
- Keep the overview short: current plan, available credit balance, renewal date and invoice history. Put plan comparison in a focused view and collapse explanatory billing guidance.
- Preserve the actual monthly-only catalog and hosted billing actions. Paid prices/currency come from the catalog API; mockup amounts are synthetic examples. Clip limits are per job, and estimated clips derive from the available balance at 10 credits per requested clip. Do not introduce annual billing, credit packs or a percentage-used progress bar.
- Preserve payment recovery, provider availability, admin/unlimited access, test-mode notices, invoice states and the existing action lock when implementing. Selecting a plan does not itself confirm a subscription change.
- Pending checkout retains the last confirmed effective plan and balance; canceled checkout does not cancel an existing subscription. Scheduled cancellation preserves paid access until the confirmed end date. Past-due accounts show effective Free access with the retained balance and a separate financial subscription status. Loading and initial load errors do not display invented account data.

## Settings exploration

- [Settings final gallery](settings-final/README.md) contains 18 desktop/mobile pairs: account, edited profile, password security, Google security, manual 2FA setup, recovery codes, sessions, notifications, preferences, social connections, inline disconnect confirmation, data/privacy, password-account deletion, Google-account deletion, sign out, save error, initial loading and load error. These are static proposals for review, not an approved or implemented target.
- Keep the desktop section navigation compact. On mobile, use one section selector and a single column. Switching sections must preserve unsaved values and the mounted dashboard shell; it does not save changes automatically.
- Retain the actual editable fields and actions. Avatar and email are read-only; only display name is editable in Profile. Password accounts use current/new/confirmation fields; Google accounts show provider-managed security. Manual 2FA setup, one-time recovery codes and session revocation must retain their existing validation and action locks.
- Notifications and preferences share explicit Save preferences behavior. Connections retain the four supported providers, account identity, authorization state and inline disconnect confirmation. Export all data is a direct JSON download; export history has no invented row actions.
- Account deletion requires the account email plus current password or recent Google authentication, with the active-subscription prerequisite and irreversible-data explanation visible. Sign out remains a separate confirmation. Initial loading/errors preserve the shell without invented profile values, and save errors preserve edits.
- Project tokens override image artifacts: statuses such as Disabled use neutral badges, small badges use the sm radius, and only Settings is selected in global navigation. Do not reproduce stray Publish markers, cyan breadcrumb accents or external-link arrows on local navigation.

## Scripts

- [Scripts final gallery](scripts-final/README.md) contains 14 desktop/mobile pairs for the library, empty library, archived records included, brief, platform selection, generation in progress, document, scene editing, inline versions, three Shooting Coach perspectives, save error and generation error. The user selected these references for implementation on 2026-10-23. The implemented route keeps the existing dashboard shell and shared visual tokens.
- Keep the library concise: Search scripts, Show archived, New script and clickable document cards. Show archived includes active and archived records together. Preserve the archived status without introducing Unarchive, permanent delete, duplicate, extra filters or card menus.
- Library and editor remain local views of the existing route. Keep All scripts, status, autosave feedback, Versions, Copy, Download JSON and Archive available. Autosave uses Saved/Saving/Save failed with Retry save; no permanent Save/Discard bar. Archive returns to the library without a new confirmation dialog.
- Keep the actual brief choices and free-text tone/style/audience. The four supported platforms, duration/language choices and topic validation remain intact. Generation errors use a toast over preserved values, and generation in progress changes the action without invented percentages or workflow stages.
- Scene editing retains Visual, Dialogue, Camera, Transition and Text overlay, with move/delete/add controls and read-only duration metadata. Current versions have no Restore action; older versions restore inline. Read-only summaries in focused mockups do not remove the full document fields in implementation.
- Studio, Camera and Plan show the same schematic 3D scene from different perspectives, with playback, scene timeline and read-only metrics. Do not turn the Coach into a generated video or add equipment, music, duration or lens editors from unused model fields. Mobile uses a readable single column and focused scroll positions with the existing dashboard header.
- Follow shared tokens over generated artifacts: neutral status badges and hover, sm badge radius, md controls, archive-box icon for Archive, and noninteractive text for autosave metadata. Preserve every global sidebar destination and select only Scripts.

## Home exploration

- [Home final gallery](home-final/README.md) contains eight desktop/mobile pairs: overview, empty account, zero credits, unlimited credits, missing thumbnail, initial loading, initial load error and navigation. These are static proposals for review, not an approved or implemented target.
- Condense StudioHero to the Home heading and its New clip/Open library actions. Retain the four metrics and their meaning: clips, processing jobs (Projects), rounded output minutes and actual available credits. The first three metrics link to Clips; credits link to billing. Zero credits does not gate Home actions, and unlimited credits uses the existing infinity state.
- Show at most four recent clip cards. The Recent clips badge reflects the API's returned list (up to six), not the total clip count or necessarily the visible four. Keep duration, one-line title, resolution and score when positive. Missing thumbnails retain an accessible, clickable card with No preview. The whole card opens its editor; arrows are navigation rather than inline playback.
- Do not turn unmounted activity, status, plan, ActiveJobs or latent CSS into Home features. Preserve the existing initial ApiState loader/error without invented metrics or content. An error with cached data retains the loaded Home. Keep the shared dashboard shell mounted.
- Home's current mobile shell includes MobileDashboardDock below lg, while the desktop topbar is hidden. Keep Home/Editor/Clips/New project/Brand/Publish/Menu and the existing Menu dialog for Scripts, Plan & billing and Settings. Desktop Quick navigation searches pages; it is not a clip search. These actual controls explain the mobile chrome difference from earlier mockups.
- Follow md/sm shared radius tokens over generated dock rounding, keep neutral states and accessible targets, and preserve all sidebar destinations. Image artifacts do not establish new component exceptions or working behavior.

## Create clips

- The user selected the **first displayed image from the final two-image Settings left set** on 2026-10-23: [compact-inspector.png](create-clips-settings-left/compact-inspector.png). Use this exact image as the desktop visual target. The earlier five concepts and balanced-inspector are not selected implementation targets.
- Extend the chosen layout across [the complete desktop/mobile flow](create-clips-complete/README.md): a compact settings inspector on the left, source/media or working content on the right, Generate immediately below the inspector, full workspace width and little explanatory text. Story keeps its existing three-step flow and the explicitly requested Gooey navigation geometry.
- Keep optional AI direction in a small two-line field. Remove the large default YouTube AssistantChat and the in-content Write script shortcut. A small explicit AI button may open the existing assistant in a Sheet, retaining its settings/instructions actions without occupying the default workspace. The global Scripts sidebar route and explicitly invoked global Story help remain available.
- Preserve both mounted creation workflows, controlled drafts, source switching, actual upload/validation constraints, billing checks and API behavior. YouTube uses clips × unique videos × 10 credits; Story charges 10 credits once. Current Story result exposes only current_version and its actual download/Studio/library actions; the worker CLI Improve flow is not a UI control.
- Mobile uses a readable single column with the existing dashboard dock, compact media and an accessible primary action above the dock. Do not shrink the desktop split or add permanent navigation. Follow md/sm and neutral tokens over generated-image artifacts.
- The user also explicitly authorized implementation after mockup completion. Image approval does not establish functional verification or authorize real uploads, paid generation or deployment.
- Later the user explicitly asked to keep the existing processing steps because they already work well. Preserve ProcessingPipeline structure, stage map, orbital visual, transitions, honest Story indeterminate progress and numeric YouTube progress; allow only small presentation refinements. This preference overrides generated processing mockups that reinterpret those elements.

## Verification when implemented

Verify responsive layout, media sources, selected-account behavior, provider options and consent, scheduling/publish validation, component Fast Refresh and dashboard DOM identity. Design approval does not replace functional verification.
