# Create clips — approved style and full state brief

Date anchor: **2026-10-23**. The user explicitly selected the **first displayed result from the latest two-image set**, [compact-inspector.png](../create-clips-settings-left/compact-inspector.png). This is the exact visual target. Earlier Settings left and other explorations are superseded as implementation targets.

**Later explicit correction:** preserve the processing steps as they currently work and look in the app. The existing ProcessingPipeline geometry, orbital active-stage visual, horizontal stage map, progression and animations stay intact on Story and YouTube jobs. Only small spacing/type/token refinements are permitted. The compact-inspector redesign applies to creation forms and surrounding surfaces, not a reinvention of processing stages. Current browser captures override generated processing concepts where they differ.

## Shared art direction

Generate independent realistic, production-quality UI screens, one screen per image. Desktop target **1440 × 1024**; mobile target **390 × 844**. No collages, variant numbers, browser chrome, phone bezel, OS status bar or device shadow. Current date is 2026-10-23; no dates are necessary. Every ImageGen call must attach the chosen compact-inspector image as a real local reference. For mobile, also use the first finished mobile-youtube-ready image when available; inspect local references before using them.

Desktop: existing sidebar about 240 px and header about 64 px, main workspace uses full width. Compact settings inspector LEFT, source/media/working content RIGHT. The primary action belongs below the left inspector when the step has editable settings. Shared content-heavy result/review states may use a concise action row without squeezing the working content into the inspector. Keep Story's three existing steps and its approved vertical Gooey navigation geometry. Do not add a second sidebar or a three-column dashboard just to repeat step labels.

Near-black #0b0e11, charcoal and neutral gray; white actions and selected states, neutral hover. **No blue/cyan/purple interaction accents**. Preserve authentic violet Sneep Cut logo and platform marks only. Manrope body 14–16 px, Sora restrained headings. Shared md corners about 6 px for normal controls/cards/previews, sm about 4 px for small badges; full only for circles/progress. Thin dividers and spacing before borders; no cards inside cards, glow, gradients, decorative pills, repeated title/description pairs or long tutorial text.

AI direction is only a **small optional textarea**, about two lines/72 px, never a large chat panel in the default page. No **Write script** action or shortcut in content. The global **Scripts** sidebar route remains. Desktop sidebar: + Create clips white active button; STUDIO Home / Video editor / Scripts / Clips / Publish; ACCOUNT AND SETUP Brand kit / Plan & billing / Settings. None of these eight routes selected on Create clips. Synthetic Alex Morgan AM account. Header My workspace / Create clips and Quick navigation Ctrl K. Use the existing shell, not extra navigation.

Mobile: recompose into one readable column, never shrink the desktop split. No desktop sidebar or Quick navigation. Existing app bottom dock has seven icons: Home / Editor / Clips / New project / Brand / Publish / Menu. Create/New project is active. Keep a compact page heading, enough bottom padding, and main action immediately above the dock. Complex controls can use focused scroll positions or a sheet; don't make the screen a compressed inventory. Tiny AI field stays small. Story step control is horizontal on mobile. Reference shell: ../home-final/mobile-overview.png. Do not invent a second permanent top navigation.

All accounts, sources, titles, balances, clips, statuses, audio and video imagery are synthetic examples. No actual upload/job/provider/payment actions. Uploaded sources can be warm studio footage and nature details. Story name **Studio day**, source names **studio-tour.mp4**, **desk-detail.mov**, **window-light.mp4**. YouTube **https://youtu.be/ScDemoA0001**, title **Morning studio tour**, author **Demo studio**. Optional direction **Focus on practical tips and the strongest moments.** Count5/range1–15,9:16selected/1:1/16:9, Subtitles ON Clean, No branding, Advanced collapsed unless that state's focus. YouTube cost10credits × requested clips × unique videos; 5 clips =50credits, balance360. Story costs10credits once, no up-front insufficient-credit gate in its current frontend.

## State pairs

Each stem requires desktop-STEM.png and mobile-STEM.png. Where a phone cannot show everything, show the focused useful viewport, keep fields reachable by scrolling, and don't omit underlying behavior from implementation.

| Stem | Focus and functional constraints |
| --- | --- |
| footage | Upload videos selected. Existing/new Story project control, empty native multi-file/drag-drop upload area. MP4/MOV/WebM/MKV, no invented cloud library. Add footage step, compact Continue, empty working area used intentionally. |
| projects | Open story project picker with synthetic Studio day and Weekend walk, plus New story. Switching projects doesn't mean deleting one. |
| uploads | Two concurrent uploads plus validation, realistic byte progress; Waiting / Uploading / Validating / Validated; remove or Cancel and pending-work locks. Continue must preserve drafts. |
| upload-recovery | Failed item with Retry, Retry failed, pending rate-limit pause notice and retained successful files. Do not claim upload progress means validation finished. |
| clip-preferences | Selected uploaded source detail: Role (Automatic etc.), Selection Auto / Must include / Exclude, Source order and small analysis disclosure. Keep duration/name/thumbnail. |
| story-brief | Choose result step. ONE optional Describe video field, Original audio vs My voice over the images, small noise suppression control and optional music entry. No second title/description or large AI panel. |
| music | Inline music search/catalogue, track title/genre, Preview / Use. Selected track volume18% and Match edit. Free catalogue, no music subscription/provider login. |
| narration-recording | My voice mode, recording permission already allowed: timer, Pause / Stop / Cancel. Optional Choose audio, no real recording or fake waveform required. |
| narration-draft | Recorded draft with native-style audio playback and Save / Record again / Discard. Unsaved draft is not saved narration. |
| story-captions | All dialogue / Only hard to hear / No captions. Captions ON, style controls/preset preview in source area, Clean, No branding. Captions OFF should hide appearance controls in implementation. |
| story-format | Length15/30/45/60/90(default45), Shape9:16/1:1/16:9/4:5, SDR/HDR, spoken languageAuto/RO/EN, Automatic/Careful selection, Keep orderON. Compact groups, no tutorial prose. |
| story-review | Final Generate & review step: included3sources, concise direction/audio/music/captions/format summary, Edit clips / Edit direction / Edit options. Build my story,10credits. Actual edits remain available, no fake generated preview. |
| transcript-review | Per-source transcript review before generation, timed editable words/passages and Listen; Timing verified checkbox, confirm text. This saves transcript text, not a paid video generation. |
| audio-comparison | Original / Processed native-style audio player comparison within disclosure; selected Recording. Missing processed audio stays disabled, no invented waveform editor. |
| story-agent | Optional Ask agent invoked state, NOT a default panel. Show existing global Workspace Agent help drawer/sheet with a prefilled UNSENT question,4000composer, Send, close control. Main form retains its tiny direction field. Do not add agent autoactions or a new permanent half-screen pane. |
| story-processing | Queued / Analyze / Story / Edit / Review, indeterminate stages; Cancel. NO fabricated percentage or ETA. Keep status compact, source context visible where useful. |
| story-ready | Current version Ready, rendered video preview, duration/shape/Version1, Download video, conditional Open Studio, All clips. Original files/settings disclosure and music attribution. NO version picker, Improve flow, regenerate, publish or Accept. |
| story-needs-review | Current result Needs review, readable issue notices, Download draft and conditional Open Studio, All clips. No fake automatic fix or Accept button. |
| story-error | Preserved editable wizard plus concise generation error; retain chosen files/options, no invented permanent Retry generation panel. Build my story still valid after editing where current flow permits. |
| story-delete | Existing project's INLINE destructive confirmation: Delete permanently / Keep. No modal, no typed DELETE requirement. Hide processing-only destructive actions when job active. |
| story-load-error | Loading project failed, compact Retry while shell and project header remain. No invented loaded project data in error state. |
| youtube-empty | YouTube selected, empty URL field, settings defaults visible, Generate disabled, calm neutral source placeholder with no generated output tiles. |
| youtube-ready | Approved desktop is copied exactly from chosen compact-inspector.png. Mobile adaptation: source selector/URL/thumbnail+metadata compact, settings single column, small AI field,50credits/Balance360 and Generate above dock. |
| youtube-batch | Two valid distinct URLs and an editable invalid/duplicate row state, Add URL, remove controls, concise2videos summary, Process2videos,100credits. Max20URLs; no new file upload mode here. |
| youtube-style | Subtitles style select open: Clean / Bold / Caption box with neutral hover and white selected state. Rest of draft retained. No extra caption editor beyond current YouTube choices. |
| youtube-no-credits | Same valid source/settings,50credits cost, Balance20, Generate disabled and Get credits link to billing. Do not invent credit purchase packs or zero out the actual draft. |
| youtube-advanced | Advanced expanded: languageAuto, smart cropON, noise suppression availability and small optional direction field(max4000). No huge AssistantChat, no new AI workflow. |
| job-processing | YouTube job status pipeline7stages Queued / Download / Transcribe / Analyze / Extract / Render / Done, real-style62% progress and Cancel processing. No ETA or generated result grid. |
| job-audio-recovery | Failed audio cleanup with preserved original, Retry processing / Continue original, optional Original/Processed comparison with unavailable processed disabled. No unsaved destructive action. |
| job-failed | Processing failed, Technical details disclosure, New project; preserve context, no fabricated generated clips. |
| job-completed |100%, All clips ready, View clips. Keep compact source/job details, no embedded output grid. |
| job-load-error | Job loading/connection error with Try again, shell retained; no fabricated loaded status/progress/data. |

## Implementation constraints

Keep the actual controlled form hooks, source mounting, uploads, validation, project drafts, billing checks, API behavior and route state. Current result exposes only current_version; README's worker CLI Improve flow is not a UI feature. Existing Ask agent help is optional global UI, not the old large YouTube AssistantChat. Preserve dashboard DOM identity and Fast Refresh. No dependency or shell replacement is needed. Use data and media returned by actual APIs; synthetic art belongs only in mockups or isolated verification fixtures.
