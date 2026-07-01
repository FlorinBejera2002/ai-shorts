from __future__ import annotations

import html
import logging
from pathlib import Path

from app.schemas.processing import TranscriptResult
from app.utils.ffmpeg_utils import run_ffmpeg
from app.utils.file_utils import ensure_dir

logger = logging.getLogger(__name__)

STYLE_PRESETS = {
    "clean": {
        "alignment": 2,
        "fontsize": 18,
        "font_name": "Arial",
        "font_color": "#FFFFFF",
        "border_color": "#000000",
        "border_width": 2,
        "bg_color": "#000000",
        "bg_opacity": 0.0,
    },
    "bold": {
        "alignment": 2,
        "fontsize": 22,
        "font_name": "Arial",
        "font_color": "#FFFFFF",
        "border_color": "#000000",
        "border_width": 4,
        "bg_color": "#000000",
        "bg_opacity": 0.0,
    },
    "caption-box": {
        "alignment": 2,
        "fontsize": 18,
        "font_name": "Arial",
        "font_color": "#FFFFFF",
        "border_color": "#111111",
        "border_width": 1,
        "bg_color": "#111111",
        "bg_opacity": 0.75,
    },
}


def _format_srt_time(seconds: float) -> str:
    seconds = max(0, seconds)
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int(round((seconds - int(seconds)) * 1000))
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def _format_srt_block(index: int, start: float, end: float, text: str) -> str:
    escaped_text = html.unescape(text).replace("\n", " ").strip()
    return (
        f"{index}\n"
        f"{_format_srt_time(start)} --> {_format_srt_time(end)}\n"
        f"{escaped_text}\n\n"
    )


def generate_srt(
    transcript: dict,
    clip_start: float,
    clip_end: float,
    output_path: str,
    max_chars: int = 24,
    max_duration: float = 2.0,
) -> bool:
    try:
        normalized = TranscriptResult.model_validate(transcript)
        words = [
            word
            for word in normalized.words
            if word.end >= clip_start and word.start <= clip_end
        ]
        if not words:
            logger.warning("No transcript words found for subtitle range")
            return False

        blocks: list[str] = []
        index = 1
        i = 0
        while i < len(words):
            first = words[i]
            current = [first.text]
            end = first.end
            j = i + 1
            while j < len(words):
                candidate = words[j]
                next_text = " ".join([*current, candidate.text])
                if len(next_text) > max_chars:
                    break
                if candidate.end - first.start > max_duration:
                    break
                current.append(candidate.text)
                end = candidate.end
                j += 1

            blocks.append(
                _format_srt_block(
                    index,
                    max(0, first.start - clip_start),
                    max(0.05, end - clip_start),
                    " ".join(current),
                )
            )
            index += 1
            i = j

        destination = Path(output_path)
        ensure_dir(destination.parent)
        destination.write_text("".join(blocks), encoding="utf-8")
        return True
    except Exception as exc:
        logger.error("Error generating SRT: %s", exc)
        return False


def hex_to_ass_color(hex_color: str, opacity: float = 1.0) -> str:
    color = hex_color.lstrip("#")
    if len(color) != 6:
        color = "FFFFFF"
    r = int(color[0:2], 16)
    g = int(color[2:4], 16)
    b = int(color[4:6], 16)
    alpha = round((1.0 - opacity) * 255)
    return f"&H{alpha:02X}{b:02X}{g:02X}{r:02X}"


def _escape_subtitle_path(path: str) -> str:
    return Path(path).resolve().as_posix().replace(":", "\\:").replace("'", "\\'")


def burn_subtitles(
    video_path: str,
    srt_path: str,
    output_path: str,
    style: str = "clean",
    alignment: str | None = None,
    fontsize: int | None = None,
    font_name: str | None = None,
    font_color: str | None = None,
    border_color: str | None = None,
    border_width: int | None = None,
    bg_color: str | None = None,
    bg_opacity: float | None = None,
) -> bool:
    try:
        preset = dict(STYLE_PRESETS.get(style, STYLE_PRESETS["clean"]))
        if alignment:
            preset["alignment"] = {"bottom": 2, "middle": 5, "top": 8}.get(
                alignment,
                2,
            )
        if fontsize is not None:
            preset["fontsize"] = fontsize
        if font_name is not None:
            preset["font_name"] = font_name
        if font_color is not None:
            preset["font_color"] = font_color
        if border_color is not None:
            preset["border_color"] = border_color
        if border_width is not None:
            preset["border_width"] = border_width
        if bg_color is not None:
            preset["bg_color"] = bg_color
        if bg_opacity is not None:
            preset["bg_opacity"] = bg_opacity

        border_style = 3 if preset["bg_opacity"] > 0 else 1
        style_str = (
            f"Alignment={preset['alignment']},"
            f"Fontname={preset['font_name']},"
            f"Fontsize={preset['fontsize']},"
            f"PrimaryColour={hex_to_ass_color(preset['font_color'])},"
            f"OutlineColour={hex_to_ass_color(preset['border_color'])},"
            f"BackColour={hex_to_ass_color(preset['bg_color'], preset['bg_opacity'])},"
            f"BorderStyle={border_style},"
            f"Outline={preset['border_width']},"
            "Shadow=0,"
            "MarginV=80,"
            "Bold=1"
        )
        ensure_dir(Path(output_path).parent)
        subtitle_filter = (
            f"subtitles='{_escape_subtitle_path(srt_path)}':"
            f"force_style='{style_str}'"
        )
        run_ffmpeg(
            [
                "ffmpeg",
                "-y",
                "-i",
                video_path,
                "-vf",
                subtitle_filter,
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-c:a",
                "aac",
                output_path,
            ]
        )
        return True
    except Exception as exc:
        logger.error("Error burning subtitles: %s", exc)
        return False


def generate_srt_from_video(
    video_path: str,
    output_path: str,
    max_chars: int = 24,
    max_duration: float = 2.0,
) -> bool:
    from app.services.transcriber import transcribe_video
    from app.utils.ffmpeg_utils import get_video_duration

    transcript = transcribe_video(video_path)
    return generate_srt(
        transcript,
        clip_start=0,
        clip_end=get_video_duration(video_path),
        output_path=output_path,
        max_chars=max_chars,
        max_duration=max_duration,
    )
