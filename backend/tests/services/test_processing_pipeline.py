import pytest
from app.services import processing_pipeline, subtitle_burner


@pytest.mark.parametrize("attempt_id", [None, "00000000-0000-0000-0000-000000000456"])
@pytest.mark.parametrize("brand_settings,expected_badge", [
    (None, False),
    ({"apply_brand": False, "hide_platform_badge": False}, True),
    ({"apply_brand": False, "hide_platform_badge": True}, False),
])
@pytest.mark.parametrize(
    "language,subtitle_style,burn_subtitles,fail_burn",
    [
        (None, "clean", False, False),
        ("ro", "bold", True, False),
        ("ro", "bold", True, True),
    ],
)
def test_pipeline_orchestrates_with_mocked_services(
    monkeypatch,
    tmp_path,
    language,
    subtitle_style,
    burn_subtitles,
    fail_burn,
    attempt_id,
    brand_settings,
    expected_badge,
):
    seen_language = []
    seen_style = []
    rendered_brands = []
    monkeypatch.setattr(
        processing_pipeline, "get_video_resolution", lambda path: "1920x1080"
    )
    def render(source, destination, **kwargs):
        rendered_brands.append(kwargs["brand"])
        return source

    monkeypatch.setattr(processing_pipeline, "render_framing_and_brand", render)
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
        lambda path, language=None, on_progress=None: (
            seen_language.append(language)
            or {
                "text": "hello world",
                "language": "en",
                "duration": 90,
                "segments": [],
                "words": [
                    {"text": "hello", "start": 10, "end": 10.5},
                    {"text": "world", "start": 11, "end": 11.5},
                ],
            }
        ),
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
    monkeypatch.setattr(subtitle_burner, "generate_srt", lambda *args, **kwargs: True)

    def burn(source, srt, output, *, style):
        if fail_burn:
            return False
        seen_style.append(style)
        from pathlib import Path

        Path(output).write_bytes(b"rendered")
        return True

    monkeypatch.setattr(subtitle_burner, "burn_subtitles", burn)

    if fail_burn:
        with pytest.raises(RuntimeError, match="Subtitle encoder"):
            processing_pipeline.process_video_source(
                str(source),
                output_root=str(tmp_path),
                smart_crop=False,
                burn_subtitles=True,
            )
        assert FakeStorage.saved == []
        return

    result = processing_pipeline.process_video_source(
        str(source),
        output_root=str(tmp_path),
        smart_crop=False,
        burn_subtitles=burn_subtitles,
        language=language,
        subtitle_style=subtitle_style,
        storage_namespace="00000000-0000-0000-0000-000000000123",
        attempt_id=attempt_id,
        brand_settings=brand_settings,
    )
    metadata = result["clips"][0]["metadata"]
    assert metadata["contains_platform_badge"] is expected_badge
    prefix = "00000000-0000-0000-0000-000000000123"
    if attempt_id:
        prefix += f"/attempts/{attempt_id}"
    assert result["source_storage_key"] == f"sources/{prefix}/source.mp4"
    assert metadata["storage_key"].startswith(f"clips/{prefix}/")
    if expected_badge:
        assert metadata["tiktok_storage_key"].startswith(
            f"clips/{prefix}/tiktok/"
        )
    else:
        assert "tiktok_storage_key" not in metadata
    assert metadata["thumbnail_storage_key"].startswith(f"clips/{prefix}/thumbnails/")
    assert metadata["public_url"].startswith("/media/clips/")
    assert rendered_brands[0] is brand_settings
    if expected_badge:
        assert rendered_brands[1]["hide_platform_badge"] is True
        assert {
            key: value
            for key, value in rendered_brands[1].items()
            if key != "hide_platform_badge"
        } == {
            key: value
            for key, value in brand_settings.items()
            if key != "hide_platform_badge"
        }
    else:
        assert len(rendered_brands) == 1
    assert seen_language == [language]
    expected_burns = 1 + int(expected_badge)
    assert seen_style == (
        [subtitle_style] * expected_burns if burn_subtitles else []
    )
