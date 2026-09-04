"""Bounded ClamAV INSTREAM client; only an explicit clean verdict permits release."""

import socket
import struct
import time
from pathlib import Path

from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool

from app.config import settings


class UnsafeUpload(Exception):
    pass


class ScannerUnavailable(Exception):
    pass


def scan_file(path: Path) -> None:
    maximum = settings.max_upload_size_mb * 1024 * 1024
    deadline = time.monotonic() + settings.clamav_timeout_seconds

    def remaining() -> float:
        seconds = deadline - time.monotonic()
        if seconds <= 0:
            raise ScannerUnavailable("Scanner deadline exceeded")
        return seconds

    try:
        with (
            path.open("rb") as source,
            socket.create_connection(
                (settings.clamav_host, settings.clamav_port),
                timeout=remaining(),
            ) as connection,
        ):
            connection.settimeout(remaining())
            connection.sendall(b"zINSTREAM\0")
            total = 0
            while chunk := source.read(1024 * 1024):
                total += len(chunk)
                if total > maximum:
                    raise UnsafeUpload("Upload exceeds scanner size limit")
                connection.settimeout(remaining())
                connection.sendall(struct.pack("!I", len(chunk)) + chunk)
            connection.sendall(struct.pack("!I", 0))
            response = bytearray()
            while b"\0" not in response:
                connection.settimeout(remaining())
                chunk = connection.recv(1024)
                if not chunk or len(response) + len(chunk) > 4096:
                    raise ScannerUnavailable("Incomplete or oversized scanner reply")
                response.extend(chunk)
            verdict = bytes(response).split(b"\0", 1)[0]
            if verdict == b"stream: OK":
                return
            if verdict.startswith(b"stream: ") and verdict.endswith(b" FOUND"):
                raise UnsafeUpload("Upload rejected by malware scanner")
            raise ScannerUnavailable("Scanner did not return a clean verdict")
    except (OSError, TimeoutError) as exc:
        raise ScannerUnavailable("Scanner unavailable") from exc


async def require_clean_upload(path: Path) -> None:
    # Production cannot disable scanning through the development opt-out flag.
    if not settings.upload_scanner_enabled and settings.app_env.lower() in {
        "development",
        "test",
        "testing",
    }:
        return
    try:
        await run_in_threadpool(scan_file, path)
    except UnsafeUpload as exc:
        raise HTTPException(
            status_code=422, detail="Upload failed safety checks"
        ) from exc
    except ScannerUnavailable as exc:
        raise HTTPException(
            status_code=503, detail="Upload safety scanning is temporarily unavailable"
        ) from exc
