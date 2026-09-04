"""Deterministic, bounded transition timing shared by rendering and captions."""

import math


def transition_overlaps(segments, style="cut", duration=0.25):
    if style not in {"cut", "fade", "dissolve"}:
        raise ValueError("Unsupported transition")
    if not math.isfinite(duration) or not 0.05 <= duration <= 0.5:
        raise ValueError("Transition duration must be between 0.05 and 0.5 seconds")
    if not 1 <= len(segments) <= 10:
        raise ValueError("Between 1 and 10 segments are required")
    lengths = []
    previous_end = -1
    for segment in segments:
        start, end = float(segment["start"]), float(segment["end"])
        if (
            not math.isfinite(start)
            or not math.isfinite(end)
            or start < 0
            or start < previous_end
            or end - start < 0.25
        ):
            raise ValueError("Segments must be finite, ordered and non-overlapping")
        previous_end = end
        lengths.append(end - start)
    if style == "cut":
        return [0.0] * (len(segments) - 1)
    return [
        min(duration, left / 2, right / 2) for left, right in zip(lengths, lengths[1:])
    ]


def render_transitions(
    input_video, output_path, segments, style, duration, has_audio, crf, preset, run
):
    overlaps = transition_overlaps(segments, style, duration)
    command = ["ffmpeg", "-y", "-filter_complex_threads", "1"]
    filters = []
    for i, segment in enumerate(segments):
        command.extend(
            [
                "-ss",
                str(segment["start"]),
                "-t",
                str(segment["end"] - segment["start"]),
                "-i",
                input_video,
            ]
        )
        # All inputs originate from the same source; normalize VFR and timebase.
        filters.append(f"[{i}:v]setpts=PTS-STARTPTS,fps=30,format=yuv420p[v{i}]")
        if has_audio:
            filters.append(f"[{i}:a]aresample=48000,asetpts=PTS-STARTPTS[a{i}]")
    video, audio = "v0", "a0"
    elapsed = segments[0]["end"] - segments[0]["start"]
    for i, overlap in enumerate(overlaps, 1):
        offset = elapsed - overlap
        filters.append(
            f"[{video}][v{i}]xfade=transition={style}:duration={overlap:.6f}:offset={offset:.6f}[vx{i}]"
        )
        video = f"vx{i}"
        if has_audio:
            filters.append(
                f"[{audio}][a{i}]acrossfade=d={overlap:.6f}:c1=tri:c2=tri[ax{i}]"
            )
            audio = f"ax{i}"
        elapsed += segments[i]["end"] - segments[i]["start"] - overlap
    command.extend(
        [
            "-filter_complex",
            ";".join(filters),
            "-map",
            f"[{video}]",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            str(crf),
            "-preset",
            preset,
        ]
    )
    if has_audio:
        command.extend(["-map", f"[{audio}]", "-c:a", "aac"])
    else:
        command.append("-an")
    command.extend(["-t", f"{elapsed:.6f}", "-movflags", "+faststart", output_path])
    run(command)
