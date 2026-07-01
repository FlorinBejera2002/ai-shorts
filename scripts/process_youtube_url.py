from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.config import settings
from app.services.processing_pipeline import process_video_source


def main() -> int:
    parser = argparse.ArgumentParser(description="Process a YouTube URL with ClipForge")
    parser.add_argument("--url", required=True)
    parser.add_argument("--output-root", default=str(ROOT / "media"))
    parser.add_argument("--clips", type=int, default=5)
    parser.add_argument("--cookies")
    parser.add_argument("--no-smart-crop", action="store_true")
    parser.add_argument("--no-subtitles", action="store_true")
    args = parser.parse_args()

    if args.cookies:
        settings.youtube_cookies_path = args.cookies

    try:
        result = process_video_source(
            args.url,
            output_root=args.output_root,
            source_type="youtube",
            requested_clips=args.clips,
            smart_crop=not args.no_smart_crop,
            burn_subtitles=not args.no_subtitles,
        )
        print(json.dumps(result, indent=2))
        return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
