#!/usr/bin/env python3
"""Verify Go auth with current Alembic SQL and disposable PostgreSQL/Redis.

Requires Docker, Go, postgres:16-alpine, redis:7-alpine and sneepcut-api (Python
migration dependencies). No persistent database/media volumes or .env are used.
"""

import http.cookiejar
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT.parent / "backend"


def run(*args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)


def main():
    name = "sneepcut-go-auth-test-" + uuid.uuid4().hex[:12]
    started = False
    redis_started = False
    api = None
    try:
        with tempfile.TemporaryDirectory(prefix="sneepcut-go-auth-") as temp:
            temp = Path(temp)
            schema = temp / "schema.sql"
            with schema.open("w") as out:
                run(
                    "docker", "run", "--rm", "--pull=never", "--network=none",
                    "--read-only", "--entrypoint=python", "-w", "/app",
                    "-e", "APP_ENV=test", "-e", "PYTHONDONTWRITEBYTECODE=1",
                    "-e", "DATABASE_URL=postgresql://test@127.0.0.1/sneepcut_integration_test",
                    "-v", f"{BACKEND / 'alembic'}:/app/alembic:ro",
                    "-v", f"{BACKEND / 'alembic.ini'}:/app/alembic.ini:ro",
                    "-v", f"{BACKEND / 'app'}:/app/app:ro",
                    os.environ.get("SNEEPCUT_MIGRATION_IMAGE", "sneepcut-api"),
                    "-m", "alembic", "upgrade", "head", "--sql", stdout=out,
                )
            run(
                "docker", "run", "--rm", "--pull=never", "-d", "--name", name,
                "--tmpfs", "/var/lib/postgresql/data",
                "-e", "POSTGRES_USER=test", "-e", "POSTGRES_PASSWORD=local-test-only",
                "-e", "POSTGRES_DB=sneepcut_integration_test",
                "-p", "127.0.0.1::5432", "postgres:16-alpine", stdout=subprocess.DEVNULL,
            )
            started = True
            address = run("docker", "port", name, "5432/tcp", capture_output=True).stdout.strip()
            run(
                "docker", "run", "--rm", "--pull=never", "-d", "--name", name + "-redis",
                "-p", "127.0.0.1::6379", "redis:7-alpine", "redis-server",
                "--save", "", "--appendonly", "no", stdout=subprocess.DEVNULL,
            )
            redis_started = True
            redis_address = run("docker", "port", name + "-redis", "6379/tcp", capture_output=True).stdout.strip()
            deadline = time.monotonic() + 30
            while True:
                ready = subprocess.run(
                    ["docker", "exec", name, "pg_isready", "-U", "test", "-d", "sneepcut_integration_test"],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
                if ready.returncode == 0:
                    break
                if time.monotonic() >= deadline:
                    raise RuntimeError("temporary PostgreSQL did not start")
                time.sleep(0.2)

            dsn = f"postgresql://test:local-test-only@{address}/sneepcut_integration_test?sslmode=disable"
            env = os.environ.copy()
            env.update({
                "GOCACHE": str(ROOT.parent / ".cache/go-build"),
                "SNEEPCUT_TEST_DATABASE_URL": dsn,
                "SNEEPCUT_TEST_SCHEMA_SQL": str(schema),
            })
            run("go", "test", "-race", "./...", cwd=ROOT, env=env)
            run("go", "vet", "./...", cwd=ROOT, env=env)
            # Public here belongs only to this temporary container. The Go
            # repository tests above create/drop their own random schema.
            with schema.open() as source:
                run("docker", "exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "test", "-d", "sneepcut_integration_test", stdin=source, stdout=subprocess.DEVNULL)
            seed = """INSERT INTO users (id,email,provider,password_hash,credits,plan) VALUES
                ('f53114bc-48c7-4b51-af21-99f0efcb5e30','auth-test@example.invalid','credentials',
                '$2b$12$tVLZOBSvFOx2sp4u1B6nT.0lG9HQ0XjxYkW72YPuUc1cQTsKGvCY2',100,'free');"""
            run("docker", "exec", "-i", name, "psql", "-v", "ON_ERROR_STOP=1", "-U", "test", "-d", "sneepcut_integration_test", input=seed, stdout=subprocess.DEVNULL)
            executable = temp / "api"
            run("go", "build", "-o", str(executable), "./cmd/api", cwd=ROOT, env=env)
            with socket.socket() as listener:
                listener.bind(("127.0.0.1", 0))
                port = listener.getsockname()[1]
            # The executable receives only fixture settings. Inherited provider,
            # database, media or Redis variables must not select user resources.
            api_env = {
                "GO_AUTH_ENABLED": "true", "APP_ENV": "test", "DATABASE_URL": dsn,
                "JWT_SECRET": "local-auth-test-secret-never-use-outside-tests",
                "JWT_ISSUER": "sneepcut-test", "JWT_AUDIENCE": "sneepcut-test-web",
                "CORS_ORIGINS": "http://localhost:3000", "LISTEN_ADDR": f"127.0.0.1:{port}",
                "REDIS_URL": f"redis://{redis_address}/0", "LOCAL_MEDIA_ROOT": str(temp / "media"),
                "INTERNAL_API_KEY": "local-auth-test-media-secret-never-use-outside-tests",
                "UPLOAD_TOKEN_SECRET": "local-auth-test-upload-secret-never-use-outside-tests",
                "UPLOAD_SCANNER_ENABLED": "false", "APP_URL": "http://localhost:3000",
            }
            with (temp / "api.log").open("w+") as log:
                api = subprocess.Popen([str(executable)], cwd=ROOT, env=api_env, stdout=log, stderr=log)
                base = f"http://127.0.0.1:{port}"
                deadline = time.monotonic() + 10
                while True:
                    try:
                        with urllib.request.urlopen(base + "/api/ready", timeout=3) as response:
                            assert response.status == 200
                        break
                    except OSError:
                        if api.poll() is not None or time.monotonic() > deadline:
                            raise RuntimeError("Go auth executable did not start")
                        time.sleep(0.1)
                jar = http.cookiejar.CookieJar()
                client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

                def request(path, body=None, token=None):
                    headers = {"Origin": "http://localhost:3000", "Content-Type": "application/json"}
                    if token:
                        headers["Authorization"] = "Bearer " + token
                    data = None if body is None else json.dumps(body).encode()
                    with client.open(urllib.request.Request(base + path, data=data, headers=headers), timeout=5) as response:
                        return json.load(response)

                signed_in = request("/v1/auth/login", {"email": "auth-test@example.invalid", "password": "dummy-password-not-a-user"})
                assert len(jar) == 1 and signed_in["access_token"]
                current = request("/v1/auth/me", token=signed_in["access_token"])
                assert current["user"]["id"] == signed_in["user"]["id"]
                refreshed = request("/v1/auth/refresh", {})
                assert refreshed["authenticated_at"] == signed_in["authenticated_at"]
                request("/v1/auth/logout", {})
                assert len(jar) == 0
                for path, body, token in [("/v1/auth/refresh", {}, None), ("/v1/auth/me", None, refreshed["access_token"])]:
                    try:
                        request(path, body, token)
                        raise AssertionError("revoked session accepted")
                    except urllib.error.HTTPError as error:
                        assert error.code == 401
                api.terminate()
                assert api.wait(timeout=10) == 0
                api = None
                log.seek(0)
                output = log.read()
                assert api_env["JWT_SECRET"] not in output and signed_in["access_token"] not in output
                print("PASS: current Alembic schema, PostgreSQL auth lifecycle, executable login/me/refresh/logout/revocation and clean shutdown", flush=True)
    finally:
        if api is not None:
            api.terminate()
            try:
                api.wait(timeout=10)
            except subprocess.TimeoutExpired:
                api.kill()
                api.wait()
        if started:
            run("docker", "stop", "--time", "5", name, stdout=subprocess.DEVNULL)
        if redis_started:
            run("docker", "stop", "--time", "5", name + "-redis", stdout=subprocess.DEVNULL)
        print("Temporary PostgreSQL/Redis containers removed; no persistent data used", flush=True)


if __name__ == "__main__":
    main()
