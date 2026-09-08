from types import SimpleNamespace
import sys

import pytest

from app.services import transcriber


def test_language_is_preserved_when_vad_retries(monkeypatch, tmp_path):
    calls = []

    class Model:
        def transcribe(self, path, **options):
            calls.append(options)
            if len(calls) == 1:
                return iter([]), SimpleNamespace(language="ro")
            segment = SimpleNamespace(text="Salut", start=0, end=1, words=[])
            return iter([segment]), SimpleNamespace(language="ro")

    monkeypatch.setattr(transcriber, "_get_model", lambda: Model())
    monkeypatch.setattr(transcriber, "validate_video_file", lambda path: None)
    monkeypatch.setattr(transcriber, "has_audio_stream", lambda path: True)
    monkeypatch.setattr(transcriber, "get_video_duration", lambda path: 1)
    result = transcriber.transcribe_video(str(tmp_path / "speech.mp4"), language="ro")
    assert result["text"] == "Salut"
    assert [call["language"] for call in calls] == ["ro", "ro"]
    assert [call["vad_filter"] for call in calls] == [True, False]


def test_progress_is_reported_while_segments_are_consumed():
    events = []

    def segments():
        yield SimpleNamespace(text="First", start=0, end=12, words=[])
        assert events == [12.0]
        yield SimpleNamespace(text="Second", start=12, end=24, words=[])

    result = transcriber._collect_transcript(segments(), events.append)
    assert events == [12.0, 24.0]
    assert result[2] == ["First", "Second"]


def test_progress_cancellation_stops_transcription():
    def segments():
        yield SimpleNamespace(text="First", start=0, end=12, words=[])
        pytest.fail("Must not decode more segments after cancellation")

    def cancelled(seconds):
        raise RuntimeError("cancelled")

    with pytest.raises(RuntimeError, match="cancelled"):
        transcriber._collect_transcript(segments(), cancelled)


def test_model_reloads_when_cpu_thread_setting_changes(monkeypatch):
    calls = []

    def model(size, **options):
        calls.append(options)
        return object()

    monkeypatch.setitem(sys.modules, "faster_whisper", SimpleNamespace(WhisperModel=model))
    monkeypatch.setattr(transcriber, "_model", None)
    monkeypatch.setattr(transcriber, "_model_key", None)
    monkeypatch.setattr(transcriber.settings, "whisper_cpu_threads", 2)
    first = transcriber._get_model()
    assert transcriber._get_model() is first
    monkeypatch.setattr(transcriber.settings, "whisper_cpu_threads", 1)
    assert transcriber._get_model() is not first
    assert [call["cpu_threads"] for call in calls] == [2, 1]
