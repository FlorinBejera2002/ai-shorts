from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from fastapi import HTTPException
from PIL import Image

from app.api.brand import (
    ALLOWED_LOGO_CONTENT_TYPES,
    ALLOWED_LOGO_EXTENSIONS,
    _fresh_logo_url,
    _owned_logo_key,
    content_type_matches_extension,
    is_valid_stored_image,
    looks_like_supported_image,
)


@pytest.mark.parametrize(
    ("suffix", "image_format"),
    [(".png", "PNG"), (".jpg", "JPEG"), (".jpeg", "JPEG"), (".webp", "WEBP")],
)
def test_only_verified_raster_formats_are_accepted(
    tmp_path: Path, suffix: str, image_format: str
) -> None:
    image_path = tmp_path / f"logo{suffix}"
    Image.new("RGB", (8, 8), "red").save(image_path, format=image_format)

    payload = image_path.read_bytes()
    assert looks_like_supported_image(payload[:512], suffix)
    assert is_valid_stored_image(image_path, suffix)


def test_svg_and_forged_raster_payloads_are_rejected(tmp_path: Path) -> None:
    assert ".svg" not in ALLOWED_LOGO_EXTENSIONS
    assert "image/svg+xml" not in ALLOWED_LOGO_CONTENT_TYPES
    assert not looks_like_supported_image(b'<svg onload="alert(1)"></svg>', ".svg")

    forged = tmp_path / "forged.png"
    forged.write_bytes(b"\x89PNG\r\n\x1a\n" + b"not an image")
    assert looks_like_supported_image(forged.read_bytes(), ".png")
    assert not is_valid_stored_image(forged, ".png")


def test_declared_content_type_must_match_the_extension() -> None:
    assert content_type_matches_extension("image/png", ".png")
    assert content_type_matches_extension("image/jpeg", ".jpeg")
    assert content_type_matches_extension("image/webp", ".webp")
    assert content_type_matches_extension("application/octet-stream", ".png")
    assert not content_type_matches_extension("image/jpeg", ".png")
    assert not content_type_matches_extension("image/svg+xml", ".png")


def test_logo_keys_are_scoped_to_the_authenticated_users_directory() -> None:
    user_id = uuid.uuid4()
    key = f"brand/{user_id}/logo-abc.png"

    assert _owned_logo_key(key, user_id) == key
    assert _owned_logo_key(f"/app/media/{key}", user_id) == key

    with pytest.raises(HTTPException) as cross_account:
        _owned_logo_key(f"brand/{uuid.uuid4()}/logo-abc.png", user_id)
    assert cross_account.value.status_code == 403

    with pytest.raises(HTTPException) as nested_path:
        _owned_logo_key(f"brand/{user_id}/nested/logo-abc.png", user_id)
    assert nested_path.value.status_code == 403

    legacy_svg = f"brand/{user_id}/logo-old.svg"
    with pytest.raises(HTTPException):
        _owned_logo_key(legacy_svg, user_id)
    assert _owned_logo_key(legacy_svg, user_id, allow_legacy_svg=True) == legacy_svg


def test_fresh_logo_urls_prefer_private_storage_signatures() -> None:
    class PrivateStorage:
        def signed_read_url(self, key: str) -> str:
            return f"https://private.example/{key}?signature=fresh"

    key = "brand/user/logo.png"
    assert _fresh_logo_url(PrivateStorage(), key) == (
        "https://private.example/brand/user/logo.png?signature=fresh"
    )
