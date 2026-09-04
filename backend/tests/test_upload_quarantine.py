import uuid
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

from app.api import upload
from app.api.jobs import validate_user_upload_path


@pytest.mark.parametrize("direct", [False, True])
@pytest.mark.parametrize("verdict", [201, 422, 503])
def test_upload_is_released_only_after_scan(tmp_path, monkeypatch, direct, verdict):
    payload = b"\0\0\0\x18ftypmp42" + b"video fixture"
    user = SimpleNamespace(id=uuid.uuid4())
    claims = {
        "fileName": "example.mp4",
        "fileSize": len(payload),
        "contentType": "video/mp4",
    }
    monkeypatch.setattr(upload.settings, "local_media_root", str(tmp_path))
    monkeypatch.setattr(upload.settings, "storage_type", "local")
    monkeypatch.setattr(upload.limiter, "enabled", False)
    scanned = []

    async def authenticate(request: Request):
        if direct:
            request.state.upload_claims = claims
        return user

    async def noop(*args):
        pass

    async def check(path):
        assert path.suffix == ".part"
        assert path.read_bytes() == payload
        assert not list(tmp_path.rglob("*.mp4"))
        scanned.append(path)
        if verdict != 201:
            raise HTTPException(status_code=verdict, detail="Scan rejected")

    monkeypatch.setattr(upload, "consume_upload_nonce", noop)
    monkeypatch.setattr(upload, "ensure_account_active", noop)
    monkeypatch.setattr(upload, "require_clean_upload", check)
    app = FastAPI()
    app.state.limiter = upload.limiter
    app.include_router(upload.router)
    app.dependency_overrides[upload.get_upload_user] = authenticate
    app.dependency_overrides[upload.get_db] = lambda: None
    with TestClient(app) as client:
        if direct:
            response = client.put(
                "/api/upload/direct",
                content=payload,
                headers={"Content-Type": "video/mp4"},
            )
        else:
            response = client.post(
                "/api/upload", files={"file": ("example.mp4", payload, "video/mp4")}
            )
    assert response.status_code == verdict, response.text
    assert len(scanned) == 1
    assert not list(tmp_path.rglob("*.part"))
    assert len(list(tmp_path.rglob("*.mp4"))) == (1 if verdict == 201 else 0)


@pytest.mark.parametrize(
    "filename", [".secret.mp4", ".video.mp4.part", "nested/video.mp4"]
)
def test_jobs_cannot_consume_quarantined_or_nested_files(
    tmp_path, monkeypatch, filename
):
    user = SimpleNamespace(id=uuid.uuid4())
    monkeypatch.setattr(upload.settings, "local_media_root", str(tmp_path))
    path = tmp_path / "uploads" / str(user.id) / filename
    path.parent.mkdir(parents=True)
    path.write_bytes(b"unscanned")
    with pytest.raises(HTTPException) as error:
        validate_user_upload_path(str(path), user)
    assert error.value.status_code == 400
