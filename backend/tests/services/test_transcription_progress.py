import pytest

from app.services import processing_pipeline


def test_pipeline_reports_monotonic_bounded_transcription_progress(monkeypatch, tmp_path):
    monkeypatch.setattr(processing_pipeline, "get_storage_backend", lambda: object())
    monkeypatch.setattr(processing_pipeline, "_prepare_source", lambda *args: {
        "type": "local", "title": "test", "duration": 100, "local_path": "test.mp4",
    })
    monkeypatch.setattr(processing_pipeline, "validate_video_file", lambda path: None)
    events = []

    def transcribe(path, language=None, on_progress=None):
        for seconds in [0, 25, 25, 10, 50, 100, 105]:
            on_progress(seconds)
        raise RuntimeError("stop before downstream processing")

    monkeypatch.setattr(processing_pipeline, "transcribe_video", transcribe)
    with pytest.raises(RuntimeError, match="stop before downstream"):
        processing_pipeline.process_video_source(
            "test.mp4", output_root=str(tmp_path),
            on_progress=lambda status, pct, message: events.append((status, pct, message)),
        )
    progress = [pct for status, pct, _ in events if status == "transcribing"]
    assert progress == [20, 27, 34, 49]
    assert events[-1][2] == "Transcribing audio — 100%"
