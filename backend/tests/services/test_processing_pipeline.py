from app.services import processing_pipeline


def test_pipeline_orchestrates_with_mocked_services(monkeypatch, tmp_path):
    source = tmp_path / "source.mp4"
    source.write_bytes(b"fake")

    monkeypatch.setattr(
        processing_pipeline,
        "copy_local_video",
        lambda source_path, output_dir: {
            "type": "local",
            "title": "source",
            "duration": 90,
            "local_path": str(source),
            "metadata": {},
        },
    )
    monkeypatch.setattr(processing_pipeline, "validate_video_file", lambda path: None)
    monkeypatch.setattr(processing_pipeline, "get_video_duration", lambda path: 90)
    monkeypatch.setattr(
        processing_pipeline,
        "transcribe_video",
        lambda path: {
            "text": "hello world",
            "language": "en",
            "duration": 90,
            "segments": [],
            "words": [
                {"text": "hello", "start": 10, "end": 10.5},
                {"text": "world", "start": 11, "end": 11.5},
            ],
        },
    )
    monkeypatch.setattr(
        processing_pipeline,
        "detect_highlights",
        lambda transcript, duration, requested_clips, user_instructions=None: [
            {"start": 10, "end": 35, "viral_hook_text": "hook"}
        ],
    )

    clip_file = tmp_path / "clip.mp4"
    clip_file.write_bytes(b"clip")
    thumbnail_file = tmp_path / "clip.jpg"
    thumbnail_file.write_bytes(b"thumbnail")
    monkeypatch.setattr(
        processing_pipeline,
        "extract_all_clips",
        lambda input_video, clips, output_dir, video_title: [
            {
                "index": 1,
                "start": 10,
                "end": 35,
                "duration": 25,
                "title": "",
                "hook_text": "hook",
                "file_path": str(clip_file),
                "file_name": "clip.mp4",
                "file_size": 4,
                "resolution": "1920x1080",
                "thumbnail_path": str(thumbnail_file),
                "vertical_file_path": None,
                "subtitled_file_path": None,
                "metadata": {},
            }
        ],
    )

    class FakeStorage:
        saved = []

        def save_file(self, source_path, key):
            self.saved.append((str(source_path), key))
            return key

        def public_url(self, key):
            return f"/media/{key}"

    monkeypatch.setattr(
        processing_pipeline, "get_storage_backend", lambda: FakeStorage()
    )

    result = processing_pipeline.process_video_source(
        str(source),
        output_root=str(tmp_path),
        smart_crop=False,
        burn_subtitles=False,
        storage_namespace="00000000-0000-0000-0000-000000000123",
    )
    metadata = result["clips"][0]["metadata"]
    assert result["source_storage_key"] == (
        "sources/00000000-0000-0000-0000-000000000123/source.mp4"
    )
    assert metadata["storage_key"].startswith(
        "clips/00000000-0000-0000-0000-000000000123/"
    )
    assert metadata["thumbnail_storage_key"].startswith(
        "clips/00000000-0000-0000-0000-000000000123/thumbnails/"
    )
    assert metadata["public_url"].startswith("/media/clips/")
