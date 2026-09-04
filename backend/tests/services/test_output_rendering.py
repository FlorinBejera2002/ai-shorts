import os
import shutil
import subprocess
from pathlib import Path

import pytest
from app.services import output_rendering as render
from PIL import Image


@pytest.mark.parametrize("ratio,p,q", [("9:16", 9, 16), ("1:1", 1, 1), ("16:9", 16, 9)])
def test_framing_preserves_exact_ratio_without_upscaling(ratio, p, q):
    width, height = render.output_dimensions(1920, 1080, ratio)
    assert width * q == height * p
    assert width <= 1920 and height <= 1080
    assert width % 2 == height % 2 == 0


def test_matching_frame_without_branding_skips_encoding(monkeypatch):
    monkeypatch.setattr(
        render, "run_ffmpeg", lambda *a: pytest.fail("No encode needed")
    )
    assert (
        render.render_framing_and_brand(
            "source.mp4",
            "unused.mp4",
            width=1920,
            height=1080,
            aspect_ratio="16:9",
            brand=None,
            storage=None,
        )
        == "source.mp4"
    )


@pytest.mark.parametrize(
    "field,value",
    [
        ("subtitle_font", "Arial,Fontsize=999"),
        ("subtitle_color", "bad'filter"),
        ("subtitle_bg_opacity", float("nan")),
    ],
)
def test_untrusted_subtitle_filter_values_rejected(field, value):
    with pytest.raises(ValueError):
        render.subtitle_brand_options({"apply_brand": True, field: value})


def test_brand_options_are_only_applied_when_requested():
    assert render.subtitle_brand_options({"apply_brand": False}) == {}
    options = render.subtitle_brand_options(
        {"apply_brand": True, "subtitle_color": "#FF0000", "subtitle_position": "top"}
    )
    assert options["font_color"] == "#FF0000"
    assert options["alignment"] == "top"


@pytest.mark.parametrize("position", sorted(render.POSITIONS))
@pytest.mark.parametrize("hide_badge", [True, False])
def test_real_ffmpeg_framing_and_watermark(position, hide_badge, monkeypatch, tmp_path):
    binary = os.environ.get("SNEEPCUT_FFMPEG_BINARY") or shutil.which("ffmpeg")
    if not binary:
        pytest.skip("set SNEEPCUT_FFMPEG_BINARY to run real encoder tests")

    def ffmpeg(command, **kwargs):
        return subprocess.run(
            [binary, *command[1:]], check=True, capture_output=True, timeout=60
        )

    monkeypatch.setattr(render, "run_ffmpeg", ffmpeg)
    source = tmp_path / "source.mp4"
    ffmpeg(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=320x180:r=5",
            "-t",
            "0.6",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(source),
        ]
    )
    logo = tmp_path / "logo.png"
    Image.new("RGBA", (30, 30), (255, 0, 0, 255)).save(logo)

    class Storage:
        def download_file(self, key, destination):
            assert key == "brand/test-owner/logo.png"
            shutil.copyfile(logo, destination)

    output = render.render_framing_and_brand(
        str(source),
        str(tmp_path / "rendered.mp4"),
        width=320,
        height=180,
        aspect_ratio="1:1",
        storage=Storage(),
        brand={
            "user_id": "test-owner",
            "apply_brand": True,
            "logo_key": "brand/test-owner/logo.png",
            "watermark_position": position,
            "watermark_opacity": 1,
            "hide_platform_badge": hide_badge,
            "primary_color": "#00FF00",
            "secondary_color": "#FF0000",
            "font_family": "DejaVu Sans",
        },
        hook_text="Brand",
    )
    frame = tmp_path / "frame.png"
    ffmpeg(["ffmpeg", "-y", "-i", output, "-frames:v", "1", str(frame)])
    with Image.open(frame) as image:
        assert image.size == (180, 180)
        x = 12 if position.endswith("left") else 168
        y = 12 if position.startswith("top") else 168
        red, green, blue = image.convert("RGB").getpixel((x, y))
        assert red > 180 and green < 60 and blue < 60
    assert Path(output).stat().st_size > 0


def test_brand_hook_uses_palette_and_rejects_filter_like_fonts():
    canvas = Image.new("RGBA", (320, 320), (0, 0, 0, 0))
    render.draw_brand_hook(
        canvas,
        {
            "primary_color": "#123456",
            "secondary_color": "#ABCDEF",
            "font_family": "Arial",
        },
        "A branded title",
    )
    pixels = set(canvas.get_flattened_data())
    assert (0x12, 0x34, 0x56, 255) in pixels
    assert (0xAB, 0xCD, 0xEF, 255) in pixels
    with pytest.raises(ValueError):
        render.draw_brand_hook(canvas, {"font_family": "Arial,Fontsize=999"}, "Text")


def test_foreign_brand_logo_rejected_before_storage(tmp_path):
    with pytest.raises(ValueError, match="belong"):
        render.render_framing_and_brand(
            "source.mp4",
            str(tmp_path / "out.mp4"),
            width=320,
            height=180,
            aspect_ratio="1:1",
            storage=None,
            brand={
                "apply_brand": True,
                "user_id": "owner",
                "logo_key": "brand/other/logo.png",
            },
        )
