from __future__ import annotations

import json
import os
import shutil
import signal
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from threading import Event, Thread

import pytest


def test_worker_verification_waits_for_provider_to_listen(tmp_path):
    if os.name != "posix" or not shutil.which("bash") or not shutil.which("curl"):
        pytest.skip("Production shell regression requires POSIX, bash, and curl")

    requests = []

    class PingHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            requests.append(self.path)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"pong")

        def log_message(self, *_args):
            pass

    # Reserve a port without listening: the initial real curl connection is refused.
    server = HTTPServer(("127.0.0.1", 0), PingHandler, bind_and_activate=False)
    server.server_bind()
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    docker = bin_dir / "docker"
    docker.write_text(
        f"#!{sys.executable}\n"
        "import json, os, subprocess, sys\n"
        "args = sys.argv[1:]\n"
        "with open(os.environ['TEST_DOCKER_LOG'], 'a') as log:\n"
        "    log.write(json.dumps(args) + '\\n')\n"
        "if 'exec' in args:\n"
        "    command = args[args.index('exec') + 3:]\n"
        "    if command[0] == 'curl':\n"
        "        command = [os.environ['TEST_PROVIDER_URL'] "
        "if arg == 'http://youtube-pot-provider:4416/ping' else arg for arg in command]\n"
        "        sys.exit(subprocess.call(command))\n",
        encoding="utf-8",
    )
    docker.chmod(0o755)
    environment_file = tmp_path / ".env.test"
    environment_file.touch()
    docker_log = tmp_path / "docker.jsonl"
    script = Path(__file__).resolve().parents[2] / "scripts" / "production-compose.sh"
    process = subprocess.Popen(
        ["bash", str(script), "verify", "workers"],
        env={
            **os.environ,
            "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
            "PRODUCTION_ENV_FILE": str(environment_file),
            "TEST_DOCKER_LOG": str(docker_log),
            "TEST_PROVIDER_URL": f"http://127.0.0.1:{server.server_port}/ping",
            "NO_PROXY": "127.0.0.1",
        },
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    refused = Event()
    errors = []

    def collect_errors():
        for line in process.stderr:
            errors.append(line)
            if "curl: (7)" in line:
                refused.set()

    reader = Thread(target=collect_errors, daemon=True)
    reader.start()
    server_thread = None
    try:
        assert refused.wait(timeout=5), "The initial connection was not refused: " + "".join(errors)
        server.server_activate()
        server_thread = Thread(target=server.serve_forever, daemon=True)
        server_thread.start()
        assert process.wait(timeout=10) == 0, "".join(errors)
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=5)
        if server_thread:
            server.shutdown()
            server_thread.join(timeout=5)
        server.server_close()
        reader.join(timeout=5)
        process.stderr.close()

    assert requests == ["/ping"]
    commands = [json.loads(line) for line in docker_log.read_text().splitlines()]
    assert any("celery" in command for command in commands)
