from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any


class FFmpegError(RuntimeError):
    pass


def run_ffmpeg(cmd: list[str], timeout: int = 900) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        stderr = result.stderr.strip() or "unknown ffmpeg error"
        raise FFmpegError(stderr)
    return result


def probe_video(path: str | Path) -> dict[str, Any]:
    video_path = Path(path)
    if not video_path.exists():
        raise FileNotFoundError(f"video file not found: {video_path}")
    cmd = [
        "ffprobe",
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(video_path),
    ]
    result = run_ffmpeg(cmd, timeout=60)
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise FFmpegError(f"invalid ffprobe JSON for {video_path}") from exc


def get_video_duration(path: str | Path) -> float:
    probe = probe_video(path)
    duration = probe.get("format", {}).get("duration")
    if duration is None:
        raise FFmpegError(f"ffprobe did not return duration for {path}")
    return float(duration)


def get_video_resolution(path: str | Path) -> str | None:
    probe = probe_video(path)
    for stream in probe.get("streams", []):
        if stream.get("codec_type") == "video":
            width = stream.get("width")
            height = stream.get("height")
            if width and height:
                return f"{width}x{height}"
    return None


def has_audio_stream(path: str | Path) -> bool:
    probe = probe_video(path)
    return any(stream.get("codec_type") == "audio" for stream in probe.get("streams", []))


def validate_video_file(path: str | Path) -> None:
    probe = probe_video(path)
    has_video = any(stream.get("codec_type") == "video" for stream in probe.get("streams", []))
    if not has_video:
        raise FFmpegError(f"file has no video stream: {path}")
    duration = probe.get("format", {}).get("duration")
    if duration is None or float(duration) <= 0:
        raise FFmpegError(f"file has invalid duration: {path}")
