import pytest
from pathlib import Path

from app.services import clip_generator
from app.services.clip_generator import validate_clip_window


def test_validate_clip_window_accepts_valid_window():
    validate_clip_window(1, 3, 10)


def test_validate_clip_window_rejects_out_of_range():
    with pytest.raises(ValueError):
        validate_clip_window(1, 11, 10)


def test_validate_clip_window_rejects_reversed_window():
    with pytest.raises(ValueError):
        validate_clip_window(3, 1, 10)


def test_extract_clip_preserves_editor_order_for_reordered_cuts(monkeypatch, tmp_path):
    monkeypatch.setattr(clip_generator, "validate_video_file", lambda _: None)
    monkeypatch.setattr(clip_generator, "get_video_duration", lambda _: 12)
    monkeypatch.setattr(clip_generator, "has_audio_stream", lambda _: True)
    commands = []

    def encode(command):
        commands.append(command)
        Path(command[-1]).touch()

    monkeypatch.setattr(clip_generator, "run_ffmpeg", encode)
    assert clip_generator.extract_clip(
        "source.mp4",
        str(tmp_path / "recut.mp4"),
        [
            {"start": 6, "end": 8},
            {"start": 1, "end": 3},
        ],
    )
    assert [
        command[command.index("-ss") + 1] for command in commands if "-ss" in command
    ] == ["6", "1"]
    assert commands[-1][commands[-1].index("-f") + 1] == "concat"


@pytest.mark.parametrize(
    "segments",
    [
        [{"start": 6, "end": 8}, {"start": 5, "end": 7}],
        [{"start": float("nan"), "end": 8}, {"start": 1, "end": 3}],
    ],
)
def test_reordered_cuts_still_reject_overlap_and_nonfinite_times(
    monkeypatch, tmp_path, segments
):
    def unexpected_encode(command):
        pytest.fail("Invalid source windows reached FFmpeg")

    monkeypatch.setattr(clip_generator, "run_ffmpeg", unexpected_encode)
    assert not clip_generator.extract_clip(
        "source.mp4", str(tmp_path / "invalid.mp4"), segments
    )
