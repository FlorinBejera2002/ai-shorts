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

Prisma:
```prisma
segments  Json?   @map("segments")   // nullable for backward compatibility
```

SQLAlchemy:
```python
segments: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
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
- When segments are saved from the editor, `startTime`/`endTime`/`duration` are recalculated:
  - `startTime = min(seg.start for seg in segments)` — earliest source timestamp
  - `endTime = max(seg.end for seg in segments)` — latest source timestamp
  - `duration = sum(seg.end - seg.start for seg in segments)` — this is the **final video length after concatenation**, not the source timeline span
- `duration` is always recomputed when segments are updated; it is never user-editable
- Segments must not overlap (checked after sorting by `start` within each segment)
- Each segment: `start < end`, individual duration >= 0.25s
- Total duration (sum of all segments) >= 3s
- Maximum 10 segments per clip

**Migration strategy:** Alembic migration adds the `segments` column as nullable JSONB. A data migration backfills all existing clips: `segments = [{"start": start_time, "end": end_time, "order": 0}]` for every row where `segments IS NULL`. After migration, all clips have explicit segments.

### Job Model — new field

Prisma:
```prisma
sourceVideoUrl  String?  @map("source_video_url") @db.VarChar(2048)
```

SQLAlchemy:
```python
source_video_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
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
class SegmentCandidate(BaseModel):
    start: float
    end: float

class HighlightCandidate(BaseModel):
    segments: list[SegmentCandidate]  # 1-5 segments per clip
    # ... other fields (rank, viral_score, etc.) unchanged

    # Backward-compat accessors for code that uses .start / .end
    @property
    def start(self) -> float:
        return self.segments[0].start

    @property
    def end(self) -> float:
        return self.segments[-1].end

    # Pydantic validator: accept legacy {start, end} input and convert
    @model_validator(mode='before')
    @classmethod
    def migrate_legacy(cls, data):
        if 'start' in data and 'end' in data and 'segments' not in data:
            data['segments'] = [{'start': data.pop('start'), 'end': data.pop('end')}]
        return data
```

This keeps all existing code that reads `candidate.start` / `candidate.end` working without changes, while new code uses `candidate.segments`.

---

## Source Video Persistence

- In `processing_pipeline.py`, after download/copy, the source video is copied to a persistent location: `{settings.local_media_root}/sources/{job_id}/{original_filename}`
- Nginx serves it at `/media/sources/{job_id}/{filename}`
- `Job.source_video_url` is set to this public URL (e.g. `/media/sources/{job_id}/video.mp4`) after processing
- The source is NOT deleted during cleanup
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

### Pydantic schema

```python
class RecutRequest(BaseModel):
    segments: list[SegmentCandidate]  # reuse SegmentCandidate + add order

class RecutSegment(BaseModel):
    start: float
    end: float
    order: int
```

### Processing Flow (Celery task: `recut_clip_task`)

1. Validate segments (no overlap, start < end, each >= 0.25s, total >= 3s, within source duration)
2. Sort segments by `order` field — this determines the sequence in the final concatenated video (not source timeline order)
3. Resolve source video path: `{settings.local_media_root}/sources/{job.id}/{filename}` (derived from `Job.source_file_path` basename). If local file missing, return error
4. If single segment: extract directly with `ffmpeg -ss {start} -to {end}` (existing path)
5. If multi-segment:
   a. Extract each segment to a temp file (ordered by `order`)
   b. Create concat list file
   c. `ffmpeg -f concat -safe 0 -i list.txt -c copy output.mp4` (stream copy if codec compatible, else re-encode CRF 18)
6. Apply post-processing pipeline (smart crop, subtitles, brand kit) as in existing clip generation
7. Update Clip in DB: `filePath`, `fileUrl`, `segments`, `startTime`, `endTime`, `duration`, `fileSize`, `resolution`
8. Generate new thumbnail
9. Return via Celery result

### Coexistence with `/trim`

The existing `POST /clips/{clip_id}/trim` endpoint remains for backward compatibility. The new `/recut` endpoint handles both single-segment and multi-segment clips and is the recommended path for all new clients. `/trim` is not deprecated but no new features will be added to it.

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

2. **Video Player** (`segment-player.tsx`)
   - Plays the source video (full, from `sourceVideoUrl` included in clip API response)
   - Standard HTML5 `<video>` element with controls
   - Toggle: "Play segments" (default) / "Play full video"
   - **Segment playback implementation:** uses a custom playback loop via `timeupdate` event listener. When in "Play segments" mode, if the current playhead exceeds the current segment's `end`, the player seeks to the next segment's `start` (in `order` sequence). On the last segment's end, playback pauses. This produces a seamless preview of what the exported clip will look like.
   - Playhead position syncs with timeline bar

3. **Timeline Bar** (`timeline.tsx`)
   - Horizontal bar representing full source duration (0 → total)
   - Segments rendered as colored blocks on the timeline (visual blocks, not waveform)
   - Interactions:
     - **Drag left/right edges** of a segment to resize (shorten/extend)
     - **Drag segment body** to move it to a different time position
     - **Click empty area** + "Add segment" to create a 5-second segment at that position
     - **Click segment** to select it (highlighted border), shows delete button
     - **Playhead** (vertical line) tracks current video position
   - Tick marks below: timestamps at regular intervals (adapts to duration)
   - Minimum segment width enforced visually (0.25s)

4. **Segment List** (`segment-list.tsx`, below timeline)
   - Text representation of each segment, ordered by `order`:
     - `Segment 1: 0:12.5 → 0:25.0 (12.5s)` with ▲▼ reorder buttons and ✕ delete
     - `Segment 2: 1:29.2 → 1:42.7 (13.5s)`
   - "+ Add segment" button at bottom
   - Total duration display: "Total: 26.0s"
   - Reordering via ▲▼ updates the `order` field in local state only. New order is sent to backend on export.

5. **Export section** (bottom)
   - Summary: "{n} segments, {duration}s total"
   - "Export clip" button → POST `/api/clips/{id}/recut` with current segments
   - After successful submission: toast with success message, navigate to `/dashboard/jobs/{task_id}` to show real-time progress

### State Management (`use-editor-state.ts`)

- Custom hook using `useReducer` with actions: `SET_SEGMENTS`, `ADD_SEGMENT`, `DELETE_SEGMENT`, `RESIZE_SEGMENT`, `MOVE_SEGMENT`, `REORDER_SEGMENT`
- Tracks `isDirty` flag (any change from initial state)
- `beforeunload` event listener warns on unsaved changes when `isDirty`
- next-intl router navigation also guarded with confirmation dialog when `isDirty`

### Data Fetching

- `GET /api/clips/{id}` response is extended to include `sourceVideoUrl: string | null` (joined from the related Job record). This avoids a separate API call. The backend `ClipRead` schema adds this field.

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
- `frontend/src/app/[locale]/dashboard/clips/[id]/edit/page.tsx` — editor page (client component)
- `frontend/src/components/editor/timeline.tsx` — timeline bar component
- `frontend/src/components/editor/segment-list.tsx` — segment list component
- `frontend/src/components/editor/segment-player.tsx` — video player with segment-aware playback (uses `timeupdate` event for segment skipping)
- `frontend/src/components/editor/use-editor-state.ts` — custom hook (useReducer) managing editor state and dirty tracking

### Frontend — Modified
- `frontend/src/app/[locale]/dashboard/clips/page.tsx` — add edit button to clip cards
- `frontend/src/app/[locale]/dashboard/review/page.tsx` — add edit button to clip rows
- `frontend/src/components/clip/clip-workspace.tsx` — replace Trim section with "Edit on timeline" link
- `frontend/src/app/api/clips/[id]/recut/route.ts` — new Next.js API route proxying to backend `POST /clips/{id}/recut`
- `frontend/messages/en.json` — add `editor` namespace
- `frontend/messages/ro.json` — add `editor` namespace
- `frontend/prisma/schema.prisma` — add `segments` field to Clip, `sourceVideoUrl` to Job

### Backend — New
- `backend/alembic/versions/xxxx_add_segments_and_source_video_url.py` — Alembic migration (add columns + backfill segments from startTime/endTime)

### Backend — Modified
- `backend/app/models/clip.py` — add `segments` column (JSONB, nullable)
- `backend/app/models/job.py` — add `source_video_url` column (String, nullable)
- `backend/app/schemas/processing.py` — add `SegmentCandidate`, update `HighlightCandidate` with segments array + backward-compat validator + property accessors
- `backend/app/schemas/clip.py` — add `segments` and `sourceVideoUrl` to `ClipRead`, add `RecutRequest`/`RecutSegment` schemas
- `backend/app/services/highlight_detector.py` — update Gemini prompt and response parsing for multi-segment
- `backend/app/services/clip_generator.py` — update `extract_clip()` to accept segments list, add concat logic
- `backend/app/services/processing_pipeline.py` — persist source video to `media/sources/{job_id}/`, set `job.source_video_url`
- `backend/app/api/clips_edit.py` — add `POST /clips/{clip_id}/recut` endpoint
- `backend/app/workers/tasks.py` — add `recut_clip_task` Celery task

---

## Out of Scope

- Waveform visualization on timeline (future enhancement)
- Drag-and-drop reorder on timeline (reorder via ▲▼ buttons in segment list only)
- Zoom/pan on timeline (future — for very long videos)
- Draft/autosave of editor state
- Undo/redo in editor
- Audio-only editing or separate audio track manipulation
