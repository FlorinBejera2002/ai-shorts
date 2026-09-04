from types import SimpleNamespace

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
