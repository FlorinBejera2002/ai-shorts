# Scripts workspace: product and implementation specification

Status: research complete, ready for implementation planning  
Date: 2026-09-11

## Executive decision

The current Scripts page should evolve from a one-shot generator into a persistent writing workspace that connects idea, script, storyboard, filming guidance, and the existing Sneep Cut creation flow.

The recommended product model is:

`Library -> Brief -> Draft -> Storyboard -> Produce`

The page should preserve Sneep Cut's existing structured scene output and 3D Shooting Coach. Those are differentiators. The missing product layer is everything around them: saving, editing, versioning, selective regeneration, progress, quality checks, and handoff to production.

## What exists today

The current frontend already provides:

- topic, platform, duration, tone, style, audience, and language controls;
- a generated title, hook, structured scenes, CTA, caption, hashtags, equipment, and filming tips;
- copy and plain-text download actions;
- collapsible scene cards;
- a strong Shooting Coach preview with director, camera, and top views;
- loading, empty, success, and generic error feedback;
- Romanian and English interface copy.

The current backend exposes only `POST /api/scripts/generate`. It sends one prompt to Gemini, normalizes the JSON result, applies a per-member hourly rate limit, and returns the entire script synchronously. There is no script persistence or script-specific CRUD API.

### Main product gaps

1. **Nothing is saved.** Refreshing, navigating away, or starting a new script discards the result.
2. **The generated script is read-only.** Users cannot edit the hook, dialogue, visual direction, duration, CTA, or metadata in place.
3. **Regeneration is all-or-nothing.** A weak hook or one bad scene forces another full generation.
4. **There is no version history or undo.** AI rewriting is destructive from a product perspective.
5. **There is no library.** Users cannot search, filter, duplicate, archive, or resume previous scripts.
6. **There is no workflow handoff.** A finished script does not become a Sneep Cut project, calendar item, teleprompter session, or editor storyboard.
7. **Generation has no visible stages.** A single spinner hides research, writing, scene planning, and validation and cannot resume after interruption.
8. **The brief is too parameter-heavy and not outcome-led.** It lacks goal, content format/archetype, source material, brand, offer, proof points, forbidden claims, and reference content.
9. **No factual or brand quality gate exists.** There are no citations, claim warnings, brand checks, duration/word-count checks, or platform-safe-area checks.
10. **Export is incomplete.** Clipboard and `.txt` do not cover JSON, Markdown, CSV shot list, SRT, teleprompter, or direct production handoff.

## Benchmark findings

The most useful open-source references are not valuable because of their visual styling; they reveal the workflow primitives users now expect.

| Reference | Useful pattern for Sneep Cut | What not to copy directly |
| --- | --- | --- |
| [OpenReels](https://github.com/tsensei/OpenReels) | Archetype gallery, live multi-stage pipeline, storyboard as it streams, quality review, cost breakdown, generation gallery | Fully automatic generation should remain optional; Sneep Cut should preserve creator control |
| [Story2Video](https://github.com/approximatelylinear/story2video) | Editable scenes, per-scene generation, natural-language modifications, snapshots, non-destructive versioning, continuation | Its chapter model is heavier than needed for short social videos |
| [Showrunner](https://github.com/doziben/showrunner) | Director-cut storyboard, on-camera versus B-roll decisions, concrete shot instructions, per-scene retry, estimated provider cost before generation | Avatar and lipsync configuration should live in production, not overload the writing brief |
| [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) | Generated or user-supplied script, batch variants, aspect ratio, voice preview, subtitle/music controls, complete topic-to-video path | Dense Streamlit-style control panels are not the right interaction model for Sneep Cut |
| [AI Video Production Editor](https://github.com/LudwigKienle/ai-video-production-editor) | Clear production phases, format presets, director pass, continuity review, activity center | A full desktop NLE inside Scripts would duplicate the editor and create excessive complexity |
| [Socheli](https://github.com/Socheli/socheli) | Research and fact-check stages, QA gates, chat-to-edit, undoable data-driven decisions, publishing handoff | Agentic autopilot is a later phase, after the core document model is reliable |

Recent discussion on X also points to three expectations:

- users respond to **one coherent workspace** instead of switching among script, image, video, and voice tools ([Avocado AI](https://x.com/avocadoai_co/status/2015769009065435283));
- creators want **topic-to-script-to-voice-to-subtitles-to-video** continuity, which is why MoneyPrinterTurbo is repeatedly shared as a complete OSS workflow ([MoneyPrinterTurbo discussion](https://x.com/so_ainsight/status/2063971814913794053));
- the emerging interaction model is **intent and judgment first**, with implementation details automated but reviewable ([Renoise discussion](https://x.com/renoiseai/status/2036776918201364959)).

These posts are directional market signals, not usability studies. The product recommendation is an inference made by combining those signals with the concrete workflows implemented by the open-source projects above.

## Recommended information architecture

### 1. Scripts library

The route `/dashboard/script-generator` should become `/dashboard/scripts`, with the old route retained as a redirect.

The initial screen contains:

- title, short description, and a primary **New script** action;
- search;
- filters for status, platform, format, language, brand, and last updated;
- **Recent**, **Drafts**, **Ready**, **Templates**, and **Archived** views;
- grid/list switch;
- script cards with title, hook preview, duration, platform, status, updated time, and owner;
- quick actions: resume, duplicate, export, archive;
- a compact first-run empty state with three real templates rather than a decorative placeholder.

Recommended statuses: `idea`, `draft`, `review`, `ready`, `in_production`, `published`, `archived`.

### 2. New-script brief

Use progressive disclosure, not six equally prominent control cards.

Primary inputs:

- topic or desired outcome;
- platform and target duration;
- format/archetype: talking head, listicle, tutorial, story, product demo, UGC ad, faceless explainer;
- goal: awareness, engagement, education, lead, conversion;
- language.

Context inputs:

- audience and their problem;
- offer/product and CTA;
- key proof points or mandatory facts;
- source URLs or pasted notes;
- Brand Kit selection;
- reference script or creator style;
- prohibited claims/words.

Advanced controls:

- tone and pacing;
- hook framework;
- number of variants;
- narration mode: on-camera, voiceover, mixed;
- desired reading level;
- research/fact-check toggle;
- creativity versus precision control.

Before generation, show estimated words, scene count, generation cost/credits, and what will happen next.

### 3. Script workspace

Desktop layout:

| Left rail | Main document | Right inspector |
| --- | --- | --- |
| Outline, scene navigator, versions | Editable hook, scene blocks, CTA and post copy | AI actions, Brief, Quality, Shooting Coach, Production |

The top toolbar should stay visible and include:

- editable title;
- saved/saving/offline indicator;
- status selector;
- version history;
- share/export overflow;
- primary **Create video** action.

The main document should behave like a structured editor, not a stack of read-only cards. Each scene needs:

- editable duration with total-duration feedback;
- shot type and on-camera/B-roll badge;
- editable dialogue/voiceover;
- visual and creator action;
- overlay text with safe-length warning;
- camera, movement, lighting, music, and transition fields;
- drag reordering, add, duplicate, and remove;
- per-scene comments/notes;
- **Rewrite**, **Shorten**, **More natural**, and **Regenerate scene** actions;
- a before/after diff before accepting AI edits.

The right inspector should have four tabs:

1. **AI Director** — natural-language edits scoped to selection, scene, or full script.
2. **Quality** — hook strength, duration fit, repetition, reading speed, CTA clarity, factual claims, brand compliance, and platform constraints.
3. **Shooting Coach** — the existing 3D preview, synchronized with the selected scene.
4. **Production** — voice, avatar/on-camera choice, aspect ratio, captions, media strategy, and handoff summary.

On mobile, these become three top-level modes: **Brief**, **Script**, **Coach**. The scene outline opens as a sheet. The primary action stays in a bottom action bar.

## Essential behaviors and states

### Editing and safety

- autosave after a short debounce;
- optimistic UI with server revision numbers;
- conflict detection when the same script changes in another tab;
- undo/redo for local edits;
- immutable snapshots for accepted AI rewrites;
- unsaved-change protection only when a save actually failed;
- keyboard shortcuts for save, undo/redo, new scene, and AI rewrite;
- focus restoration after dialogs and scene actions;
- screen-reader announcements for generation and save state.

### AI generation

- asynchronous job with stages: preparing, optional research, outline, script, scene direction, validation, complete;
- server-sent events or the existing job polling infrastructure for live progress;
- cancellation;
- idempotency key so retries do not create duplicate charged generations;
- partial result recovery;
- three hook variants by default, with one chosen for the draft;
- per-scene and selected-text regeneration;
- structured error codes for provider unavailable, quota, timeout, invalid output, safety rejection, and connectivity;
- retry from the failed stage rather than from zero.

### Quality gates

- spoken word count versus selected duration;
- total scene durations versus target;
- first meaningful spoken/visual hook inside three seconds;
- overlay word limit and mobile safe-area guidance;
- duplicate/repetitive lines;
- unsupported factual claims and source coverage when research is enabled;
- brand voice and prohibited-term checks;
- CTA presence and goal alignment;
- accessibility reminder for captions and non-audio comprehension.

Warnings should be actionable and linked to the exact field. Only true blockers should prevent **Create video**.

### Handoffs

- **Create video** creates a project with the approved script snapshot and scenes;
- **Open in editor** maps each scene to a storyboard/timeline block;
- **Add to calendar** creates a draft calendar item with platform, caption, hashtags, and linked script;
- **Teleprompter** provides mirrored/fullscreen mode, text size, pace, scene markers, and keyboard/remote controls;
- export Markdown, TXT, JSON, CSV shot list, and SRT;
- preserve the source script and version ID on every downstream artifact.

## Proposed data model

### `scripts`

- `id`, `user_id`, optional `project_id`, optional `brand_kit_id`;
- `title`, `status`, `platform`, `language`, `format`, `goal`;
- `target_duration_seconds`, `tone`, `style`, `audience`;
- `brief` JSONB for source material, offer, proof points, constraints, and generation settings;
- `current_version_id`, `created_at`, `updated_at`, `archived_at`;
- optimistic `revision` integer.

### `script_versions`

- `id`, `script_id`, `version_number`;
- complete immutable structured snapshot JSONB;
- `change_type`: manual, generation, rewrite, restore, import;
- optional `generation_id`, author, summary, and timestamp.

### `script_generations`

- `id`, `script_id`, optional `base_version_id`;
- scope: full, hook, selected text, scene;
- request/settings JSONB and provider/model metadata;
- status, stage, progress, error code, retry source;
- usage, estimated cost, actual cost/credits;
- idempotency key and timestamps.

For the first implementation, scenes can remain inside the immutable version JSONB. Normalize them into a `script_scenes` table only when cross-script scene search, concurrent scene editing, or analytics actually requires it.

## Proposed API surface

- `GET /api/scripts` — cursor pagination, search, filters, sort;
- `POST /api/scripts` — create empty/imported script;
- `GET /api/scripts/{id}` — script, current version, permissions;
- `PATCH /api/scripts/{id}` — metadata/status with revision precondition;
- `DELETE /api/scripts/{id}` — archive by default;
- `POST /api/scripts/{id}/duplicate`;
- `GET /api/scripts/{id}/versions`;
- `POST /api/scripts/{id}/versions/{versionId}/restore`;
- `POST /api/scripts/{id}/generations` — async full or scoped generation;
- `GET /api/scripts/{id}/generations/{generationId}`;
- `POST /api/scripts/{id}/generations/{generationId}/cancel`;
- `GET /api/scripts/{id}/events` — SSE progress when available;
- `POST /api/scripts/{id}/quality-check`;
- `POST /api/scripts/{id}/exports`;
- `POST /api/scripts/{id}/create-project`;
- `POST /api/scripts/{id}/calendar-draft`.

Keep `POST /api/scripts/generate` temporarily as a compatibility endpoint, then remove it after the new workspace is fully adopted.

## Frontend component boundaries

- `ScriptsLibraryPage` — queries, filters, views, pagination;
- `ScriptWorkspacePage` — routing and document orchestration;
- `ScriptBriefPanel` — creation and editable brief;
- `ScriptOutline` — scene navigation and reorder;
- `ScriptDocumentEditor` — hook, scene blocks, CTA, caption;
- `SceneEditor` — one isolated scene boundary for Fast Refresh and focused rerenders;
- `ScriptInspector` — tabs and selection-aware context;
- `AIDirectorPanel` — scoped rewrite requests and diffs;
- `ScriptQualityPanel` — issue list and field navigation;
- `ShootingCoachPanel` — adapts the current component to selected scene;
- `ScriptVersionHistory` — snapshots, compare, restore;
- `ScriptExportDialog` and `ScriptHandoffDialog`;
- hooks/services for autosave, generation events, optimistic revisions, keyboard shortcuts, and offline recovery.

The current 844-line page should be split before adding more behavior. UI state, persistence, and AI orchestration should not remain in a single client component.

## Backend hardening required

- validate platform, language, tone, style, format, and goal with explicit enums;
- enforce exact request size and per-field rune limits consistently;
- replace loose map normalization with typed response structs and validation errors;
- persist prompts, model/version, token usage, and sanitized failure codes for observability;
- add timeouts and cancellation propagation to the provider call;
- add idempotency and transaction boundaries around generation/version creation;
- separate rate limiting from billing/credit reservation;
- never expose provider error text or source material in logs;
- add retention rules for research sources and generated content;
- support provider fallback only when it does not silently change quality/cost expectations.

## Delivery plan

### P0 — Make Scripts a real saved product

- persistence schema and CRUD;
- library screen;
- editable structured document;
- autosave, revision conflict handling, version snapshots;
- per-scene add/delete/reorder/duplicate;
- asynchronous generation with progress, cancel, idempotency, and recoverable errors;
- regenerate hook, selected text, or one scene;
- Create video handoff using an immutable version;
- responsive and accessible workspace;
- migration/redirect from the existing route.

### P1 — Make it professionally useful

- templates and archetypes;
- three hook variants;
- Brand Kit and source material;
- quality panel and duration/read-speed checks;
- Markdown, JSON, CSV, and SRT export;
- teleprompter;
- calendar draft integration;
- generation cost/credit estimate and usage detail;
- batch variants and compare view.

### P2 — Add intelligence and collaboration

- grounded research with citations and claim review;
- comments, assignments, approval states, and sharing;
- cross-script performance learning from published content;
- reusable winning hooks and scene blocks;
- provider/model routing and production settings;
- agentic workflow that can continue through storyboard and render with approval gates.

## Acceptance criteria for the first complete release

1. A user can create, close, find, reopen, edit, and archive a script without losing data.
2. Every AI change can be previewed, accepted/rejected, and restored from history.
3. A user can regenerate one hook or scene without changing approved scenes.
4. Generation progress survives navigation and exposes a clear recoverable failure state.
5. Total duration and word-count warnings update while editing.
6. The selected scene drives the Shooting Coach without scrolling away from the text being edited.
7. A ready script creates a downstream project from a fixed version and preserves a backlink.
8. Keyboard-only and screen-reader flows cover creation, editing, scene reordering, AI review, and export.
9. Mobile editing is usable at 390 x 844 without horizontal overflow or inaccessible actions.
10. The old generator route redirects without breaking saved links.
11. Backend tests cover authorization, ownership, concurrency, idempotency, validation, cancellation, and version restore.
12. Browser tests cover autosave, reload recovery, partial regeneration, offline/save failure, and state preservation during component Fast Refresh.

## Product principle

Do not turn Scripts into a second video editor. Its job is to make the production decision clear, editable, reviewable, and durable. The editor should execute the approved scene plan; Scripts should own the brief, words, shot intent, versions, and approvals.
