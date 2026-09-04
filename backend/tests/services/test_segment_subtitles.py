import pytest
from app.schemas.processing import ClipOutput
from app.services.subtitle_burner import _format_srt_time, generate_srt
from pydantic import ValidationError


def test_multi_segment_clip_duration_excludes_removed_gaps():
    clip = ClipOutput(
        index=1,
        start=10,
        end=25,
        duration=10,
        segments=[{"start": 10, "end": 15}, {"start": 20, "end": 25}],
        file_path="clip.mp4",
        file_name="clip.mp4",
    )
    assert clip.duration == 10
    with pytest.raises(ValidationError):
        ClipOutput.model_validate(clip.model_dump() | {"duration": 15})


def test_subtitles_follow_concatenated_segments_not_source_gaps(tmp_path):
    output = tmp_path / "subtitles.srt"
    assert generate_srt(
        {
            "text": "first omitted last",
            "words": [
                {"text": "first", "start": 10, "end": 11},
                {"text": "omitted", "start": 16, "end": 17},
                {"text": "last", "start": 20, "end": 21},
            ],
        },
        10,
        25,
        str(output),
        source_segments=[{"start": 10, "end": 15}, {"start": 20, "end": 25}],
    )
    srt = output.read_text()
    assert "omitted" not in srt
    assert "00:00:00,000 --> 00:00:01,000" in srt
    assert "00:00:05,000 --> 00:00:06,000" in srt
    assert "00:00:10,000" not in srt


def test_srt_rounding_carries_to_next_second():
    assert _format_srt_time(59.9996) == "00:01:00,000"
