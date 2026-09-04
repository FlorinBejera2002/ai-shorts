# Auto-edit transitions (CF020)

AI-selected multi-segment highlights support `cut` (default), `fade` and
`dissolve`. Effect names are allowlisted before constructing FFmpeg filters.
Durations are bounded to 0.05–0.5 seconds, further limited to half of each
adjacent segment. Inputs must be ordered, non-overlapping and finite; extraction
accepts at most ten segments. Existing outputs keep hard cuts by default.

Crossfades normalize video to 30 fps, crossfade audio at 48 kHz when present,
and output H.264 yuv420p/AAC MP4 with fast-start metadata. Silent sources stay
silent. Output duration is selected segment duration minus overlaps. Captions
use the same overlap timeline; at transition midpoints, caption ownership moves
to the next segment to avoid conflicting text from overlapping audio.

Thirteen focused tests cover real FFmpeg fade/dissolve outputs with two and three
segments, with and without audio, complete output decoding, browser-compatible
pixel format, output duration, subtitle timing, invalid effect names and short
segment bounds. Paid AI selection was not exercised; model response validation
and the local render path are independently testable.

The source editor's explicit recut operation still produces hard cuts. This
feature applies to generated highlights, not a new transition control in the UI.

Reference: [FFmpeg xfade/acrossfade filters](https://ffmpeg.org/ffmpeg-filters.html).
