from __future__ import annotations

import math
import unicodedata
from collections.abc import Mapping
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, model_validator

CAMERA_LENSES = (24, 35, 50, 70)
CAMERA_LIMITS = {
    "camera_height": (0.4, 2.6, 1.55),
    "camera_distance": (0.5, 6.0, 1.8),
    "camera_yaw": (-45.0, 45.0, 0.0),
    "camera_pitch": (-25.0, 25.0, 0.0),
}
SUBJECT_POSITION_LIMITS = (
    (-3.0, 3.0, 0.0),
    (0.0, 2.5, 0.0),
    (-3.0, 5.0, 0.0),
)


class CameraMovementType(StrEnum):
    STATIC = "static"
    PAN = "pan"
    TILT = "tilt"
    ZOOM = "zoom"
    DOLLY = "dolly"
    TRACK = "track"
    HANDHELD = "handheld"


class CameraMovementDirection(StrEnum):
    NONE = "none"
    LEFT = "left"
    RIGHT = "right"
    UP = "up"
    DOWN = "down"
    IN = "in"
    OUT = "out"


_MOVEMENT_TYPE_ALIASES = {
    "fixed": CameraMovementType.STATIC.value,
    "tracking": CameraMovementType.TRACK.value,
    "hand held": CameraMovementType.HANDHELD.value,
}
_MOVEMENT_DIRECTION_ALIASES = {
    "forward": CameraMovementDirection.IN.value,
    "inward": CameraMovementDirection.IN.value,
    "backward": CameraMovementDirection.OUT.value,
    "outward": CameraMovementDirection.OUT.value,
}
_ALLOWED_MOVEMENT_DIRECTIONS = {
    CameraMovementType.STATIC.value: {CameraMovementDirection.NONE.value},
    CameraMovementType.PAN.value: {
        CameraMovementDirection.LEFT.value,
        CameraMovementDirection.RIGHT.value,
    },
    CameraMovementType.TILT.value: {
        CameraMovementDirection.UP.value,
        CameraMovementDirection.DOWN.value,
    },
    CameraMovementType.ZOOM.value: {
        CameraMovementDirection.IN.value,
        CameraMovementDirection.OUT.value,
    },
    CameraMovementType.DOLLY.value: {
        CameraMovementDirection.IN.value,
        CameraMovementDirection.OUT.value,
    },
    CameraMovementType.TRACK.value: {
        CameraMovementDirection.LEFT.value,
        CameraMovementDirection.RIGHT.value,
    },
    CameraMovementType.HANDHELD.value: {CameraMovementDirection.NONE.value},
}

_MOVEMENT_TYPE_TERMS = (
    (
        CameraMovementType.HANDHELD.value,
        (
            "handheld",
            "hand held",
            "camera de mana",
            "camera din mana",
            "filmare din mana",
            "miscare din mana",
            "tinuta in mana",
            "tinut din mana",
            "camara en mano",
            "camera a l epaule",
            "camera portee",
            "handkamera",
            "camera a mano",
            "camera na mao",
        ),
    ),
    (
        CameraMovementType.PAN.value,
        (" pan", "paneo", "panoram", "schwenk", "brandeggio"),
    ),
    (
        CameraMovementType.TILT.value,
        ("tilt", "inclin", "bascul", "neigung"),
    ),
    (
        CameraMovementType.ZOOM.value,
        ("zoom", "acercar", "alejar"),
    ),
    (
        CameraMovementType.DOLLY.value,
        (
            "dolly",
            "travell",
            "carrell",
            "kamerafahrt",
            "deplasare camera",
            "apropiere camera",
            "departare camera",
            "desplazamiento de camara",
        ),
    ),
    (
        CameraMovementType.TRACK.value,
        (
            "track",
            "urmar",
            "seguimiento",
            "suivi",
            "verfolg",
            "inseguimento",
            "acompanhamento",
        ),
    ),
    (
        CameraMovementType.STATIC.value,
        (
            "static",
            "fixa",
            "fixe",
            "fija",
            "fijo",
            "fixo",
            "fisso",
            "statique",
            "statisch",
            "statico",
        ),
    ),
)

_MOVEMENT_DIRECTION_TERMS = (
    (
        CameraMovementDirection.LEFT.value,
        (" left", "stanga", "izquierda", "gauche", "links", "sinistra", "esquerda"),
    ),
    (
        CameraMovementDirection.RIGHT.value,
        (" right", "dreapta", "derecha", "droite", "rechts", "destra", "direita"),
    ),
    (
        CameraMovementDirection.UP.value,
        (" up", "sus", "arriba", "haut", "oben", "alto", "cima"),
    ),
    (
        CameraMovementDirection.DOWN.value,
        (" down", "jos", "coboar", "abajo", "bas", "unten", "basso", "baixo"),
    ),
    (
        CameraMovementDirection.IN.value,
        (
            " in",
            "inainte",
            "apropiere",
            "acerc",
            "avant",
            "hinein",
            "avanti",
            "aproxim",
        ),
    ),
    (
        CameraMovementDirection.OUT.value,
        (
            " out",
            "inapoi",
            "depart",
            "alejar",
            "arriere",
            "heraus",
            "zuruck",
            "indietro",
            "afastar",
            "tras",
        ),
    ),
)


def _bounded_number(value: Any, limits: tuple[float, float, float]) -> float:
    minimum, maximum, fallback = limits
    if isinstance(value, bool):
        return fallback
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    if not math.isfinite(parsed):
        return fallback
    return min(maximum, max(minimum, parsed))


def _normalized_camera_token(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    normalized = unicodedata.normalize("NFD", value.strip().casefold())
    words = "".join(
        character if character.isalnum() else " "
        for character in normalized
        if not unicodedata.combining(character)
    )
    return " ".join(words.split())


def _infer_movement_value(
    source: str,
    choices: tuple[tuple[str, tuple[str, ...]], ...],
    fallback: str,
) -> str:
    return next(
        (
            value
            for value, terms in choices
            if any(term in f" {source}" for term in terms)
        ),
        fallback,
    )


def normalize_camera_movement(scene: Mapping[str, Any]) -> dict[str, str]:
    """Return language-independent movement fields for projection logic.

    ``camera_movement`` remains localized presentation copy. The structured fields
    are normalized here so clients never need to interpret translated prose.
    Localized inference is retained only as a compatibility path for older scripts.
    """

    movement_label = _normalized_camera_token(scene.get("camera_movement"))
    raw_type = _normalized_camera_token(scene.get("camera_movement_type"))
    raw_direction = _normalized_camera_token(scene.get("camera_movement_direction"))

    type_values = {value.value for value in CameraMovementType}
    direction_values = {value.value for value in CameraMovementDirection}
    movement_type = _MOVEMENT_TYPE_ALIASES.get(raw_type, raw_type)
    if movement_type not in type_values:
        movement_type = _infer_movement_value(
            f"{raw_type} {movement_label}",
            _MOVEMENT_TYPE_TERMS,
            CameraMovementType.STATIC.value,
        )

    movement_direction = _MOVEMENT_DIRECTION_ALIASES.get(raw_direction, raw_direction)
    if movement_direction not in direction_values:
        movement_direction = _infer_movement_value(
            f"{raw_direction} {movement_label}",
            _MOVEMENT_DIRECTION_TERMS,
            CameraMovementDirection.NONE.value,
        )

    if movement_direction not in _ALLOWED_MOVEMENT_DIRECTIONS[movement_type]:
        movement_direction = CameraMovementDirection.NONE.value

    return {
        "camera_movement_type": movement_type,
        "camera_movement_direction": movement_direction,
    }


def normalize_camera_values(scene: Mapping[str, Any]) -> dict[str, Any]:
    raw_position = scene.get("subject_position")
    position = raw_position if isinstance(raw_position, (list, tuple)) else ()
    normalized_position = [
        _bounded_number(
            position[index] if index < len(position) else limits[2],
            limits,
        )
        for index, limits in enumerate(SUBJECT_POSITION_LIMITS)
    ]
    raw_lens = _bounded_number(scene.get("lens_mm"), (1.0, 200.0, 35.0))
    lens_mm = min(CAMERA_LENSES, key=lambda lens: (abs(lens - raw_lens), lens))

    return {
        field: _bounded_number(scene.get(field), limits)
        for field, limits in CAMERA_LIMITS.items()
    } | {
        "lens_mm": lens_mm,
        "subject_position": normalized_position,
    }


class ScriptScene(BaseModel):
    scene_number: int
    duration_seconds: int
    visual_description: str
    camera_angle: str
    camera_movement: str
    camera_movement_type: CameraMovementType = CameraMovementType.STATIC
    camera_movement_direction: CameraMovementDirection = CameraMovementDirection.NONE
    dialogue: str
    text_overlay: str
    music_mood: str
    transition: str
    shot_type: str = "medium_shot"
    camera_height: float = Field(default=1.55, ge=0.4, le=2.6)
    camera_distance: float = Field(default=1.8, ge=0.5, le=6.0)
    camera_yaw: float = Field(default=0, ge=-45, le=45)
    camera_pitch: float = Field(default=0, ge=-25, le=25)
    lens_mm: int = 35
    subject_action: str = "Speak naturally to camera"
    subject_position: list[float] = Field(
        default_factory=lambda: [0.0, 0.0, 0.0],
        min_length=3,
        max_length=3,
    )
    lighting: str = "soft_key_left"
    voice_emotion: str = "confident"
    voice_pace: float = Field(default=1.0, ge=0.75, le=1.35)
    voice_emphasis: list[str] = Field(default_factory=list, max_length=5)

    @model_validator(mode="before")
    @classmethod
    def clamp_camera_geometry(cls, value: Any) -> Any:
        if not isinstance(value, Mapping):
            return value
        return (
            dict(value)
            | normalize_camera_values(value)
            | normalize_camera_movement(value)
        )


class GeneratedScript(BaseModel):
    title: str
    hook: str
    scenes: list[ScriptScene]
    call_to_action: str
    caption: str
    hashtags: list[str]
    total_duration_seconds: int
    equipment_suggestions: list[str]
    filming_tips: list[str]


class ScriptGenerateRequest(BaseModel):
    topic: str = Field(..., min_length=3, max_length=1000)
    platform: str = Field(default="tiktok")
    duration: int = Field(default=30, ge=15, le=180)
    tone: str = Field(default="entertaining")
    target_audience: str = Field(default="")
    language: str = Field(default="en")
    style: str = Field(default="talking_head")


class ScriptGenerateResponse(BaseModel):
    script: GeneratedScript
    credits_charged: int = 0
