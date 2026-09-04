"""Deterministic framing and branding, without untrusted FFmpeg expressions."""

from __future__ import annotations

import math
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.utils.ffmpeg_utils import run_ffmpeg

RATIOS = {"9:16": (9, 16), "1:1": (1, 1), "16:9": (16, 9)}
POSITIONS = {"top-left", "top-right", "bottom-left", "bottom-right"}


def draw_brand_hook(canvas: Image.Image, brand: dict, text: str) -> None:
    """Rasterize creator text; no text or font value enters a filter expression."""
    primary = brand.get("primary_color", "#6366f1")
    secondary = brand.get("secondary_color", "#8b5cf6")
    family = brand.get("font_family", "Inter")
    if any(
        not isinstance(color, str) or not re.fullmatch(r"#[0-9A-Fa-f]{6}", color)
        for color in (primary, secondary)
    ):
        raise ValueError("Invalid brand palette")
    if not isinstance(family, str) or not re.fullmatch(r"[A-Za-z0-9 -]{1,100}", family):
        raise ValueError("Invalid brand font")
    size = max(10, round(canvas.width * 0.04))
    font = ImageFont.load_default(size=size)
    try:
        matched = subprocess.run(
            ["fc-match", "-f", "%{file}", "--", family],
            capture_output=True,
            text=True,
            check=True,
            timeout=5,
        )
        if matched.stdout.strip():
            font = ImageFont.truetype(matched.stdout.strip(), size=size)
    except (OSError, subprocess.SubprocessError):
        # Deterministic bundled Pillow font when a requested family is absent.
        pass
    text = " ".join(str(text).split())[:200]
    lines, current = [], ""
    available = canvas.width * 0.78
    for word in text.split():
        proposed = f"{current} {word}".strip()
        if font.getlength(proposed) > available and current:
            lines.append(current)
            current = word
        else:
            current = proposed
    if current:
        lines.append(current)
    lines = lines[:3]
    # A single long token must also fit within the safe text box.
    for index, line in enumerate(lines):
        while line and font.getlength(line) > available:
            line = line[:-1]
        lines[index] = line
    if not lines:
        return
    draw = ImageDraw.Draw(canvas)
    padding = max(4, size // 3)
    line_height = round(size * 1.35)
    box_height = line_height * len(lines) + 2 * padding
    x = round(canvas.width * 0.08)
    y = min(round(canvas.height * 0.25), max(0, canvas.height - box_height - padding))
    right = canvas.width - x
    draw.rounded_rectangle((x, y, right, y + box_height), radius=padding, fill=primary)
    draw.rectangle((x, y + box_height - padding, right, y + box_height), fill=secondary)
    rgb = tuple(int(primary[index : index + 2], 16) for index in (1, 3, 5))
    foreground = (
        "#000000"
        if sum(v * w for v, w in zip(rgb, (0.299, 0.587, 0.114))) > 160
        else "#FFFFFF"
    )
    for index, line in enumerate(lines):
        draw.text(
            (canvas.width / 2, y + padding + index * line_height),
            line,
            font=font,
            fill=foreground,
            anchor="mt",
        )


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
    hook_text: str = "",
) -> str:
    target_width, target_height = output_dimensions(width, height, aspect_ratio)
    apply_logo = bool(brand and brand.get("apply_brand") and brand.get("logo_key"))
    draw_badge = bool(brand and not brand.get("hide_platform_badge"))
    apply_hook = bool(brand and brand.get("apply_brand") and hook_text)
    if (
        (target_width, target_height) == (width, height)
        and not apply_logo
        and not draw_badge
        and not apply_hook
    ):
        return source
    output = Path(destination)
    output.parent.mkdir(parents=True, exist_ok=True)
    crop = f"crop={target_width}:{target_height},setsar=1"
    command = ["ffmpeg", "-y", "-i", source]
    if apply_logo or draw_badge or apply_hook:
        canvas = Image.new("RGBA", (target_width, target_height), (0, 0, 0, 0))
        if apply_hook:
            draw_brand_hook(canvas, brand, hook_text)
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
