import os
import re
import shutil
import subprocess

import pytest

from app.schemas.processing import ClipOutput
from app.services import clip_generator
from app.services.highlight_detector import validate_highlights
from app.services.subtitle_burner import generate_srt
from app.services.transitions import transition_overlaps


@pytest.mark.parametrize("style", ["fade", "dissolve"])
@pytest.mark.parametrize("audio", [False, True])
@pytest.mark.parametrize("count", [2, 3])
def test_real_transition_duration_and_audio(tmp_path, monkeypatch, style, audio, count):
    binary = os.environ.get("SNEEPCUT_FFMPEG_BINARY") or shutil.which("ffmpeg")
    if not binary:
        pytest.skip("FFmpeg required")

    def run(command, **kwargs):
        result = subprocess.run([binary, *command[1:]], capture_output=True, timeout=60)
        if result.returncode:
            raise RuntimeError(result.stderr.decode())
        return result

    source, output = tmp_path / "source.mp4", tmp_path / "output.mp4"
    command = ["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc2=s=160x90:r=30:d=6"]
    if audio:
        command += ["-f", "lavfi", "-i", "sine=frequency=440:duration=6", "-c:a", "aac"]
    command += ["-c:v", "libx264", "-pix_fmt", "yuv420p", str(source)]
    run(command)
    monkeypatch.setattr(clip_generator, "run_ffmpeg", run)
    monkeypatch.setattr(clip_generator, "validate_video_file", lambda _: None)
    monkeypatch.setattr(clip_generator, "get_video_duration", lambda _: 6)
    monkeypatch.setattr(clip_generator, "has_audio_stream", lambda _: audio)
    segments = [{"start": 0, "end": 2}, {"start": 4, "end": 6}]
    if count == 3:
        segments.insert(1, {"start": 2, "end": 4})
    expected_duration = 2 * count - .25 * (count - 1)
    assert clip_generator.extract_clip(
        str(source), str(output), segments, transition=style
    )
    metadata = subprocess.run(
        [binary, "-i", str(output)], capture_output=True, timeout=10
    ).stderr.decode()
    match = re.search(r"Duration: 00:00:(\d+\.\d+)", metadata)
    assert match, metadata
    assert abs(float(match[1]) - expected_duration) < 0.08
    assert ("Audio:" in metadata) == audio
    assert "yuv420p" in metadata
    # Decode the complete result, catching corrupt/truncated frame output.
    run(["ffmpeg", "-v", "error", "-i", str(output), "-f", "null", "-"])
    ClipOutput(
        index=1,
        start=0,
        end=6,
        duration=expected_duration,
        segments=segments,
        transition=style,
        file_path=str(output),
        file_name=output.name,
    )


@pytest.mark.parametrize(
    "style,duration", [("evil,filter", 0.25), ("fade", float("nan")), ("fade", 1)]
)
def test_untrusted_transition_rejected(style, duration):
    with pytest.raises(ValueError):
        transition_overlaps([{"start": 0, "end": 2}], style, duration)


def test_short_segment_overlap_is_bounded():
    assert transition_overlaps(
        [{"start": 0, "end": 0.25}, {"start": 1, "end": 2}], "fade", 0.5
    ) == [0.125]


def test_captions_follow_crossfade_timeline(tmp_path):
    destination = tmp_path / "captions.srt"
    assert generate_srt(
        {
            "text": "first second",
            "words": [
                {"text": "first", "start": 1, "end": 1.5},
                {"text": "second", "start": 4.5, "end": 5},
            ],
        },
        0,
        6,
        str(destination),
        max_chars=6,
        source_segments=[{"start": 0, "end": 2}, {"start": 4, "end": 6}],
        transition="fade",
        transition_duration=0.25,
    )
    assert "00:00:02,250 --> 00:00:02,750" in destination.read_text()


@pytest.mark.parametrize("style,accepted", [("fade", True), ("dissolve", True), ("cut", True), ("bad,filter", False)])
def test_ai_response_transition_allowlist(style, accepted):
    candidates = validate_highlights({"shorts": [{
        "segments": [{"start": 0, "end": 10}, {"start": 20, "end": 30}],
        "transition": style, "transition_duration": .25,
    }]}, video_duration=30, requested_clips=1)
    assert bool(candidates) == accepted
    if accepted:
        assert candidates[0].transition == style
