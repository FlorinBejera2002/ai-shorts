from __future__ import annotations

import os
import stat
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

import pytest
import yt_dlp

from app.services import video_downloader

YOUTUBE_URL = "https://www.youtube.com/watch?v=video-id"
COOKIE_CONTENT = (
    "# Netscape HTTP Cookie File\n"
    ".youtube.com\tTRUE\t/\tTRUE\t2147483647\tSID\tsynthetic-cookie\n"
)


@pytest.fixture
def cookie_source(tmp_path):
    source = tmp_path / "secret-cookies.txt"
    source.write_text(COOKIE_CONTENT, encoding="utf-8")
    source.chmod(0o400)
    yield source
    source.chmod(0o600)


@pytest.fixture
def private_temp(monkeypatch, tmp_path):
    directory = tmp_path / "private-temp"
    directory.mkdir()
    monkeypatch.setattr(video_downloader.tempfile, "tempdir", str(directory))
    return directory


@pytest.fixture
def downloads(monkeypatch, tmp_path):
    """Stub network/media work while keeping yt-dlp's real cookie load/save."""
    records = []

    def extract_info(ydl, _url, download):
        assert download is True
        cookie_file = ydl.params.get("cookiefile")
        record = {"options": ydl.params.copy()}
        if cookie_file:
            cookie_file = Path(cookie_file)
            record.update(
                cookie_path=cookie_file,
                cookie_content=cookie_file.read_text(encoding="utf-8"),
                cookie_mode=stat.S_IMODE(cookie_file.stat().st_mode),
                directory_mode=stat.S_IMODE(cookie_file.parent.stat().st_mode),
            )
        records.append(record)
        return {"id": "video-id", "title": "Video", "duration": 30, "ext": "mp4"}

    monkeypatch.setattr(yt_dlp.YoutubeDL, "extract_info", extract_info)
    monkeypatch.setattr(
        yt_dlp.YoutubeDL, "prepare_filename", lambda _ydl, _info: str(tmp_path / "video.mp4")
    )
    monkeypatch.setattr(video_downloader, "validate_video_file", lambda _path: None)
    monkeypatch.setattr(video_downloader.settings, "youtube_cookies_path", None)
    monkeypatch.setattr(video_downloader.settings, "youtube_pot_provider_url", None)
    return records


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        (YOUTUBE_URL, True),
        ("https://youtu.be/video-id", True),
        ("https://m.youtube.com:443/watch?v=video-id", True),
        ("https://WWW.YOUTUBE.COM./watch?v=video-id", True),
        ("https://youtube.com.example.org/video", False),
        ("https://notyoutube.com/video", False),
        ("https://youtu.be.example.org/video", False),
        ("https://youtube.com@example.org/video", False),
        ("https://example.org/youtube.com/video", False),
        ("file:///youtube.com/video.mp4", False),
    ],
)
def test_is_youtube_url_matches_the_hostname(url, expected):
    assert video_downloader.is_youtube_url(url) is expected


def test_youtube_download_uses_private_writable_cookies_and_pot_provider(
    monkeypatch, tmp_path, cookie_source, private_temp, downloads
):
    source_mode = cookie_source.stat().st_mode
    saved_cookies = []
    original_save = yt_dlp.YoutubeDL.save_cookies

    def save_cookies(ydl):
        original_save(ydl)
        saved_cookies.append(Path(ydl.params["cookiefile"]).read_text(encoding="utf-8"))

    monkeypatch.setattr(yt_dlp.YoutubeDL, "save_cookies", save_cookies)
    monkeypatch.setattr(
        video_downloader.settings,
        "youtube_pot_provider_url",
        "http://youtube-pot-provider:4416",
    )
    output_dir = tmp_path / "media"

    result = video_downloader.download_video(
        YOUTUBE_URL, output_dir, cookies_path=str(cookie_source)
    )

    record = downloads[0]
    cookie_path = record["cookie_path"]
    assert cookie_path != cookie_source
    assert private_temp in cookie_path.parents
    assert output_dir not in cookie_path.parents
    assert record["cookie_content"] == COOKIE_CONTENT
    if os.name == "posix":
        assert record["cookie_mode"] == 0o600
        assert record["directory_mode"] == 0o700
    assert len(saved_cookies) == 1
    assert "synthetic-cookie" in saved_cookies[0]
    assert cookie_source.read_text(encoding="utf-8") == COOKIE_CONTENT
    assert cookie_source.stat().st_mode == source_mode
    assert not cookie_path.exists()
    assert not cookie_path.parent.exists()
    assert list(output_dir.iterdir()) == []
    assert record["options"]["extractor_args"] == {
        "youtube": {"player_client": ["mweb"]},
        "youtubepot-bgutilhttp": {"base_url": ["http://youtube-pot-provider:4416"]},
    }
    assert result["type"] == "youtube"


@pytest.mark.parametrize("failure_stage", ["initialization", "extraction", "close"])
def test_private_cookies_are_removed_when_downloader_fails(
    monkeypatch, tmp_path, cookie_source, private_temp, downloads, failure_stage
):
    method_name = {
        "initialization": "__init__", "extraction": "extract_info", "close": "close"
    }[failure_stage]
    original = getattr(yt_dlp.YoutubeDL, method_name)

    def fail(ydl, *args, **kwargs):
        original(ydl, *args, **kwargs)
        raise RuntimeError(f"{failure_stage} failed")

    monkeypatch.setattr(yt_dlp.YoutubeDL, method_name, fail)

    with pytest.raises(RuntimeError, match=f"{failure_stage} failed"):
        video_downloader.download_video(YOUTUBE_URL, tmp_path, str(cookie_source))

    assert list(private_temp.iterdir()) == []
    assert cookie_source.read_text(encoding="utf-8") == COOKIE_CONTENT


def test_concurrent_downloads_have_independent_cookie_files(
    monkeypatch, tmp_path, cookie_source, private_temp, downloads
):
    barrier = Barrier(2, timeout=10)
    original_extract = yt_dlp.YoutubeDL.extract_info

    def extract_info(ydl, url, download):
        result = original_extract(ydl, url, download)
        cookie_file = Path(ydl.params["cookiefile"])
        value = url.rsplit("=", 1)[-1]
        cookie_file.write_text(COOKIE_CONTENT.replace("synthetic-cookie", value))
        barrier.wait()
        assert cookie_file.read_text().endswith(f"\t{value}\n")
        return result

    monkeypatch.setattr(yt_dlp.YoutubeDL, "extract_info", extract_info)
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(
            lambda number: video_downloader.download_video(
                f"https://youtube.com/watch?v=video-{number}", tmp_path, str(cookie_source)
            ),
            range(2),
        ))

    assert len(results) == 2
    assert downloads[0]["cookie_path"] != downloads[1]["cookie_path"]
    assert all(record["cookie_content"] == COOKIE_CONTENT for record in downloads)
    assert list(private_temp.iterdir()) == []
    assert cookie_source.read_text(encoding="utf-8") == COOKIE_CONTENT


@pytest.mark.parametrize("configuration", ["unset", "missing", "present"])
def test_optional_configured_cookies(
    monkeypatch, tmp_path, cookie_source, private_temp, downloads, caplog, configuration
):
    configured_path = {
        "unset": None,
        "missing": str(tmp_path / "missing-secret.txt"),
        "present": str(cookie_source),
    }[configuration]
    monkeypatch.setattr(video_downloader.settings, "youtube_cookies_path", configured_path)

    video_downloader.download_video(YOUTUBE_URL, tmp_path)

    assert bool(downloads[0]["options"]["cookiefile"]) is (configuration == "present")
    assert list(private_temp.iterdir()) == []
    if configuration == "missing":
        assert "Configured YouTube cookies file is missing" in caplog.text
        assert not Path(configured_path).exists()


def test_explicit_missing_cookies_fail_without_leaving_temporary_files(
    tmp_path, private_temp, downloads
):
    missing_path = tmp_path / "missing-secret.txt"

    with pytest.raises(FileNotFoundError):
        video_downloader.download_video(YOUTUBE_URL, tmp_path, str(missing_path))

    assert downloads == []
    assert not missing_path.exists()
    assert list(private_temp.iterdir()) == []


@pytest.mark.parametrize("url", [
    "https://example.org/video.mp4",
    "https://youtube.com.example.org/video.mp4",
    "https://youtube.com@example.org/video.mp4",
])
def test_non_youtube_download_does_not_use_youtube_cookies_or_clients(
    monkeypatch, tmp_path, private_temp, downloads, url
):
    missing_path = str(tmp_path / "missing-secret.txt")
    monkeypatch.setattr(video_downloader.settings, "youtube_cookies_path", missing_path)

    result = video_downloader.download_video(url, tmp_path, cookies_path=missing_path)

    assert downloads[0]["options"]["extractor_args"] is None
    assert downloads[0]["options"]["cookiefile"] is None
    assert list(private_temp.iterdir()) == []
    assert result["type"] == "url"


@pytest.mark.parametrize(("url", "message", "requires_authentication"), [
    (YOUTUBE_URL, "Sign in to confirm you're not a bot", True),
    (YOUTUBE_URL, "Sign in to confirm you are not a robot", True),
    (YOUTUBE_URL, "HTTP Error 403: Forbidden", False),
    ("https://example.org/video.mp4", "Sign in to confirm you're not a bot", False),
])
def test_youtube_authentication_error_is_actionable_and_preserves_other_errors(
    monkeypatch, tmp_path, cookie_source, private_temp, downloads,
    url, message, requires_authentication,
):
    original_error = yt_dlp.utils.DownloadError(message)

    def fail(_ydl, _url, download):
        raise original_error

    monkeypatch.setattr(yt_dlp.YoutubeDL, "extract_info", fail)
    expected_error = RuntimeError if requires_authentication else yt_dlp.utils.DownloadError

    with pytest.raises(expected_error) as raised:
        video_downloader.download_video(url, tmp_path, str(cookie_source))

    if requires_authentication:
        assert "Please upload the video file instead" in str(raised.value)
        assert raised.value.__cause__ is original_error
    else:
        assert raised.value is original_error
    assert list(private_temp.iterdir()) == []
    assert cookie_source.read_text(encoding="utf-8") == COOKIE_CONTENT
