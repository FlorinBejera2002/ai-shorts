import pytest

from app.services.clip_generator import validate_clip_window


def test_validate_clip_window_accepts_valid_window():
    validate_clip_window(1, 3, 10)


def test_validate_clip_window_rejects_out_of_range():
    with pytest.raises(ValueError):
        validate_clip_window(1, 11, 10)


def test_validate_clip_window_rejects_reversed_window():
    with pytest.raises(ValueError):
        validate_clip_window(3, 1, 10)
