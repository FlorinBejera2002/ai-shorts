import asyncio
import socket
import struct
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException

from app.services import upload_scanner as scanner


def run_protocol(tmp_path, monkeypatch, reply):
    payload = b"test media" * 120000
    path = tmp_path / "quarantined.part"
    path.write_bytes(payload)
    with socket.socket() as listener, ThreadPoolExecutor(max_workers=1) as pool:
        listener.bind(("127.0.0.1", 0))
        listener.listen(1)
        listener.settimeout(5)
        monkeypatch.setattr(scanner.settings, "clamav_host", "127.0.0.1")
        monkeypatch.setattr(scanner.settings, "clamav_port", listener.getsockname()[1])

        def serve():
            with listener.accept()[0] as connection:
                connection.settimeout(5)

                def read_exact(size):
                    data = bytearray()
                    while len(data) < size:
                        chunk = connection.recv(size - len(data))
                        assert chunk
                        data.extend(chunk)
                    return bytes(data)

                assert read_exact(10) == b"zINSTREAM\0"
                received = bytearray()
                while size := struct.unpack("!I", read_exact(4))[0]:
                    assert size <= 1024 * 1024
                    received.extend(read_exact(size))
                assert received == payload
                connection.sendall(reply)

        future = pool.submit(serve)
        try:
            scanner.scan_file(path)
        finally:
            future.result(timeout=10)


def test_streams_complete_file_and_accepts_only_clean_reply(tmp_path, monkeypatch):
    run_protocol(tmp_path, monkeypatch, b"stream: OK\0")


@pytest.mark.parametrize(
    "reply",
    [
        b"stream: Eicar-Signature FOUND\0",
        b"stream: Heuristics.Limits.Exceeded.MaxFileSize FOUND\0",
    ],
)
def test_infection_and_scan_limit_are_rejected(tmp_path, monkeypatch, reply):
    with pytest.raises(scanner.UnsafeUpload):
        run_protocol(tmp_path, monkeypatch, reply)


@pytest.mark.parametrize(
    "reply",
    [
        b"INSTREAM size limit exceeded. ERROR\0",
        b"stream: OK",
        b"",
        b"OK\0",
    ],
)
def test_errors_and_truncated_replies_fail_closed(tmp_path, monkeypatch, reply):
    with pytest.raises(scanner.ScannerUnavailable):
        run_protocol(tmp_path, monkeypatch, reply)


def test_production_cannot_disable_scanning(tmp_path, monkeypatch):
    monkeypatch.setattr(scanner.settings, "app_env", "production")
    monkeypatch.setattr(scanner.settings, "upload_scanner_enabled", False)

    def unavailable(_path):
        raise scanner.ScannerUnavailable()

    monkeypatch.setattr(scanner, "scan_file", unavailable)
    with pytest.raises(HTTPException) as error:
        asyncio.run(scanner.require_clean_upload(tmp_path / "file"))
    assert error.value.status_code == 503


def test_development_opt_out_is_explicit(tmp_path, monkeypatch):
    monkeypatch.setattr(scanner.settings, "app_env", "development")
    monkeypatch.setattr(scanner.settings, "upload_scanner_enabled", False)
    asyncio.run(scanner.require_clean_upload(tmp_path / "nonexistent"))
