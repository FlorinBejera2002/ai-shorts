from __future__ import annotations

import pytest
from app.schemas.script import (
    CameraMovementDirection,
    CameraMovementType,
    ScriptScene,
)
from app.services.script_generator import (
    LANGUAGE_NAMES,
    build_script_prompt,
    validate_script,
)


def _script_with_scene(**scene_overrides: object) -> dict[str, object]:
    scene: dict[str, object] = {
        "scene_number": 1,
        "duration_seconds": 5,
        "visual_description": "Creator at a desk",
        "camera_angle": "eye-level",
        "camera_movement": "Static",
        "dialogue": "Hello",
        "text_overlay": "",
        "music_mood": "calm",
        "transition": "cut",
    }
    scene.update(scene_overrides)
    return {"scenes": [scene]}


@pytest.mark.parametrize(
    ("language", "label", "movement_type", "direction"),
    (
        ("en", "Slow pan left", "pan", "left"),
        ("ro", "Filmare din mână", "handheld", "none"),
        ("es", "Inclinación hacia abajo", "tilt", "down"),
        ("fr", "Zoom avant", "zoom", "in"),
        ("de", "Kamerafahrt zurück", "dolly", "out"),
        ("it", "Panoramica a destra", "pan", "right"),
        ("pt", "Inclinação para cima", "tilt", "up"),
    ),
)
def test_validate_script_keeps_localized_label_separate_from_canonical_fields(
    language: str,
    label: str,
    movement_type: str,
    direction: str,
) -> None:
    validated = validate_script(
        _script_with_scene(
            camera_movement=label,
            camera_movement_type=movement_type,
            camera_movement_direction=direction,
        )
    )
    scene = validated["scenes"][0]

    assert language in LANGUAGE_NAMES
    assert scene["camera_movement"] == label
    assert scene["camera_movement_type"] == movement_type
    assert scene["camera_movement_direction"] == direction


@pytest.mark.parametrize(
    ("movement_type", "direction"),
    (
        ("static", "none"),
        ("pan", "left"),
        ("pan", "right"),
        ("tilt", "up"),
        ("tilt", "down"),
        ("zoom", "in"),
        ("zoom", "out"),
        ("dolly", "in"),
        ("dolly", "out"),
        ("track", "left"),
        ("track", "right"),
        ("handheld", "none"),
    ),
)
def test_schema_accepts_every_supported_canonical_movement_pair(
    movement_type: str,
    direction: str,
) -> None:
    scene = ScriptScene.model_validate(
        _script_with_scene(
            camera_movement_type=movement_type,
            camera_movement_direction=direction,
        )["scenes"][0]
    )

    assert scene.camera_movement_type == CameraMovementType(movement_type)
    assert scene.camera_movement_direction == CameraMovementDirection(direction)


@pytest.mark.parametrize(
    "label",
    (
        "Filmare din mână",
        "Cameră ținută în mână",
        "Mișcare din mână",
    ),
)
def test_legacy_romanian_handheld_wording_is_normalized(label: str) -> None:
    validated = validate_script(_script_with_scene(camera_movement=label))
    scene = validated["scenes"][0]

    assert scene["camera_movement_type"] == "handheld"
    assert scene["camera_movement_direction"] == "none"


def test_invalid_type_direction_pair_fails_closed_to_no_movement() -> None:
    scene = ScriptScene.model_validate(
        _script_with_scene(
            camera_movement_type="pan",
            camera_movement_direction="up",
        )["scenes"][0]
    )

    assert scene.camera_movement_type == CameraMovementType.PAN
    assert scene.camera_movement_direction == CameraMovementDirection.NONE


@pytest.mark.parametrize("language", tuple(LANGUAGE_NAMES))
def test_prompt_requires_untranslated_machine_movement_fields(language: str) -> None:
    prompt = build_script_prompt(topic="Camera test", language=language)

    assert '"camera_movement_type"' in prompt
    assert '"camera_movement_direction"' in prompt
    assert "NEVER translate them" in prompt
    assert "none, left, right, up, down, in or out" in prompt
