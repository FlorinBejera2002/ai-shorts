# Multi-Segment Clip Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a timeline-based clip editor where users can view the full source video, see AI-generated segments, manually adjust boundaries, add/remove segments, reorder them, and export the composed result. Also upgrade the AI to produce multi-segment clips.

**Architecture:** Backend-first approach — data model and API changes land first so the frontend has stable contracts to build against. The editor is a new client component page at `/dashboard/clips/[id]/edit` with four sub-components (segment-player, timeline, segment-list, use-editor-state hook). The AI highlight detector and clip generator are updated to handle segment arrays. A new `/recut` Celery task handles multi-segment FFmpeg concat.

**Tech Stack:** Next.js 14 (App Router), Prisma, SQLAlchemy, FastAPI, Celery, FFmpeg, next-intl, Tailwind CSS, lucide-react

**Spec:** `docs/superpowers/specs/2026-07-01-clip-editor-design.md`

---

## File Structure

### Backend — New Files
- `backend/alembic/versions/20260701_add_segments_and_source_video_url.py` — Alembic migration

### Backend — Modified Files
- `backend/app/models/clip.py` — add `segments` JSONB column
- `backend/app/models/job.py` — add `source_video_url` column
- `backend/app/schemas/processing.py` — add `SegmentCandidate`, update `HighlightCandidate`
- `backend/app/schemas/clip.py` — add `segments`/`sourceVideoUrl` to `ClipRead`, add `RecutRequest`/`RecutSegment`
- `backend/app/api/clips_edit.py` — add `POST /clips/{clip_id}/recut` endpoint
- `backend/app/workers/tasks.py` — add `recut_clip_task`
- `backend/app/services/clip_generator.py` — update `extract_clip()` for multi-segment
- `backend/app/services/highlight_detector.py` — multi-segment Gemini prompt
- `backend/app/services/processing_pipeline.py` — persist source video

### Frontend — New Files
- `frontend/src/app/[locale]/dashboard/clips/[id]/edit/page.tsx` — editor page
- `frontend/src/components/editor/use-editor-state.ts` — useReducer hook
- `frontend/src/components/editor/segment-player.tsx` — video player with segment-aware playback
- `frontend/src/components/editor/timeline.tsx` — draggable timeline bar
- `frontend/src/components/editor/segment-list.tsx` — text segment list with reorder

### Frontend — Modified Files
- `frontend/prisma/schema.prisma` — add `segments` to Clip, `sourceVideoUrl` to Job
- `frontend/src/app/api/clips/[id]/recut/route.ts` — proxy to backend
- `frontend/messages/en.json` — add `editor` namespace
- `frontend/messages/ro.json` — add `editor` namespace
- `frontend/src/app/[locale]/dashboard/clips/page.tsx` — add edit button
- `frontend/src/app/[locale]/dashboard/review/page.tsx` — add edit button
- `frontend/src/components/clip/clip-workspace.tsx` — replace Trim with "Edit on timeline" link

---

## Tasks

### Task 1: Backend data models — add segments and source_video_url columns

**Files:**
- Modify: `backend/app/models/clip.py`
- Modify: `backend/app/models/job.py`
- Create: `backend/alembic/versions/20260701_add_segments_and_source_video_url.py`

- [ ] **Step 1: Add `segments` column to Clip model**

In `backend/app/models/clip.py`, add import for `JSONB` from `sqlalchemy.dialects.postgresql` and add the column after `duration`:

```python
from sqlalchemy.dialects.postgresql import JSONB

# Add to Clip class, after duration field:
segments: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
```

- [ ] **Step 2: Add `source_video_url` column to Job model**

In `backend/app/models/job.py`, add after `source_file_path`:

```python
source_video_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
```

- [ ] **Step 3: Create Alembic migration**

Create `backend/alembic/versions/20260701_add_segments_and_source_video_url.py`:

```python
"""Add segments to clips and source_video_url to jobs

Revision ID: 20260701_0001
Revises: 20260630_add_clip_social_captions
Create Date: 2026-07-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "20260701_0001"
down_revision = "20260630_add_clip_social_captions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clips", sa.Column("segments", JSONB, nullable=True))
    op.add_column("jobs", sa.Column("source_video_url", sa.String(2048), nullable=True))

    # Backfill existing clips: create segments from startTime/endTime
    op.execute("""
        UPDATE clips
        SET segments = jsonb_build_array(
            jsonb_build_object('start', start_time, 'end', end_time, 'order', 0)
        )
        WHERE segments IS NULL AND start_time IS NOT NULL AND end_time IS NOT NULL
    """)


def downgrade() -> None:
    op.drop_column("jobs", "source_video_url")
    op.drop_column("clips", "segments")
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/clip.py backend/app/models/job.py backend/alembic/versions/20260701_add_segments_and_source_video_url.py
git commit -m "feat: add segments column to clips and source_video_url to jobs"
```

---

### Task 2: Backend schemas — SegmentCandidate, HighlightCandidate update, RecutRequest

**Files:**
- Modify: `backend/app/schemas/processing.py`
- Modify: `backend/app/schemas/clip.py`

- [ ] **Step 1: Add SegmentCandidate and update HighlightCandidate in processing.py**

In `backend/app/schemas/processing.py`, add `SegmentCandidate` model and update `HighlightCandidate`:

```python
from pydantic import model_validator

class SegmentCandidate(BaseModel):
    start: float
    end: float

class HighlightCandidate(BaseModel):
    segments: list[SegmentCandidate]
    rank: int = 0
    source: str = "gemini"
    viral_score: int = 0
    viral_hook_text: str = ""
    video_description_for_tiktok: str = ""
    video_description_for_instagram: str = ""
    video_title_for_youtube_short: str = ""
    metadata: dict = {}

    @property
    def start(self) -> float:
        return self.segments[0].start

    @property
    def end(self) -> float:
        return self.segments[-1].end

    @model_validator(mode='before')
    @classmethod
    def migrate_legacy(cls, data):
        if isinstance(data, dict) and 'start' in data and 'end' in data and 'segments' not in data:
            data['segments'] = [{'start': data.pop('start'), 'end': data.pop('end')}]
        return data
```

Remove the old `start` and `end` fields from `HighlightCandidate` (they're now properties).

- [ ] **Step 2: Add RecutSegment and RecutRequest to clip.py**

In `backend/app/schemas/clip.py`, add:

```python
class RecutSegment(BaseModel):
    start: float
    end: float
    order: int

    @field_validator('start', 'end')
    @classmethod
    def positive(cls, v):
        if v < 0:
            raise ValueError('must be non-negative')
        return v

    @model_validator(mode='after')
    def start_before_end(self):
        if self.start >= self.end:
            raise ValueError('start must be before end')
        if (self.end - self.start) < 0.25:
            raise ValueError('segment must be at least 0.25 seconds')
        return self

class RecutRequest(BaseModel):
    segments: list[RecutSegment]

    @field_validator('segments')
    @classmethod
    def validate_segments(cls, v):
        if len(v) < 1:
            raise ValueError('at least one segment required')
        if len(v) > 10:
            raise ValueError('maximum 10 segments')
        total = sum(s.end - s.start for s in v)
        if total < 3.0:
            raise ValueError('total duration must be at least 3 seconds')
        # Check for overlaps (sorted by start time)
        by_start = sorted(v, key=lambda s: s.start)
        for i in range(1, len(by_start)):
            if by_start[i].start < by_start[i-1].end:
                raise ValueError('segments must not overlap')
        return v
```

- [ ] **Step 3: Update ClipRead to include segments and sourceVideoUrl**

In `backend/app/schemas/clip.py`, add to `ClipRead`:

```python
segments: list[dict] | None = None
source_video_url: str | None = None
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/processing.py backend/app/schemas/clip.py
git commit -m "feat: add segment schemas and update HighlightCandidate for multi-segment"
```

---

### Task 3: Source video persistence in processing pipeline

**Files:**
- Modify: `backend/app/services/processing_pipeline.py`

- [ ] **Step 1: Update process_video_source() to persist source video**

After the source video is downloaded/prepared in `_prepare_source()`, add logic to copy it to a persistent location and set `job.source_video_url`:

```python
import shutil
from pathlib import Path

# After source is prepared (after _prepare_source call):
source_dir = Path(settings.local_media_root) / "sources" / str(job_id)
source_dir.mkdir(parents=True, exist_ok=True)
source_filename = Path(local_path).name
persistent_source = source_dir / source_filename
shutil.copy2(local_path, persistent_source)
source_video_url = f"/media/sources/{job_id}/{source_filename}"
```

- [ ] **Step 2: Update job record with source_video_url**

In `backend/app/services/processing_pipeline.py`, add `source_video_url` to the returned `PipelineResult` dict (set it to the URL string after copying the source file).

Then in `backend/app/workers/tasks.py`, inside `_mark_job_completed()`, read `result["source_video_url"]` from the pipeline result and set it on the job record:

```python
# In _mark_job_completed(), after setting job.status = "completed":
job.source_video_url = result.get("source_video_url")
```

This is the single point where the field is persisted to the DB.

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/processing_pipeline.py backend/app/workers/tasks.py
git commit -m "feat: persist source video and store URL on job record"
```

---

### Task 4: Highlight detector — multi-segment Gemini prompt

**Files:**
- Modify: `backend/app/services/highlight_detector.py`

- [ ] **Step 1: Update build_prompt() for multi-segment output**

Add to the Gemini prompt in `build_prompt()`:

```
Each clip can be composed of 1 to 5 non-overlapping segments from different parts of the video.
Use multiple segments when combining an attention-grabbing hook with a key moment and a strong
ending would create a more compelling clip. Use a single segment when a continuous moment is
already strong enough on its own.

Return each clip as:
{
  "segments": [{"start": <seconds>, "end": <seconds>}, ...],
  "viral_score": <1-10>,
  ...
}
```

- [ ] **Step 2: Update response parsing**

In `extract_json_response()` and `validate_highlights()`, update to parse the new `segments` array format. The `HighlightCandidate` model_validator handles legacy `{start, end}` format automatically, so parsing just needs to pass raw dicts through.

- [ ] **Step 3: Update validate_highlights()**

Update validation to check each segment within each candidate:
- Each segment's start/end within video duration
- Each segment duration >= min_clip_duration (per segment, not total)
- No overlaps within a candidate's segments (sort by start, check `seg[i].start >= seg[i-1].end`)
- No overlaps across candidates: collect ALL segments from ALL candidates into one flat list, sort by start time, then verify `seg[i].start >= seg[i-1].end`. If any overlap, remove the lower-ranked candidate that contributed the overlapping segment.

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/highlight_detector.py
git commit -m "feat: upgrade highlight detector for multi-segment clip proposals"
```

---

### Task 5: Clip generator — multi-segment extraction

**Files:**
- Modify: `backend/app/services/clip_generator.py`

- [ ] **Step 1: Update extract_clip() to accept segments list**

Change signature from `extract_clip(source, output, start, end, ...)` to `extract_clip(source, output, segments, ...)`:

```python
def extract_clip(
    source_path: str,
    output_path: str,
    segments: list[dict],  # [{"start": float, "end": float, "order": int}]
    crf: int = 23,
    preset: str = "fast",
) -> bool:
    sorted_segments = sorted(segments, key=lambda s: s["order"])

    if len(sorted_segments) == 1:
        # Single segment — same as current behavior
        seg = sorted_segments[0]
        # existing ffmpeg -ss -to logic
        ...
    else:
        # Multi-segment: extract each, then concat
        temp_files = []
        for i, seg in enumerate(sorted_segments):
            temp_path = output_path.replace(".mp4", f"_seg{i}.mp4")
            # ffmpeg -ss seg["start"] -to seg["end"] ...
            temp_files.append(temp_path)

        # Create concat list
        list_path = output_path.replace(".mp4", "_concat.txt")
        with open(list_path, "w") as f:
            for tf in temp_files:
                f.write(f"file '{tf}'\n")

        # ffmpeg -f concat -safe 0 -i list_path -c copy output_path
        # If codec mismatch, re-encode with CRF 18

        # Clean up temp files
        for tf in temp_files:
            Path(tf).unlink(missing_ok=True)
        Path(list_path).unlink(missing_ok=True)

    return True
```

- [ ] **Step 2: Audit and update all callers of extract_clip()**

Search for all call sites of `extract_clip()` across the codebase (`grep -rn "extract_clip(" backend/`). Update each caller to pass a `segments` list instead of `start`/`end`. Known callers:

- `extract_all_clips()` in `clip_generator.py` — convert `candidate.segments` to list of dicts
- `trim_clip_task()` in `workers/tasks.py` — wrap `start_time`/`end_time` into `[{"start": start_time, "end": end_time, "order": 0}]`

Any other callers found via grep must also be updated.

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/clip_generator.py
git commit -m "feat: support multi-segment extraction with FFmpeg concat"
```

---

### Task 6: Recut endpoint and Celery task

**Files:**
- Modify: `backend/app/api/clips_edit.py`
- Modify: `backend/app/workers/tasks.py`

- [ ] **Step 1: Add recut endpoint to clips_edit.py**

```python
from app.schemas.clip import RecutRequest

@router.post("/clips/{clip_id}/recut")
async def recut_clip(
    clip_id: str,
    request: RecutRequest,
    db: AsyncSession = Depends(get_db),
    user = Depends(get_current_user),
):
    # Verify clip ownership
    clip = await db.execute(
        select(Clip).where(Clip.id == clip_id, Clip.user_id == user.id)
    )
    clip = clip.scalar_one_or_none()
    if not clip:
        raise HTTPException(404, "Clip not found")

    # Verify job has source video
    job = await db.execute(select(Job).where(Job.id == clip.job_id))
    job = job.scalar_one_or_none()
    if not job or not job.source_video_url:
        raise HTTPException(400, "Source video not available")

    # Dispatch Celery task
    task = recut_clip_task.delay(
        clip_id=str(clip_id),
        segments=[s.model_dump() for s in request.segments],
    )
    return {"task_id": task.id, "status": "processing"}
```

- [ ] **Step 2: Add recut_clip_task to tasks.py**

```python
@celery_app.task(name="clipforge.recut_clip", bind=True)
def recut_clip_task(self, clip_id: str, segments: list[dict]):
    db = SyncSessionLocal()
    try:
        clip = db.query(Clip).filter(Clip.id == clip_id).first()
        if not clip:
            raise ValueError(f"Clip {clip_id} not found")

        job = db.query(Job).filter(Job.id == clip.job_id).first()
        source_path = str(
            Path(settings.local_media_root) / "sources" / str(job.id)
            / Path(job.source_file_path).name
        )
        if not Path(source_path).exists():
            raise FileNotFoundError("Source video file not found on disk")

        output_dir = Path(settings.local_media_root) / str(job.id) / "clips"
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = str(output_dir / f"recut_{clip_id}.mp4")

        sorted_segs = sorted(segments, key=lambda s: s["order"])
        success = extract_clip(source_path, output_path, sorted_segs)
        if not success:
            raise RuntimeError("FFmpeg extraction failed")

        # Update clip record
        clip.file_path = output_path
        clip.segments = segments
        clip.start_time = min(s["start"] for s in segments)
        clip.end_time = max(s["end"] for s in segments)
        clip.duration = sum(s["end"] - s["start"] for s in segments)
        clip.file_size = Path(output_path).stat().st_size

        # Generate thumbnail
        thumb_path = output_path.replace(".mp4", "_thumb.jpg")
        generate_thumbnail(output_path, thumb_path, timestamp=1.0)
        clip.thumbnail_path = thumb_path

        db.commit()
        return {"status": "completed", "clip_id": clip_id}
    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/clips_edit.py backend/app/workers/tasks.py
git commit -m "feat: add POST /clips/{id}/recut endpoint and Celery task"
```

---

### Task 7: Prisma schema update and frontend recut API route

**Files:**
- Modify: `frontend/prisma/schema.prisma`
- Create: `frontend/src/app/api/clips/[id]/recut/route.ts`

- [ ] **Step 1: Update Prisma schema**

In `frontend/prisma/schema.prisma`, add to Clip model (after `duration`):

```prisma
segments       Json?    @map("segments")
```

Add to Job model (after `sourceFilePath`):

```prisma
sourceVideoUrl String?  @map("source_video_url") @db.VarChar(2048)
```

- [ ] **Step 2: Run prisma generate**

```bash
cd frontend && npx prisma generate
```

- [ ] **Step 3: Create recut API route**

Create `frontend/src/app/api/clips/[id]/recut/route.ts`:

```typescript
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()

  const res = await fetch(`${API}/api/clips/${id}/recut`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/src/app/api/clips/[id]/recut/route.ts
git commit -m "feat: update Prisma schema for segments and add recut API route"
```

---

### Task 8: i18n — add editor namespace to message files

**Files:**
- Modify: `frontend/messages/en.json`
- Modify: `frontend/messages/ro.json`

- [ ] **Step 1: Add editor namespace to en.json**

Add to `frontend/messages/en.json`:

```json
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
```

- [ ] **Step 2: Add editor namespace to ro.json**

Add to `frontend/messages/ro.json`:

```json
"editor": {
  "title": "Editare clip",
  "back": "Înapoi la clip",
  "playSegments": "Redă segmentele",
  "playAll": "Redă videoul complet",
  "addSegment": "Adaugă segment",
  "deleteSegment": "Șterge segment",
  "moveUp": "Mută sus",
  "moveDown": "Mută jos",
  "segment": "Segment {number}",
  "duration": "Durată",
  "totalDuration": "Total: {duration}",
  "segments": "{count, plural, one {# segment} other {# segmente}}",
  "export": "Exportă clip",
  "exporting": "Se exportă...",
  "exportSuccess": "Clipul a fost exportat cu succes",
  "exportFailed": "Exportul a eșuat",
  "unsavedChanges": "Ai modificări nesalvate. Părăsești pagina?",
  "noSource": "Videoul sursă nu este disponibil pentru acest clip",
  "minDuration": "Durata totală trebuie să fie cel puțin 3 secunde",
  "maxSegments": "Maximum 10 segmente per clip",
  "segmentsOverlap": "Segmentele nu trebuie să se suprapună"
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/messages/en.json frontend/messages/ro.json
git commit -m "feat: add editor i18n namespace in English and Romanian"
```

---

### Task 9: Editor state hook — use-editor-state.ts

**Files:**
- Create: `frontend/src/components/editor/use-editor-state.ts`

- [ ] **Step 1: Create the editor state hook**

Create `frontend/src/components/editor/use-editor-state.ts` with a `useReducer`-based state management hook:

```typescript
'use client'

import { useReducer, useCallback, useEffect, useRef } from 'react'

export interface Segment {
  start: number
  end: number
  order: number
}

interface EditorState {
  segments: Segment[]
  selectedIndex: number | null
  isDirty: boolean
}

type Action =
  | { type: 'SET_SEGMENTS'; segments: Segment[] }
  | { type: 'ADD_SEGMENT'; start: number; end: number }
  | { type: 'DELETE_SEGMENT'; index: number }
  | { type: 'RESIZE_SEGMENT'; index: number; start: number; end: number }
  | { type: 'MOVE_SEGMENT'; index: number; start: number; end: number }
  | { type: 'REORDER_SEGMENT'; index: number; direction: 'up' | 'down' }
  | { type: 'SELECT_SEGMENT'; index: number | null }

function reorder(segments: Segment[]): Segment[] {
  return segments.map((s, i) => ({ ...s, order: i }))
}

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'SET_SEGMENTS':
      return { segments: reorder(action.segments), selectedIndex: null, isDirty: false }

    case 'ADD_SEGMENT': {
      if (state.segments.length >= 10) return state
      const seg: Segment = { start: action.start, end: action.end, order: state.segments.length }
      return { ...state, segments: reorder([...state.segments, seg]), isDirty: true }
    }

    case 'DELETE_SEGMENT': {
      if (state.segments.length <= 1) return state
      const filtered = state.segments.filter((_, i) => i !== action.index)
      return { ...state, segments: reorder(filtered), selectedIndex: null, isDirty: true }
    }

    case 'RESIZE_SEGMENT': {
      const updated = state.segments.map((s, i) =>
        i === action.index ? { ...s, start: action.start, end: action.end } : s
      )
      return { ...state, segments: updated, isDirty: true }
    }

    case 'MOVE_SEGMENT': {
      const updated = state.segments.map((s, i) =>
        i === action.index ? { ...s, start: action.start, end: action.end } : s
      )
      return { ...state, segments: updated, isDirty: true }
    }

    case 'REORDER_SEGMENT': {
      const { index, direction } = action
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= state.segments.length) return state
      const arr = [...state.segments]
      ;[arr[index], arr[target]] = [arr[target], arr[index]]
      return { ...state, segments: reorder(arr), isDirty: true }
    }

    case 'SELECT_SEGMENT':
      return { ...state, selectedIndex: action.index }

    default:
      return state
  }
}

export function useEditorState(initialSegments: Segment[]) {
  const [state, dispatch] = useReducer(reducer, {
    segments: reorder(initialSegments),
    selectedIndex: null,
    isDirty: false,
  })

  const isDirtyRef = useRef(state.isDirty)
  isDirtyRef.current = state.isDirty

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const totalDuration = state.segments.reduce((sum, s) => sum + (s.end - s.start), 0)

  const hasOverlap = useCallback(() => {
    const sorted = [...state.segments].sort((a, b) => a.start - b.start)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start < sorted[i - 1].end) return true
    }
    return false
  }, [state.segments])

  const canExport = totalDuration >= 3 && !hasOverlap() && state.segments.length > 0

  return { state, dispatch, totalDuration, canExport, hasOverlap }
}

// Sanitize raw API data into valid Segment[]
export function parseSegments(
  raw: unknown,
  fallbackStart?: number,
  fallbackEnd?: number
): Segment[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .filter((s: any) => typeof s.start === 'number' && typeof s.end === 'number' && s.end > s.start)
      .map((s: any, i: number) => ({ start: s.start, end: s.end, order: s.order ?? i }))
  }
  if (typeof fallbackStart === 'number' && typeof fallbackEnd === 'number') {
    return [{ start: fallbackStart, end: fallbackEnd, order: 0 }]
  }
  return []
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/editor/use-editor-state.ts
git commit -m "feat: add useEditorState hook with reducer for segment editing"
```

---

### Task 10: Segment player component

**Files:**
- Create: `frontend/src/components/editor/segment-player.tsx`

- [ ] **Step 1: Create the segment-aware video player**

Create `frontend/src/components/editor/segment-player.tsx`:

The component renders an HTML5 `<video>` element with:
- A toggle between "Play segments" and "Play full video" modes
- In segment mode: `timeupdate` listener that skips playhead from one segment's end to the next segment's start (sorted by `order`)
- A ref exposed via callback so the parent can sync the playhead with the timeline
- Standard video controls

Props:
```typescript
interface SegmentPlayerProps {
  sourceUrl: string
  segments: Segment[]
  onTimeUpdate?: (currentTime: number) => void
  seekTo?: number
}
```

Key behavior:
- On `timeupdate`, if segment mode active and `currentTime > currentSegment.end`, seek to next segment's start
- On last segment end, pause
- Expose current time to parent for timeline sync

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/editor/segment-player.tsx
git commit -m "feat: add segment-aware video player component"
```

---

### Task 11: Timeline component

**Files:**
- Create: `frontend/src/components/editor/timeline.tsx`

- [ ] **Step 1: Create the timeline bar component**

Create `frontend/src/components/editor/timeline.tsx`:

The component renders a horizontal bar representing the full source video duration with:
- Colored blocks for each segment (positioned proportionally)
- Draggable left/right edges for resizing segments
- Draggable segment body for moving
- Playhead (vertical line) tracking current video time
- Click on empty area to position new segment
- Tick marks for timestamps
- Selected segment highlight

Props:
```typescript
interface TimelineProps {
  duration: number           // source video total duration
  segments: Segment[]
  selectedIndex: number | null
  currentTime: number        // playhead position
  onResize: (index: number, start: number, end: number) => void
  onMove: (index: number, start: number, end: number) => void
  onSelect: (index: number | null) => void
  onAddAt: (time: number) => void
  onSeek: (time: number) => void
}
```

Key implementation:
- Use `useRef` for the bar element, calculate positions from mouse events relative to bar width
- `onPointerDown`/`onPointerMove`/`onPointerUp` for drag interactions
- Distinguish between handle drag (resize) and body drag (move) via target element
- Minimum segment width enforced at 0.25s
- Prevent segments from overlapping during drag (snap to edge)
- Tailwind styling: segments as `bg-primary/40` blocks, handles as `bg-primary` thin strips, playhead as `bg-red-500` line

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/editor/timeline.tsx
git commit -m "feat: add draggable timeline component for segment editing"
```

---

### Task 12: Segment list component

**Files:**
- Create: `frontend/src/components/editor/segment-list.tsx`

- [ ] **Step 1: Create the segment list component**

Create `frontend/src/components/editor/segment-list.tsx`:

Renders a text list of segments with reorder and delete controls:

Props:
```typescript
interface SegmentListProps {
  segments: Segment[]
  selectedIndex: number | null
  onSelect: (index: number | null) => void
  onDelete: (index: number) => void
  onReorder: (index: number, direction: 'up' | 'down') => void
  onAdd: () => void
  totalDuration: number
  canAddMore: boolean
}
```

Each row shows:
- Segment number, formatted time range (`formatTime(start) → formatTime(end)`), duration
- ▲▼ reorder buttons (ChevronUp/ChevronDown from lucide)
- ✕ delete button (X from lucide)
- Selected state with highlighted border

Footer:
- "+ Add segment" button (Plus icon)
- Total duration display

Helper `formatTime(seconds)` formats as `M:SS.s` (e.g., `1:29.2`).

Uses `useTranslations('editor')` for all labels.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/editor/segment-list.tsx
git commit -m "feat: add segment list component with reorder and delete"
```

---

### Task 13: Editor page — compose all components

**Files:**
- Create: `frontend/src/app/[locale]/dashboard/clips/[id]/edit/page.tsx`

- [ ] **Step 1: Create the editor page**

Create `frontend/src/app/[locale]/dashboard/clips/[id]/edit/page.tsx` as a client component:

```typescript
'use client'
```

The page:
1. Fetches clip data via `GET /api/clips/{id}` (including `sourceVideoUrl` and `segments`)
2. If no `sourceVideoUrl`: shows "Source video not available" message with back link
3. Initializes `useEditorState` with the clip's segments (or derived from startTime/endTime if segments is null)
4. Renders:
   - Header: clip title, back link (using `Link` from `@/i18n/navigation`), Export button
   - `<SegmentPlayer>` with source video URL
   - `<Timeline>` synced to player's currentTime
   - `<SegmentList>` showing all segments
   - Export button at bottom
5. Export handler: POST to `/api/clips/{id}/recut` with current segments, show toast, navigate on success
6. Uses `useTranslations('editor')` for all strings

State flow (unidirectional):
- `currentTime` lives as `useState<number>(0)` in the editor page
- Player fires `onTimeUpdate(t)` → `setCurrentTime(t)` → Timeline reads `currentTime` prop and moves playhead
- Timeline fires `onSeek(t)` → page sets `seekTo` state → Player reads `seekTo` prop and calls `videoRef.current.currentTime = seekTo`
- `seekTo` is cleared after Player processes it (set back to `undefined`) to avoid re-seeking on re-render
- Timeline drag/resize/move → dispatches to `useEditorState` reducer → new `state.segments` flows to both Timeline and SegmentList
- SegmentList reorder/delete/add → dispatches to same `useEditorState` reducer
- Player also reads `state.segments` for segment-mode playback skipping

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/[locale]/dashboard/clips/[id]/edit/page.tsx
git commit -m "feat: add clip editor page with timeline, player, and segment list"
```

---

### Task 14: Entry point buttons — add edit links to clip cards and workspace

**Files:**
- Modify: `frontend/src/app/[locale]/dashboard/clips/page.tsx`
- Modify: `frontend/src/app/[locale]/dashboard/review/page.tsx`
- Modify: `frontend/src/components/clip/clip-workspace.tsx`

- [ ] **Step 1: Add edit button to clips page**

In `frontend/src/app/[locale]/dashboard/clips/page.tsx`, add a Scissors icon button to each clip card that links to `/dashboard/clips/{id}/edit`. Import `Scissors` from `lucide-react` and `Link` from `@/i18n/navigation`. Add the button next to the existing clip title or as an overlay on the card.

- [ ] **Step 2: Add edit button to review page**

In `frontend/src/app/[locale]/dashboard/review/page.tsx`, add a Scissors icon button to each clip row in the table. Link to `/dashboard/clips/{id}/edit`.

- [ ] **Step 3: Replace Trim section in clip-workspace.tsx**

In `frontend/src/components/clip/clip-workspace.tsx`, find the existing Trim section (the inputs for start_time/end_time and "Trim & re-export" button). Replace it with a "Edit on timeline →" link that navigates to `/dashboard/clips/{id}/edit`. Use `Link` from `@/i18n/navigation` and `Scissors` icon.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/[locale]/dashboard/clips/page.tsx frontend/src/app/[locale]/dashboard/review/page.tsx frontend/src/components/clip/clip-workspace.tsx
git commit -m "feat: add edit buttons on clip cards, review page, and workspace"
```

---

### Task 15: Build verification

- [ ] **Step 1: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 2: Run Next.js build**

```bash
cd frontend && npm run build
```

Fix any build errors.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "fix: resolve build errors from clip editor implementation"
```
