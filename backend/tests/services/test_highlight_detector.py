from app.services.highlight_detector import extract_json_response, fallback_highlights, validate_highlights


def test_extract_json_response_from_fenced_block():
    raw = '```json\n{"shorts": []}\n```'
    assert extract_json_response(raw) == {"shorts": []}


def test_validate_highlights_rejects_invalid_and_overlaps():
    result = validate_highlights(
        {
            "shorts": [
                {"start": 10, "end": 35, "viral_hook_text": "A"},
                {"start": 20, "end": 40, "viral_hook_text": "B"},
                {"start": 50, "end": 55, "viral_hook_text": "too short"},
                {"start": 70, "end": 95.2, "viral_hook_text": "C"},
            ]
        },
        video_duration=95,
        requested_clips=3,
    )
    assert len(result) == 2
    assert result[0].start == 10
    assert result[1].end == 95


def test_fallback_highlights_uses_word_dense_window():
    transcript = {
        "text": "hello world " * 30,
        "words": [
            {"text": "hello", "start": float(i), "end": float(i) + 0.2}
            for i in range(30, 70)
        ],
        "segments": [],
    }
    result = fallback_highlights(transcript, video_duration=120, requested_clips=1)
    assert len(result) == 1
    assert result[0].source == "fallback"
