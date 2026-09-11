from __future__ import annotations

import logging
import shutil
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlparse

from app.config import settings
from app.utils.ffmpeg_utils import get_video_duration, validate_video_file
from app.utils.file_utils import ensure_dir, safe_slug

logger = logging.getLogger(__name__)


def is_url(source: str) -> bool:
    parsed = urlparse(source)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def is_youtube_url(source: str) -> bool:
    if not is_url(source):
        return False
    host = (urlparse(source).hostname or "").lower().rstrip(".")
    return any(
        host == domain or host.endswith(f".{domain}")
        for domain in ("youtube.com", "youtu.be")
    )


@contextmanager
def _writable_download_cookies(cookies_path: str | None) -> Iterator[str | None]:
    if not cookies_path:
        yield None
        return

    # yt-dlp saves its cookie jar on close. Keep the mounted secret read-only,
    # with a private copy per download outside the persistent media directory.
    with tempfile.TemporaryDirectory(prefix="sneepcut-youtube-") as cookie_dir:
        with tempfile.NamedTemporaryFile(
            dir=cookie_dir, suffix=".txt", delete=False
        ) as cookie_file:
            with Path(cookies_path).open("rb") as source:
                shutil.copyfileobj(source, cookie_file)
        yield cookie_file.name


def copy_local_video(source_path: str, output_dir: str | Path) -> dict:
    source = Path(source_path)
    if not source.exists():
        raise FileNotFoundError(f"local video not found: {source}")

    output = ensure_dir(output_dir) / f"{safe_slug(source.stem)}{source.suffix or '.mp4'}"
    if source.resolve() != output.resolve():
        shutil.copy2(source, output)

    validate_video_file(output)
    duration = get_video_duration(output)
    _validate_duration(duration)
    return {
        "type": "local",
        "title": source.stem,
        "duration": duration,
        "local_path": str(output),
        "metadata": {"original_path": str(source)},
    }


def download_video(
    url: str,
    output_dir: str | Path,
    cookies_path: str | None = None,
) -> dict:
    if not is_url(url):
        raise ValueError(f"not a valid URL: {url}")

    try:
        import yt_dlp
    except ImportError as exc:
        raise RuntimeError("yt-dlp is required to download remote videos") from exc

    output_directory = ensure_dir(output_dir)
    output_template = str(output_directory / "%(title).80s-%(id)s.%(ext)s")
    youtube_source = is_youtube_url(url)
    cookie_file = None
    if youtube_source:
        cookie_file = cookies_path or settings.youtube_cookies_path
        if not cookies_path and cookie_file and not Path(cookie_file).exists():
            logger.warning(
                "Configured YouTube cookies file is missing; downloading without cookies"
            )
            cookie_file = None
    extractor_args = None
    if youtube_source:
        extractor_args = {
            "youtube": {"player_client": ["mweb"]},
        }
        if settings.youtube_pot_provider_url:
            extractor_args["youtubepot-bgutilhttp"] = {
                "base_url": [settings.youtube_pot_provider_url]
            }

    ydl_opts = {
        "format": (
            "bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/"
            "bestvideo[vcodec^=avc1]+bestaudio/"
            "best[ext=mp4]/best"
        ),
        "merge_output_format": "mp4",
        "outtmpl": output_template,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 30,
        "retries": 10,
        "fragment_retries": 10,
        "nocheckcertificate": True,
        "cachedir": False,
        "extractor_args": extractor_args,
        "http_headers": {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        },
    }

    with _writable_download_cookies(cookie_file) as writable_cookies:
        ydl_opts["cookiefile"] = writable_cookies
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(url, download=True)
            except yt_dlp.utils.DownloadError as exc:
                message = str(exc).lower()
                if (
                    youtube_source
                    and "sign in to confirm" in message
                    and ("not a bot" in message or "not a robot" in message)
                ):
                    raise RuntimeError(
                        "YouTube requires authentication for this video. "
                        "Please upload the video file instead, or ask the "
                        "administrator to refresh the YouTube connection."
                    ) from exc
                raise
            local_path = Path(ydl.prepare_filename(info))
            if local_path.suffix != ".mp4":
                merged_path = local_path.with_suffix(".mp4")
                if merged_path.exists():
                    local_path = merged_path

    validate_video_file(local_path)
    duration = float(info.get("duration") or get_video_duration(local_path))
    _validate_duration(duration)

    return {
        "type": "youtube" if youtube_source else "url",
        "title": info.get("title") or local_path.stem,
        "duration": duration,
        "local_path": str(local_path),
        "metadata": {
            "uploader": info.get("uploader"),
            "webpage_url": info.get("webpage_url") or url,
            "id": info.get("id"),
            "ext": info.get("ext"),
        },
    }


def _validate_duration(duration: float) -> None:
    max_seconds = settings.max_video_duration_minutes * 60
    if duration > max_seconds:
        raise ValueError(
            f"video duration {duration:.1f}s exceeds max {max_seconds}s"
        )
