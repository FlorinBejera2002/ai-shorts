"""Run real video processing in a disposable worker-local workspace.

Examples (inside the production worker, with its normal environment):
    python /tmp/verify_video_processing.py --fixture /tmp/speech.wav
    python /tmp/verify_video_processing.py --url https://www.youtube.com/watch?v=ID

The fixture runs real transcription, Gemini selection, crop and captions. URL
checks download and copy by default; add --process for the full pipeline. No
database, queue, account or persistent media operations are performed. A normal
application/model cache may still be populated by the underlying ML libraries.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import signal
import subprocess
import sys
import tempfile
import threading
import time
import traceback
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


class VerificationError(Exception):
    """A diagnostic which contains no remote response, transcript or secret."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise VerificationError(message)


def run_command(command: list[str], timeout: int = 120) -> str:
    result = subprocess.run(
        command, capture_output=True, text=True, timeout=timeout, check=False
    )
    require(result.returncode == 0, f"{Path(command[0]).name} verification failed")
    return result.stdout


def check_media(path: Path, *, portrait: bool = False) -> dict:
    require(path.is_file() and path.stat().st_size > 0, "Media file is missing or empty")
    probe = json.loads(run_command([
        "ffprobe", "-v", "error", "-show_streams", "-show_format",
        "-of", "json", str(path),
    ]))
    video = next((s for s in probe["streams"] if s["codec_type"] == "video"), None)
    audio = next((s for s in probe["streams"] if s["codec_type"] == "audio"), None)
    require(video is not None, "Media has no video stream")
    require(audio is not None, "Media has no audio stream")
    width, height = video["width"], video["height"]
    if portrait:
        require(height > width and abs(width / height - 9 / 16) < 0.02,
                "Rendered clip is not portrait 9:16")
    duration = float(probe["format"]["duration"])
    require(duration > 0, "Media duration is zero")
    run_command([
        "ffmpeg", "-nostdin", "-v", "error", "-xerror", "-i", str(path),
        "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-",
    ], timeout=180)
    return {
        "duration_seconds": round(duration, 3), "width": width, "height": height,
        "video_codec": video["codec_name"], "audio_codec": audio["codec_name"],
        "bytes": path.stat().st_size, "full_decode": True,
    }


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def owned_file(value: str | None, workspace: Path) -> Path:
    require(bool(value), "Expected output path is missing")
    path = Path(value).resolve()
    require(path.is_relative_to(workspace.resolve()), "Output escaped the temporary workspace")
    require(path.is_file() and path.stat().st_size > 0, "Expected output is missing or empty")
    return path


def verify_local_copy(source: Path, workspace: Path) -> dict:
    from app.services.video_downloader import copy_local_video

    before = digest(source)
    result = copy_local_video(str(source), workspace / "local-upload-copy")
    copied = owned_file(result["local_path"], workspace)
    require(copied != source.resolve(), "Local upload did not create an independent copy")
    require(digest(copied) == before and digest(source) == before,
            "Local upload copy changed the source bytes")
    return {"independent_copy": True, "bytes_match": True, "source_preserved": True}


class QuietHTTPHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:
        pass


@contextmanager
def serve_fixture(directory: Path):
    handler = partial(QuietHTTPHandler, directory=str(directory))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/synthetic.mp4"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def create_fixture(speech: Path, workspace: Path) -> Path:
    require(speech.is_file(), "Synthetic speech fixture does not exist")
    fixture_dir = workspace / "fixture"
    fixture_dir.mkdir()
    output = fixture_dir / "synthetic.mp4"
    run_command([
        "ffmpeg", "-nostdin", "-y", "-v", "error",
        "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=5",
        "-stream_loop", "-1", "-i", str(speech), "-t", "22",
        "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264",
        "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac",
        "-b:a", "64k", "-movflags", "+faststart", str(output),
    ])
    return output


def verify_pipeline(source: str, workspace: Path, progress_path: Path) -> dict:
    from app.config import settings
    from app.services.processing_pipeline import process_video_source

    require(bool(settings.gemini_api_key), "Gemini is not configured for full verification")
    stages = []

    def progress(stage: str, percent: int, message: str) -> None:
        if not stages or stages[-1] != stage:
            stages.append(stage)
        progress_path.write_text(json.dumps({"stage": stage, "percent": percent}))

    result = process_video_source(
        source=source, source_type="url", output_root=str(workspace / "media"),
        requested_clips=1, aspect_ratio="9:16", burn_subtitles=True,
        smart_crop=True, on_progress=progress, storage_namespace="processing-smoke",
    )
    require(not result["errors"], "Pipeline reported a rendering error")
    transcript = result["transcript"]
    require(bool(transcript["text"].strip()), "Whisper returned an empty transcript")
    require(bool(transcript["words"]), "Whisper returned no word timestamps")
    require(len(result["clips"]) == 1, "Pipeline did not produce exactly one clip")
    clip = result["clips"][0]
    metadata = clip["metadata"]
    require(metadata.get("source") == "gemini", "Gemini failed; fallback highlights were used")
    final_media = owned_file(clip.get("subtitled_file_path"), workspace)
    rendered = check_media(final_media, portrait=True)
    subtitle = owned_file(metadata.get("srt_path"), workspace)
    require("-->" in subtitle.read_text(encoding="utf-8"), "Subtitle file has no timed captions")
    thumbnail = owned_file(clip.get("thumbnail_path"), workspace)
    run_command(["ffmpeg", "-nostdin", "-v", "error", "-xerror", "-i",
                 str(thumbnail), "-f", "null", "-"])
    stored_clip = owned_file(metadata.get("storage_path"), workspace)
    owned_file(metadata.get("thumbnail_storage_path"), workspace)
    owned_file(result.get("source_storage_path"), workspace)
    require(digest(final_media) == digest(stored_clip), "Stored clip bytes do not match")
    source_file = owned_file(result["source"]["local_path"], workspace)
    return {
        "stages": stages, "source": check_media(source_file),
        "local_upload": verify_local_copy(source_file, workspace),
        "transcription": {"word_count": len(transcript["words"]),
                          "segment_count": len(transcript["segments"])},
        "highlight_provider": "gemini", "clip_count": 1, "clip": rendered,
        "subtitles": True, "thumbnail": True, "stored_outputs_verified": True,
    }


def worker(args: argparse.Namespace, workspace: Path) -> int:
    # Do this before importing any application module or creating storage.
    os.environ["LOCAL_MEDIA_ROOT"] = str(workspace / "media")
    os.environ["STORAGE_TYPE"] = "local"
    for candidate in (Path(__file__).resolve().parents[1], Path.cwd(), Path("/app")):
        if (candidate / "app" / "config.py").is_file():
            sys.path.insert(0, str(candidate))
            break
    report = {"ok": False, "mode": "fixture" if args.fixture else "url"}
    stage = "initialize"
    progress_path = workspace / "progress.json"
    try:
        from app.config import settings
        from app.services.video_downloader import download_video

        settings.local_media_root = str(workspace / "media")
        settings.storage_type = "local"
        if args.fixture:
            stage = "create_fixture"
            fixture = create_fixture(Path(args.fixture), workspace)
            stage = "pipeline"
            with serve_fixture(fixture.parent) as url:
                report.update(verify_pipeline(url, workspace, progress_path))
        elif args.process:
            stage = "pipeline"
            report.update(verify_pipeline(args.url, workspace, progress_path))
        else:
            stage = "download"
            downloaded = download_video(args.url, workspace / "download")
            source = owned_file(downloaded["local_path"], workspace)
            stage = "validate_download"
            report["source"] = check_media(source)
            report["source_type"] = downloaded["type"]
            report["local_upload"] = verify_local_copy(source, workspace)
        report["ok"] = True
    except Exception as exc:
        # Never print arbitrary library errors: they can contain transcripts,
        # signed URLs, cookies or API credentials. The last stage is sufficient
        # to locate a failure for targeted application diagnostics.
        report["stage"] = stage
        report["error_type"] = type(exc).__name__
        report["traceback_frames"] = [
            f"{Path(frame.filename).name}:{frame.name}:{frame.lineno}"
            for frame in traceback.extract_tb(exc.__traceback__)[-8:]
        ]
        if isinstance(exc, VerificationError):
            report["error"] = str(exc)
        if progress_path.is_file():
            report["progress"] = json.loads(progress_path.read_text())
    (workspace / "result.json").write_text(json.dumps(report), encoding="utf-8")
    return 0 if report["ok"] else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--fixture", help="Existing synthetic speech WAV (full pipeline)")
    source.add_argument("--url", help="Public HTTPS video URL (download and copy by default)")
    parser.add_argument("--process", action="store_true", help="Run full processing for --url")
    parser.add_argument("--timeout", type=int, default=900, help="Overall deadline in seconds")
    parser.add_argument("--worker-workspace", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.timeout < 1:
        parser.error("--timeout must be positive")
    if args.url:
        parsed = urlparse(args.url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            parser.error("--url must be HTTPS without embedded credentials")
    if args.worker_workspace:
        return worker(args, Path(args.worker_workspace))
    if os.name != "posix":
        parser.error("Run this verifier inside the Linux application worker")

    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="sneepcut-processing-smoke-") as temporary:
        workspace = Path(temporary)
        command = [sys.executable, str(Path(__file__).resolve()), *sys.argv[1:],
                   "--worker-workspace", str(workspace)]
        # Capture all third-party output privately; only our explicit report is
        # returned. The directory and these logs are removed when this run ends.
        with (workspace / "runtime.log").open("w") as log:
            process = subprocess.Popen(command, stdout=log, stderr=log, start_new_session=True)
            try:
                process.wait(timeout=args.timeout)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait(timeout=10)
                report = {"ok": False, "error": "Verification timed out"}
                progress = workspace / "progress.json"
                if progress.is_file():
                    report["progress"] = json.loads(progress.read_text())
            except BaseException:
                # An interrupted verification must not leave FFmpeg or ML work
                # running against a workspace that is about to be removed.
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait(timeout=10)
                raise
            else:
                result = workspace / "result.json"
                report = json.loads(result.read_text()) if result.is_file() else {
                    "ok": False, "error": "Verification subprocess exited without a report",
                    "exit_code": process.returncode,
                }
        report["elapsed_seconds"] = round(time.monotonic() - started, 2)
        report["persistent_media_modified"] = False
        print(json.dumps(report, indent=2), flush=True)
        return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
