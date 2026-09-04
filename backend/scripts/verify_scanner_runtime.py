"""Opt-in local scanner smoke test using the harmless EICAR antivirus fixture.

Run inside a disposable API container sharing the test scanner's network
namespace. Never point this at a production endpoint or user files.
"""

from pathlib import Path
from tempfile import TemporaryDirectory

from app.config import settings
from app.services.upload_scanner import UnsafeUpload, scan_file

settings.clamav_host = "127.0.0.1"
with TemporaryDirectory() as directory:
    path = Path(directory) / "fixture"
    path.write_bytes(b"Harmless clean scanner integration fixture")
    scan_file(path)
    # Standard non-executable test string, not malware.
    path.write_bytes(
        b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
    )
    try:
        scan_file(path)
    except UnsafeUpload:
        print("Real ClamAV: clean fixture accepted; EICAR fixture rejected")
    else:
        raise AssertionError("Scanner accepted EICAR test fixture")
