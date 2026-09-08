import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services import smart_crop


@pytest.mark.parametrize("use_xdg_cache", [False, True])
def test_yolo_downloads_into_user_cache_and_reuses_model(
    monkeypatch, tmp_path, use_xdg_cache
):
    home = tmp_path / "home"
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.delenv("XDG_CACHE_HOME", raising=False)
    cache = home / ".cache"
    if use_xdg_cache:
        cache = tmp_path / "custom-cache"
        monkeypatch.setenv("XDG_CACHE_HOME", str(cache))

    model = object()
    loaded_paths = []

    def load_model(filename):
        weights = Path(filename)
        # Exercise a real write where the library downloads its weights.
        weights.write_bytes(b"synthetic weights")
        loaded_paths.append(weights)
        return model

    monkeypatch.setitem(sys.modules, "ultralytics", SimpleNamespace(YOLO=load_model))
    monkeypatch.setattr(smart_crop, "_yolo_model", None)
    monkeypatch.chdir(tmp_path)

    assert smart_crop._get_yolo_model() is model
    assert smart_crop._get_yolo_model() is model
    assert loaded_paths == [cache / "ultralytics" / "weights" / "yolov8n.pt"]
    assert not (tmp_path / "yolov8n.pt").exists()
