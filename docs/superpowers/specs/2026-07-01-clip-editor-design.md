# ClipForge Multi-Segment Clip Editor — Design Spec

## Overview

Add a timeline-based clip editor that lets users view the full source video, see where AI cut segments, manually adjust segment boundaries (drag to shorten/extend), reorder segments, add new segments, and export the result as a single composed clip. The AI highlight detector is also upgraded to propose multi-segment clips when that produces better content.

## Current State

- Each clip has one continuous segment defined by `startTime` and `endTime`
- A basic numeric trim exists in ClipWorkspace (input fields for start/end, "Trim & re-export" button)
- Highlight detector (Gemini) returns one `{start, end}` per clip
- FFmpeg extracts one contiguous block per clip
- Source video may be deleted after processing (not guaranteed to persist)

---

## Data Model Changes

### Clip Model — new field

```
segments  Json?   // nullable for backward compatibility
```

Format:
```json
[
  { "start": 12.5, "end": 25.0, "order": 0 },
  { "start": 89.2, "end": 102.7, "order": 1 },
  { "start": 145.0, "end": 158.3, "order": 2 }
]
```

Rules:
- `segments: null` means legacy single-segment clip — treated as `[{ start: clip.startTime, end: clip.endTime, order: 0 }]`
- When segments are saved from the editor, `startTime`/`endTime`/`duration` are recalculated: `startTime = min(segments.start)`, `endTime = max(segments.end)`, `duration = sum of individual segment durations`
- Segments must not overlap
- Each segment: `start < end`, duration >= 0.25s
- Total duration >= 3s
- Maximum 10 segments per clip

### Job Model — new field

```
sourceVideoUrl  String?   // public URL to persisted source video
```

Populated after processing. Allows the editor frontend to load the full source video in the player.

### Backend Schema — HighlightCandidate

Change from:
```python
class HighlightCandidate:
    start: float
    end: float
```

To:
```python
class HighlightCandidate:
    segments: list[SegmentCandidate]  # 1-5 segments per clip

class SegmentCandidate:
    start: float
    end: float
```

Backward compatible: existing single-segment candidates become `segments: [{ start, end }]`.

---

## Source Video Persistence

- In `processing_pipeline.py`, after download/copy, the source video is kept permanently (not deleted at cleanup)
- Source is stored at a predictable path: `media/sources/{job_id}/{original_filename}`
- Nginx serves it at `/media/sources/{job_id}/{filename}`
- `Job.sourceVideoUrl` is set to this public URL after processing
- Existing jobs without a persisted source: editor shows "Source video not available" message, export button disabled

---

## AI Highlight Detector — Multi-Segment

### Gemini Prompt Changes

Add to the prompt:
> "Each clip can be composed of 1 to 5 non-overlapping segments from different parts of the video. Use multiple segments when combining an attention-grabbing hook with a key moment and a strong ending would create a more compelling clip. Use a single segment when a continuous moment is already strong enough on its own."

### Response Schema Change

From: `{ start, end, rank, viral_score, ... }`
To: `{ segments: [{ start, end }], rank, viral_score, ... }`

### Fallback Heuristic

Stays single-segment (sliding window approach is inherently single-segment; not worth complicating).

### Validation

- `validate_highlights()` updated to check each segment within each candidate
- Non-overlapping constraint applies within each candidate's segments AND across candidates
- Total candidate duration = sum of its segment durations

---

## Backend — Recut Endpoint

### `POST /api/clips/{clip_id}/recut`

Request:
```json
{
  "segments": [
    { "start": 12.5, "end": 25.0, "order": 0 },
    { "start": 89.2, "end": 102.7, "order": 1 }
  ]
}
```

Response: `{ "task_id": "...", "status": "processing" }`

### Processing Flow (Celery task)

1. Validate segments (no overlap, start < end, each >= 0.25s, total >= 3s, within source duration)
2. Resolve source video path from `Job.sourceFilePath`
3. If single segment: extract directly with `ffmpeg -ss {start} -to {end}` (existing path)
4. If multi-segment:
   a. Extract each segment to a temp file
   b. Create concat list file
   c. `ffmpeg -f concat -safe 0 -i list.txt -c copy output.mp4` (stream copy if codec compatible, else re-encode CRF 18)
5. Apply post-processing pipeline (smart crop, subtitles, brand kit) as in existing clip generation
6. Update Clip in DB: `filePath`, `fileUrl`, `segments`, `startTime`, `endTime`, `duration`, `fileSize`, `resolution`
7. Generate new thumbnail
8. Return via Celery result

### Security

- Ownership check: `clip.userId == request.user.id`
- Server-side segment validation (never trust client input)
- Source video path resolved from DB, not from client request

---

## Clip Generator Changes

### `extract_clip()` → `extract_clip(segments)`

Updated to accept a list of segments instead of a single start/end pair:
- 1 segment: same as current behavior (`ffmpeg -ss -to`)
- N segments: extract each to temp file, concat with demuxer, apply post-processing

### `extract_all_clips()`

Updated to pass `candidate.segments` instead of `candidate.start, candidate.end`.

---

## Editor Page — Frontend

### Route

`/dashboard/clips/[id]/edit` — new page, client component

### Layout (top to bottom)

1. **Header bar**
   - Clip title (read-only)
   - "Back to clip" link (← navigates to `/dashboard/clips/[id]`)
   - "Export clip" button (primary, right-aligned)

2. **Video Player**
   - Plays the source video (full, from `job.sourceVideoUrl`)
   - Standard HTML5 video controls
   - Toggle: "Play segments" (default) / "Play full video"
   - In "Play segments" mode: player plays only the selected segments in order, skipping gaps between them
   - Playhead syncs with timeline

3. **Timeline Bar**
   - Horizontal bar representing full source duration (0 → total)
   - Segments rendered as colored blocks on the timeline
   - Interactions:
     - **Drag left/right edges** of a segment to resize (shorten/extend)
     - **Drag segment body** to move it to a different time position
     - **Click empty area** + "Add segment" to create a 5-second segment at that position
     - **Click segment** to select it (highlighted border), shows delete button
     - **Playhead** (vertical line) tracks current video position
   - Tick marks below: timestamps at regular intervals (adapts to zoom)
   - Minimum segment width enforced visually (0.25s)

4. **Segment List** (below timeline)
   - Text representation of each segment:
     - `Segment 1: 0:12.5 → 0:25.0 (12.5s)` with ▲▼ reorder buttons and ✕ delete
     - `Segment 2: 1:29.2 → 1:42.7 (13.5s)`
   - "+ Add segment" button at bottom
   - Total duration display: "Total: 26.0s"

5. **Export section** (bottom)
   - Summary: "{n} segments, {duration}s total"
   - "Export clip" button → POST `/api/clips/{id}/recut` with current segments
   - After export: navigate to job progress page or show inline progress

### State Management

- Editor state is local React state (useState/useReducer), not persisted as draft
- `beforeunload` event listener warns on unsaved changes
- next-intl router navigation also guarded with confirmation dialog

### Data Fetching

- Fetch clip data: `GET /api/clips/{id}` — get current segments (or derive from startTime/endTime)
- Fetch job data: need `sourceVideoUrl` — either join through clip→job relation, or add `sourceVideoUrl` to clip API response

---

## Entry Points — Edit Buttons

Add an edit button (Scissors icon from lucide-react) on clip cards in:

1. **`/dashboard/clips` page** — each clip card gets an edit icon button
2. **`/dashboard/review` page** — each clip row gets an edit icon button
3. **`/dashboard/clips/[id]` page** — in ClipWorkspace, replace the "Trim" section with a "Edit on timeline →" link that navigates to the editor

All edit buttons navigate to `/dashboard/clips/{id}/edit`.

---

## i18n

New `editor` namespace in `messages/en.json` and `messages/ro.json`:

```json
{
  "editor": {
    "title": "Edit clip",
    "back": "Back to clip",
    "playSegments": "Play segments",
    "playAll": "Play full video",
    "addSegment": "Add segment",
    "deleteSegment": "Delete segment",
    "moveUp": "Move up",
    "moveDown": "Move down",
    "segment": "Segment {number}",
    "duration": "Duration",
    "totalDuration": "Total: {duration}",
    "segments": "{count, plural, one {# segment} other {# segments}}",
    "export": "Export clip",
    "exporting": "Exporting...",
    "exportSuccess": "Clip exported successfully",
    "exportFailed": "Export failed",
    "unsavedChanges": "You have unsaved changes. Leave anyway?",
    "noSource": "Source video not available for this clip",
    "minDuration": "Total duration must be at least 3 seconds",
    "maxSegments": "Maximum 10 segments per clip",
    "segmentsOverlap": "Segments must not overlap"
  }
}
```

Romanian translations follow the same structure with natural Romanian text.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Source video not available | Show message, disable export, allow viewing segments read-only |
| Segments overlap | Client-side validation prevents it (snap behavior); server rejects if bypassed |
| Segment too short (< 0.25s) | Prevent resize below minimum; server validates |
| Total duration < 3s | Disable export button, show inline message |
| > 10 segments | Disable "Add segment" button, show message |
| Export fails | Toast error, clip unchanged, user can retry |
| Unsaved changes + navigate away | Browser confirm dialog |
| Network error saving | Toast error, retry possible |

---

## Files Affected

### Frontend — New
- `frontend/src/app/[locale]/dashboard/clips/[id]/edit/page.tsx` — editor page
- `frontend/src/components/editor/timeline.tsx` — timeline bar component
- `frontend/src/components/editor/segment-list.tsx` — segment list component
- `frontend/src/components/editor/segment-player.tsx` — video player with segment-aware playback
- `frontend/src/components/editor/use-editor-state.ts` — editor state hook (useReducer)

### Frontend — Modified
- `frontend/src/app/[locale]/dashboard/clips/page.tsx` — add edit button to clip cards
- `frontend/src/app/[locale]/dashboard/review/page.tsx` — add edit button to clip rows
- `frontend/src/components/clip/clip-workspace.tsx` — replace Trim section with "Edit on timeline" link
- `frontend/src/app/api/clips/[id]/recut/route.ts` — new API route proxying to backend
- `frontend/messages/en.json` — add `editor` namespace
- `frontend/messages/ro.json` — add `editor` namespace
- `frontend/prisma/schema.prisma` — add `segments` field to Clip, `sourceVideoUrl` to Job

### Backend — Modified
- `backend/app/models/clip.py` — add `segments` column
- `backend/app/models/job.py` — add `source_video_url` column
- `backend/app/schemas/processing.py` — update `HighlightCandidate` to use segments array
- `backend/app/schemas/clip.py` — add `segments` to read schema, add `RecutRequest` schema
- `backend/app/services/highlight_detector.py` — update Gemini prompt and response parsing
- `backend/app/services/clip_generator.py` — update `extract_clip()` for multi-segment concat
- `backend/app/services/processing_pipeline.py` — persist source video, set `sourceVideoUrl`
- `backend/app/api/clips_edit.py` — add `POST /clips/{id}/recut` endpoint
- Alembic migration for new columns

---

## Out of Scope

- Waveform visualization on timeline (future enhancement)
- Drag-and-drop reorder on timeline (reorder via ▲▼ buttons in segment list only)
- Zoom/pan on timeline (future — for very long videos)
- Draft/autosave of editor state
- Undo/redo in editor
- Audio-only editing or separate audio track manipulation
