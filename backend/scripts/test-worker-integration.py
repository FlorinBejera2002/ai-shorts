#!/usr/bin/env python3
"""Run Go -> PostgreSQL outbox -> Redis/Celery -> real FFmpeg integration.

Requires Docker, Go, cached postgres:16-alpine, redis:7-alpine and sneepcut-ml
images. Override the latter with SNEEPCUT_ML_IMAGE. Uses only disposable containers,
an internal Docker network and temporary media; never reads the project .env.
Whisper/Gemini responses are deterministic fixtures, not live provider checks.
"""

import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT.parent / "backend"
DATABASE = "sneepcut_integration_test"


def run(*args, **kwargs):
    return subprocess.run(
        args, check=True, text=True, timeout=kwargs.pop("timeout", 90), **kwargs
    )


def wait_for(message, predicate, timeout=45):
    deadline = time.monotonic() + timeout
    while True:
        value = predicate()
        if value:
            return value
        if time.monotonic() >= deadline:
            raise AssertionError("Timed out: " + message)
        time.sleep(0.2)


class Smoke:
    def __init__(self, temp):
        self.temp = temp
        self.media = temp / "media"
        self.media.mkdir(mode=0o777)
        self.media.chmod(0o777)
        self.name = "sneepcut-worker-test-" + uuid.uuid4().hex[:12]
        self.network = self.name + "-net"
        self.pg = self.name + "-pg"
        self.redis = self.name + "-redis"
        self.worker = self.name + "-worker"
        self.containers = []
        self.network_started = False
        self.api = None
        self.log = None
        self.token = None
        self.image = os.environ.get("SNEEPCUT_ML_IMAGE", "sneepcut-ml")
        self.checks = []
        self.worker_env = {
            "APP_ENV": "test",
            "DATABASE_URL": f"postgresql://test:local-test-only@{self.pg}:5432/{DATABASE}",
            "REDIS_URL": f"redis://{self.redis}:6379/0",
            "STORAGE_TYPE": "local",
            "LOCAL_MEDIA_ROOT": "/media",
            "PYTHONPATH": "/app:/fixtures",
            "PYTHONDONTWRITEBYTECODE": "1",
            "SNEEPCUT_WORKER_SMOKE": "1",
            "GEMINI_API_KEY": "",
            "AWS_ACCESS_KEY_ID": "",
            "AWS_SECRET_ACCESS_KEY": "",
        }

    def check(self, message):
        self.checks.append(message)
        print("PASS: " + message, flush=True)

    def docker_run(self, name, image, *args, extra=(), network=None):
        run(
            "docker",
            "run",
            "--pull=never",
            "-d",
            "--name",
            name,
            "--network",
            network or self.network,
            *extra,
            image,
            *args,
            stdout=subprocess.DEVNULL,
        )
        self.containers.append(name)
        if network:
            run(
                "docker",
                "network",
                "connect",
                self.network,
                name,
                stdout=subprocess.DEVNULL,
            )

    def sql(self, query):
        return run(
            "docker",
            "exec",
            "-i",
            self.pg,
            "psql",
            "-X",
            "-At",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "test",
            "-d",
            DATABASE,
            input=query,
            capture_output=True,
        ).stdout.strip()

    def row(self, query):
        raw = self.sql(f"SELECT row_to_json(r) FROM ({query}) r;")
        return json.loads(raw) if raw else None

    def python(self, code, env=None):
        args = ["docker", "exec"]
        for key, value in (env or {}).items():
            args.extend(["-e", key + "=" + value])
        return run(
            *args, self.worker, "python", "-c", code, capture_output=True
        ).stdout.strip()

    def dispatch(self, outage=False):
        code = "from app.services.job_delivery import recover_and_dispatch; from app.services.edit_delivery import recover_and_dispatch_edits; import json; print(json.dumps({**recover_and_dispatch(), **recover_and_dispatch_edits()}))"
        env = {"CELERY_BROKER_URL": "redis://127.0.0.1:1/0"} if outage else None
        return json.loads(self.python(code, env))

    def repeat_delivery(self, kind, identifier):
        assert kind in {"job", "edit"}
        uuid.UUID(identifier)
        table, key, task = (
            ("job_deliveries", "job_id", "sneepcut.process_job")
            if kind == "job"
            else ("edit_deliveries", "id", None)
        )
        code = f"""
from sqlalchemy import text
from app.database import SyncSessionLocal
from app.workers.celery_app import celery_app
import json
with SyncSessionLocal() as db:
    delivery = db.execute(text("SELECT * FROM {table} WHERE {key}=:id"), {{"id": {identifier!r}}}).mappings().one()
    task = {task!r} or 'sneepcut.' + delivery['kind'] + '_clip'
    result = celery_app.send_task(task, kwargs=delivery['payload']).get(timeout=30)
print(json.dumps(result))
"""
        return json.loads(self.python(code))

    def request(self, path, body=None, method=None, token=None, expected=200):
        headers = {
            "Origin": "http://localhost:3000",
            "Content-Type": "application/json",
        }
        auth = token or self.token
        if auth:
            headers["Authorization"] = "Bearer " + auth
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(
            self.base + path, data=data, method=method, headers=headers
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                result = json.load(response)
                assert response.status == expected, (path, response.status, expected)
                return result
        except urllib.error.HTTPError as error:
            detail = error.read().decode()
            if error.code != expected:
                raise AssertionError(
                    f"{method or 'GET'} {path}: {error.code} {detail}"
                ) from error
            return json.loads(detail)

    def job(self, job_id):
        return self.request("/api/jobs/" + job_id)["job"]

    def wait_job(self, job_id, status):
        def ready():
            job = self.job(job_id)
            if (
                job["status"] in {"completed", "failed", "cancelled"}
                and not job["processing_active"]
            ):
                assert job["status"] == status, job
                return job
            return None

        return wait_for("job " + status, ready, 90)

    def credits(self):
        return int(self.sql(f"SELECT credits FROM users WHERE id='{self.user}';"))

    def create(self, instructions=None):
        body = {
            "source_type": "upload",
            "source_file_path": self.upload["file_path"],
            "num_clips_requested": 1,
            "aspect_ratio": "1:1",
            "language": "en",
            "subtitle_style": "clean",
            "burn_subtitles": True,
            "smart_crop": False,
            "user_instructions": instructions,
        }
        job = self.request("/api/jobs", body, expected=201)
        uuid.UUID(job["id"])
        assert job["status"] == "pending" and job["credits_charged"] == 10, job
        return job["id"]

    def clip(self, job_id):
        records = self.request("/api/clips")["clips"]
        selected = [record for record in records if record["job_id"] == job_id]
        assert len(selected) == 1, selected
        return selected[0]

    def edit(self, clip_id, kind, body):
        accepted = self.request(f"/api/clips/{clip_id}/{kind}", body, expected=202)
        return self.row(
            f"SELECT * FROM edit_deliveries WHERE task_id='{accepted['task_id']}'"
        )

    def wait_edit(self, delivery, state):
        def ready():
            row = self.row(
                f"SELECT e.*,j.active_edit_tasks FROM edit_deliveries e JOIN jobs j ON j.id=e.job_id WHERE e.id='{delivery['id']}'"
            )
            if (
                row["state"] in {"completed", "failed", "expired"}
                and row["active_edit_tasks"] == 0
            ):
                assert row["state"] == state, row
                return row
            return None

        return wait_for("edit " + state, ready, 60)

    def playable(self, clip, duration, square=False):
        key = clip["file_storage_key"]
        path = self.media / key
        assert path.is_file() and path.stat().st_size == clip["file_size"], clip
        output = run(
            "docker",
            "exec",
            self.worker,
            "ffprobe",
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            "/media/" + key,
            capture_output=True,
        ).stdout
        media = json.loads(output)
        video = next(
            stream for stream in media["streams"] if stream["codec_type"] == "video"
        )
        assert video["codec_name"] == "h264", media
        assert any(stream["codec_type"] == "audio" for stream in media["streams"]), (
            media
        )
        assert abs(float(media["format"]["duration"]) - duration) < 0.3, media
        if square:
            assert video["width"] == video["height"], video
        run(
            "docker",
            "exec",
            self.worker,
            "ffmpeg",
            "-v",
            "error",
            "-i",
            "/media/" + key,
            "-f",
            "null",
            "-",
            capture_output=True,
        )
        signed = urllib.parse.urlsplit(clip["file_url"])
        self.request(
            "/api/media/verify?"
            + urllib.parse.urlencode(
                {"path": signed.path, **dict(urllib.parse.parse_qsl(signed.query))}
            )
        )
        return {
            "duration": float(media["format"]["duration"]),
            "width": video["width"],
            "height": video["height"],
        }

    def setup(self):
        # Internal network prevents fixtures from contacting provider endpoints.
        run(
            "docker",
            "network",
            "create",
            "--internal",
            self.network,
            stdout=subprocess.DEVNULL,
        )
        self.network_started = True
        # The stores also need host-loopback publication for the native Go API.
        # The worker joins only the internal network, without Internet egress.
        self.docker_run(
            self.pg,
            "postgres:16-alpine",
            network="bridge",
            extra=(
                "--tmpfs",
                "/var/lib/postgresql/data",
                "-p",
                "127.0.0.1::5432",
                "-e",
                "POSTGRES_USER=test",
                "-e",
                "POSTGRES_PASSWORD=local-test-only",
                "-e",
                "POSTGRES_DB=" + DATABASE,
            ),
        )
        self.docker_run(
            self.redis,
            "redis:7-alpine",
            "redis-server",
            "--save",
            "",
            "--appendonly",
            "no",
            network="bridge",
            extra=("-p", "127.0.0.1::6379", "--tmpfs", "/data"),
        )
        wait_for(
            "PostgreSQL startup",
            lambda: subprocess.run(
                ["docker", "exec", self.pg, "pg_isready", "-U", "test", "-d", DATABASE],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            ).returncode
            == 0,
        )
        wait_for(
            "Redis startup",
            lambda: subprocess.run(
                ["docker", "exec", self.redis, "redis-cli", "ping"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            ).returncode
            == 0,
        )
        pg_address = run(
            "docker", "port", self.pg, "5432/tcp", capture_output=True
        ).stdout.strip()
        redis_address = run(
            "docker", "port", self.redis, "6379/tcp", capture_output=True
        ).stdout.strip()
        schema = run(
            "docker",
            "run",
            "--rm",
            "--pull=never",
            "--network=none",
            "--read-only",
            "-w",
            "/app",
            "-e",
            "APP_ENV=test",
            "-e",
            "PYTHONDONTWRITEBYTECODE=1",
            "-e",
            "DATABASE_URL=postgresql://test@127.0.0.1/" + DATABASE,
            "-v",
            f"{BACKEND / 'app'}:/app/app:ro",
            "-v",
            f"{BACKEND / 'alembic'}:/app/alembic:ro",
            "-v",
            f"{BACKEND / 'alembic.ini'}:/app/alembic.ini:ro",
            "--entrypoint",
            "python",
            self.image,
            "-m",
            "alembic",
            "upgrade",
            "head",
            "--sql",
            capture_output=True,
        ).stdout
        self.sql(schema)
        self.user = str(uuid.uuid4())
        self.sql(f"""INSERT INTO users (id,email,provider,password_hash,credits,plan) VALUES
            ('{self.user}','worker-smoke@example.invalid','credentials',
            '$2b$12$tVLZOBSvFOx2sp4u1B6nT.0lG9HQ0XjxYkW72YPuUc1cQTsKGvCY2',1000,'free');""")
        args = [
            "--user",
            "0:0",
            "-w",
            "/app",
            "-v",
            f"{BACKEND / 'app'}:/app/app:ro",
            "-v",
            f"{BACKEND / 'tests/fixtures'}:/fixtures:ro",
            "-v",
            f"{self.media}:/media",
            "--entrypoint",
            "celery",
        ]
        for key, value in self.worker_env.items():
            args.extend(["-e", key + "=" + value])
        self.docker_run(
            self.worker,
            self.image,
            "-A",
            "worker_smoke:celery_app",
            "worker",
            "--pool=solo",
            "--concurrency=1",
            "--loglevel=INFO",
            "--without-gossip",
            "--without-mingle",
            "--without-heartbeat",
            extra=tuple(args),
        )
        wait_for(
            "Celery ready",
            lambda: "ready."
            in run("docker", "logs", self.worker, capture_output=True).stderr,
        )
        run(
            "docker",
            "exec",
            self.worker,
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=320x180:rate=24",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:sample_rate=44100",
            "-t",
            "12",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-c:a",
            "aac",
            "/media/synthetic.mp4",
            capture_output=True,
        )
        executable = self.temp / "api"
        # Whitelist process variables: inherited real credentials/configuration
        # must never enter this otherwise isolated smoke stack.
        env = {
            key: os.environ[key]
            for key in ("PATH", "HOME", "TMPDIR", "GOPATH", "GOMODCACHE")
            if key in os.environ
        }
        env["GOCACHE"] = str(ROOT.parent / ".cache/go-build")
        run("go", "build", "-o", str(executable), "./cmd/api", cwd=ROOT, env=env)
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        self.base = f"http://127.0.0.1:{port}"
        env.update(
            {
                "APP_ENV": "test",
                "GO_AUTH_ENABLED": "true",
                "LISTEN_ADDR": f"127.0.0.1:{port}",
                "APP_URL": "http://localhost:3000",
                "CORS_ORIGINS": "http://localhost:3000",
                "DATABASE_URL": f"postgresql://test:local-test-only@{pg_address}/{DATABASE}?sslmode=disable",
                "REDIS_URL": f"redis://{redis_address}/0",
                "LOCAL_MEDIA_ROOT": str(self.media),
                "JWT_SECRET": "worker-smoke-jwt-secret-used-only-in-this-test",
                "INTERNAL_API_KEY": "worker-smoke-media-key-used-only-in-this-test",
                "UPLOAD_TOKEN_SECRET": "worker-smoke-upload-key-used-only-in-this-test",
                "UPLOAD_SCANNER_ENABLED": "false",
                "STORAGE_TYPE": "local",
            }
        )
        self.log = (self.temp / "api.log").open("w+")
        self.api = subprocess.Popen(
            [str(executable)], cwd=self.temp, env=env, stdout=self.log, stderr=self.log
        )

        def ready():
            if self.api.poll() is not None:
                raise AssertionError("Go API exited before becoming ready")
            try:
                return self.request("/api/ready")["ready"]
            except (OSError, AssertionError):
                return False

        wait_for("Go API readiness", ready)
        self.token = self.request(
            "/v1/auth/login",
            {
                "email": "worker-smoke@example.invalid",
                "password": "dummy-password-not-a-user",
            },
            expected=201,
        )["access_token"]
        source = (self.media / "synthetic.mp4").read_bytes()
        authorization = self.request(
            "/api/upload/authorize",
            {
                "fileName": "synthetic.mp4",
                "fileSize": len(source),
                "contentType": "video/mp4",
            },
        )
        req = urllib.request.Request(
            self.base + authorization["uploadUrl"],
            data=source,
            method="PUT",
            headers={
                "Authorization": "Bearer " + authorization["token"],
                "Content-Type": "video/mp4",
                "Origin": "http://localhost:3000",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            assert response.status == 201
            self.upload = json.load(response)
        self.check(
            "current Alembic schema, isolated Go login and signed direct video upload"
        )

    def exercise(self):
        initial = self.create()
        assert self.credits() == 990
        lost = self.dispatch(outage=True)
        assert lost["dispatched"] == 0
        delivery = self.row(f"SELECT * FROM job_deliveries WHERE job_id='{initial}'")
        assert (
            delivery["last_error"] == "broker_publish_failed"
            and delivery["execution_count"] == 0
        )
        assert self.job(initial)["status"] == "pending" and self.credits() == 990
        self.sql(
            f"UPDATE job_deliveries SET next_dispatch_at=now()-interval '1 second' WHERE job_id='{initial}';"
        )
        assert self.dispatch()["dispatched"] == 1
        self.wait_job(initial, "completed")
        clip = self.clip(initial)
        assert (
            clip["has_subtitles"]
            and clip["thumbnail_storage_key"]
            and clip["transcript_text"]
        )
        assert (self.media / clip["thumbnail_storage_key"]).is_file()
        rendered = self.playable(clip, 8, square=True)
        assert (
            self.row(
                f"SELECT execution_count FROM job_deliveries WHERE job_id='{initial}'"
            )["execution_count"]
            == 1
        )
        assert self.repeat_delivery("job", initial)["status"] == "ignored"
        assert self.clip(initial)["id"] == clip["id"] and self.credits() == 990
        self.check(
            "broker outage retains one charge; replay dispatches a real Celery job with playable framed/captioned output and duplicate fencing"
        )

        old_key = clip["file_storage_key"]
        trim = self.edit(
            clip["id"], "trim", {"start_time": 1, "end_time": 5, "burn_subtitles": True}
        )
        assert self.dispatch()["edits_dispatched"] == 1
        self.wait_edit(trim, "completed")
        clip = self.clip(initial)
        self.playable(clip, 4, square=True)
        assert (
            clip["file_storage_key"] != old_key and not (self.media / old_key).exists()
        )
        assert self.repeat_delivery("edit", trim["id"])["status"] == "cancelled"
        assert self.clip(initial)["file_storage_key"] == clip["file_storage_key"]
        self.check(
            "Go trim reservation dispatches to Celery, replaces playable media, removes old output and fences duplicate edits"
        )

        old_key = clip["file_storage_key"]
        failed_edit = self.edit(
            clip["id"], "recut", {"segments": [{"start": 20, "end": 24, "order": 0}]}
        )
        assert self.dispatch()["edits_dispatched"] == 1
        self.wait_edit(failed_edit, "failed")
        assert (
            self.clip(initial)["file_storage_key"] == old_key
            and (self.media / old_key).is_file()
        )
        recut = self.edit(
            clip["id"],
            "recut",
            {
                "segments": [
                    {"start": 1, "end": 3, "order": 1},
                    {"start": 6, "end": 8, "order": 0},
                ]
            },
        )
        assert self.dispatch()["edits_dispatched"] == 1
        self.wait_edit(recut, "completed")
        clip = self.clip(initial)
        self.playable(clip, 4)
        assert (
            clip["file_storage_key"] != old_key and not (self.media / old_key).exists()
        )
        self.check(
            "failed FFmpeg recut retains prior media and releases its reservation; retry produces playable reordered source segments"
        )

        expiring = self.edit(clip["id"], "trim", {"start_time": 0, "end_time": 3})
        self.sql(
            f"UPDATE jobs SET edit_deadline=now()-interval '1 second' WHERE id='{initial}';"
        )
        assert self.dispatch()["edits_expired"] == 1
        self.wait_edit(expiring, "expired")
        assert self.clip(initial)["file_storage_key"] == clip["file_storage_key"]
        self.check(
            "expired edit reservation is released without replacing existing media"
        )

        failed = self.create("smoke:fail")
        assert self.dispatch()["dispatched"] == 1
        self.wait_job(failed, "failed")
        assert self.credits() == 990
        assert (
            self.repeat_delivery("job", failed)["status"] == "ignored"
            and self.credits() == 990
        )
        self.check(
            "worker provider failure reaches Go polling and refunds credits once across duplicate delivery"
        )

        pending = self.create()
        self.request(f"/api/jobs/{pending}/cancel", {}, method="POST")
        self.request(f"/api/jobs/{pending}/cancel", {}, method="POST")
        assert self.dispatch()["dispatched"] == 0
        assert (
            self.repeat_delivery("job", pending)["status"] == "ignored"
            and self.credits() == 990
        )
        self.check(
            "pending cancellation blocks dispatch and late deliveries while refunding once"
        )

        gate = uuid.uuid4().hex
        active = self.create("smoke:pause:" + gate)
        assert self.dispatch()["dispatched"] == 1
        wait_for(
            "active worker gate",
            lambda: (self.media / "fixture-control" / (gate + ".entered")).exists(),
        )
        assert self.job(active)["processing_active"]
        self.request(f"/api/jobs/{active}/cancel", {}, method="POST")
        (self.media / "fixture-control" / (gate + ".release")).touch()
        self.wait_job(active, "cancelled")
        assert (
            self.credits() == 990
            and self.sql(f"SELECT count(*) FROM clips WHERE job_id='{active}';") == "0"
        )
        self.check(
            "Go cancellation interrupts an active Celery execution before publishing clips and restores credits"
        )

        gate = uuid.uuid4().hex
        recovered = self.create("smoke:pause:" + gate)
        assert self.dispatch()["dispatched"] == 1
        wait_for(
            "worker crash gate",
            lambda: (self.media / "fixture-control" / (gate + ".entered")).exists(),
        )
        run("docker", "kill", self.worker, stdout=subprocess.DEVNULL)
        assert self.job(recovered)["processing_active"]
        (self.media / "fixture-control" / (gate + ".release")).touch()
        self.sql(
            f"UPDATE job_deliveries SET lease_until=now()-interval '1 second' WHERE job_id='{recovered}';"
        )
        run("docker", "start", self.worker, stdout=subprocess.DEVNULL)
        recovery = self.dispatch()
        assert recovery["recovered"] == 1 and recovery["dispatched"] == 1, recovery
        self.wait_job(recovered, "completed")
        self.playable(self.clip(recovered), 8, square=True)
        assert (
            self.row(
                f"SELECT execution_count FROM job_deliveries WHERE job_id='{recovered}'"
            )["execution_count"]
            == 2
        )
        assert self.credits() == 980
        self.check(
            "hard worker loss recovers an expired database lease into one playable clip with one charge"
        )
        return {
            "checks": self.checks,
            "rendered": rendered,
            "remaining_credits": self.credits(),
            "live_provider_calls": False,
            "persistent_data_used": False,
        }

    def close(self, failed):
        if failed:
            if self.log:
                self.log.flush()
                self.log.seek(0)
                print("Go API diagnostics:\n" + self.log.read()[-8000:], flush=True)
            if self.worker in self.containers:
                logs = subprocess.run(
                    ["docker", "logs", "--tail", "90", self.worker],
                    text=True,
                    capture_output=True,
                )
                print("Celery diagnostics:\n" + logs.stdout + logs.stderr, flush=True)
        if self.api is not None:
            self.api.terminate()
            try:
                self.api.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.api.kill()
                self.api.wait(timeout=5)
        if self.log:
            self.log.close()
        for container in reversed(self.containers):
            run("docker", "rm", "-f", "-v", container, stdout=subprocess.DEVNULL)
        if self.network_started:
            run("docker", "network", "rm", self.network, stdout=subprocess.DEVNULL)
        print(
            "Removed disposable containers, network and temporary media; persistent project data was not used.",
            flush=True,
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--report",
        type=Path,
        help="Write a JSON verification report outside temporary fixture storage",
    )
    options = parser.parse_args()
    with tempfile.TemporaryDirectory(
        prefix="sneepcut-worker-integration-"
    ) as directory:
        smoke = Smoke(Path(directory))
        failed = True
        try:
            smoke.setup()
            report = smoke.exercise()
            if options.report:
                options.report.parent.mkdir(parents=True, exist_ok=True)
                options.report.write_text(json.dumps(report, indent=2) + "\n")
            print(
                f"PASS: {len(report['checks'])} isolated Go/Python worker integration checks",
                flush=True,
            )
            failed = False
        finally:
            smoke.close(failed)


if __name__ == "__main__":
    main()
