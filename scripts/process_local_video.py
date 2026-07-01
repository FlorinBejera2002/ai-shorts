from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.services.processing_pipeline import process_video_source


def main() -> int:
    parser = argparse.ArgumentParser(description="Process a local video with ClipForge")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-root", default=str(ROOT / "media"))
    parser.add_argument("--clips", type=int, default=5)
    parser.add_argument("--no-smart-crop", action="store_true")
    parser.add_argument("--no-subtitles", action="store_true")
    args = parser.parse_args()

    try:
        result = process_video_source(
            args.input,
            output_root=args.output_root,
            source_type="local",
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
