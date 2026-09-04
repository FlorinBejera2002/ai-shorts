"""Deterministic framing and branding, without untrusted FFmpeg expressions."""

from __future__ import annotations

import math
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.utils.ffmpeg_utils import run_ffmpeg

RATIOS = {"9:16": (9, 16), "1:1": (1, 1), "16:9": (16, 9)}
POSITIONS = {"top-left", "top-right", "bottom-left", "bottom-right"}


def output_dimensions(width: int, height: int, aspect_ratio: str) -> tuple[int, int]:
    numerator, denominator = RATIOS[aspect_ratio]
    unit = math.floor(min(width / numerator, height / denominator) / 2) * 2
    if unit < 2:
        raise ValueError("Source dimensions are too small")
    return numerator * unit, denominator * unit


def subtitle_brand_options(brand: dict | None) -> dict:
    if not brand or not brand.get("apply_brand"):
        return {}
    font = brand.get("subtitle_font", "Inter Bold")
    if not re.fullmatch(r"[A-Za-z0-9 -]{1,100}", font):
        raise ValueError("Invalid subtitle font")
    colors = [
        brand.get("subtitle_color", "#FFFFFF"),
        brand.get("subtitle_bg_color", "#000000"),
    ]
    if any(not re.fullmatch(r"#[0-9A-Fa-f]{6}", color) for color in colors):
        raise ValueError("Invalid subtitle color")
    opacity = float(brand.get("subtitle_bg_opacity", 0.7))
    if not math.isfinite(opacity) or not 0 <= opacity <= 1:
        raise ValueError("Invalid subtitle background opacity")
    return {
        "font_name": font,
        "font_color": colors[0],
        "bg_color": colors[1],
        "bg_opacity": opacity,
        "alignment": brand.get("subtitle_position", "bottom"),
    }


def render_framing_and_brand(
    source: str,
    destination: str,
    *,
    width: int,
    height: int,
    aspect_ratio: str,
    brand: dict | None,
    storage,
) -> str:
    target_width, target_height = output_dimensions(width, height, aspect_ratio)
    apply_logo = bool(brand and brand.get("apply_brand") and brand.get("logo_key"))
    draw_badge = bool(brand and not brand.get("hide_platform_badge"))
    if (
        (target_width, target_height) == (width, height)
        and not apply_logo
        and not draw_badge
    ):
        return source
    output = Path(destination)
    output.parent.mkdir(parents=True, exist_ok=True)
    crop = f"crop={target_width}:{target_height},setsar=1"
    command = ["ffmpeg", "-y", "-i", source]
    if apply_logo or draw_badge:
        canvas = Image.new("RGBA", (target_width, target_height), (0, 0, 0, 0))
        margin = max(4, round(min(target_width, target_height) * 0.025))
        if apply_logo:
            key = brand["logo_key"]
            if not key.startswith(f"brand/{brand['user_id']}/") or ".." in key.split(
                "/"
            ):
                raise ValueError("Logo must belong to the job owner")
            logo_file = output.parent / "render-logo-source"
            storage.download_file(key, logo_file)
            with Image.open(logo_file) as original:
                if original.format not in {"PNG", "JPEG", "WEBP"}:
                    raise ValueError("Unsupported brand logo")
                logo = original.convert("RGBA")
            logo.thumbnail(
                (
                    max(1, round(target_width * 0.18)),
                    max(1, round(target_height * 0.18)),
                )
            )
            opacity = float(brand.get("watermark_opacity", 0.8))
            if not math.isfinite(opacity) or not 0 <= opacity <= 1:
                raise ValueError("Invalid watermark opacity")
            logo.putalpha(
                logo.getchannel("A").point(lambda alpha: round(alpha * opacity))
            )
            position = brand.get("watermark_position", "bottom-right")
            if position not in POSITIONS:
                raise ValueError("Invalid watermark position")
            x = (
                margin
                if position.endswith("left")
                else target_width - logo.width - margin
            )
            y = (
                margin
                if position.startswith("top")
                else target_height - logo.height - margin
            )
            canvas.alpha_composite(logo, (x, y))
        if draw_badge:
            draw = ImageDraw.Draw(canvas)
            font = ImageFont.load_default(size=max(10, round(target_width * 0.025)))
            # Opposite the logo where possible; no user-controlled drawtext syntax.
            y = (
                margin
                if brand.get("watermark_position", "bottom-right").startswith("bottom")
                else target_height - margin - font.size
            )
            draw.text(
                (margin, y),
                "sneepcut",
                font=font,
                fill=(255, 255, 255, 210),
                stroke_width=1,
                stroke_fill=(0, 0, 0, 150),
            )
        overlay = output.parent / f"{output.stem}-overlay.png"
        canvas.save(overlay)
        command += [
            "-i",
            str(overlay),
            "-filter_complex",
            f"[0:v]{crop}[base];[base][1:v]overlay=0:0:eof_action=repeat:format=auto[v]",
            "-map",
            "[v]",
        ]
    else:
        command += ["-vf", crop, "-map", "0:v:0"]
    command += [
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        str(output),
    ]
    run_ffmpeg(command)
    return str(output)
