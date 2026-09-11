from __future__ import annotations

import sys
from types import SimpleNamespace

from app.services import video_downloader


def test_youtube_download_uses_mweb_cookies_and_pot_provider(
    monkeypatch, tmp_path
) -> None:
    captured_options: dict = {}

    class FakeYoutubeDL:
        def __init__(self, options: dict) -> None:
            captured_options.update(options)

        def __enter__(self):
            return self

        def __exit__(self, *_args) -> None:
            return None

        def extract_info(self, _url: str, download: bool) -> dict:
            assert download is True
            return {"id": "video-id", "title": "Video", "duration": 30, "ext": "mp4"}

        def prepare_filename(self, _info: dict) -> str:
            return str(tmp_path / "video.mp4")

    monkeypatch.setitem(sys.modules, "yt_dlp", SimpleNamespace(YoutubeDL=FakeYoutubeDL))
    monkeypatch.setattr(video_downloader, "validate_video_file", lambda _path: None)
    monkeypatch.setattr(
        video_downloader.settings,
        "youtube_pot_provider_url",
        "http://youtube-pot-provider:4416",
    )

    result = video_downloader.download_video(
        "https://www.youtube.com/watch?v=video-id",
        tmp_path,
        cookies_path="/run/secrets/youtube-cookies.txt",
    )

    assert captured_options["cookiefile"] == "/run/secrets/youtube-cookies.txt"
    assert captured_options["extractor_args"] == {
        "youtube": {"player_client": ["mweb"]},
        "youtubepot-bgutilhttp": {
            "base_url": ["http://youtube-pot-provider:4416"]
        },
    }
    assert result["type"] == "youtube"


def test_non_youtube_download_does_not_force_youtube_clients(
    monkeypatch, tmp_path
) -> None:
    captured_options: dict = {}

    class FakeYoutubeDL:
        def __init__(self, options: dict) -> None:
            captured_options.update(options)

        def __enter__(self):
            return self

        def __exit__(self, *_args) -> None:
            return None

        def extract_info(self, _url: str, download: bool) -> dict:
            return {"id": "video-id", "title": "Video", "duration": 30, "ext": "mp4"}

        def prepare_filename(self, _info: dict) -> str:
            return str(tmp_path / "video.mp4")

    monkeypatch.setitem(sys.modules, "yt_dlp", SimpleNamespace(YoutubeDL=FakeYoutubeDL))
    monkeypatch.setattr(video_downloader, "validate_video_file", lambda _path: None)

    video_downloader.download_video("https://example.com/video.mp4", tmp_path)

    assert captured_options["extractor_args"] is None
