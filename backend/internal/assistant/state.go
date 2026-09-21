package assistant

import "math"

// Page-state snapshots retain the Python models' defaults and editable fields.
// Unknown nested fields are discarded before building provider context.
func normalizeCreateState(input map[string]any) (map[string]any, bool) {
	if input == nil {
		return nil, true
	}
	out := map[string]any{"clips": 5, "aspect_ratio": "9:16", "subtitle_style": "clean", "include_brand": false, "language": nil, "smart_crop": true, "instructions": nil}
	for key, value := range input {
		switch key {
		case "clips":
			count, ok := number(value)
			if !ok || count < 1 || count > 15 || math.Trunc(count) != count {
				return nil, false
			}
			out[key] = int(count)
		case "aspect_ratio", "subtitle_style":
			text, ok := value.(string)
			if !ok {
				return nil, false
			}
			out[key] = text
		case "include_brand", "smart_crop":
			flag, ok := value.(bool)
			if !ok {
				return nil, false
			}
			out[key] = flag
		case "language", "instructions":
			if value == nil {
				out[key] = nil
				continue
			}
			text, ok := value.(string)
			if !ok {
				return nil, false
			}
			out[key] = text
		}
	}
	return out, true
}
func normalizeEditorState(input map[string]any) (map[string]any, bool) {
	if input == nil {
		return nil, true
	}
	out := map[string]any{"segments": []any{}, "video_duration": 0.0, "current_time": 0.0}
	for key, value := range input {
		switch key {
		case "video_duration", "current_time":
			duration, ok := number(value)
			if !ok || duration < 0 {
				return nil, false
			}
			out[key] = duration
		case "segments":
			list, ok := value.([]any)
			if !ok {
				return nil, false
			}
			segments := make([]any, 0, len(list))
			for _, raw := range list {
				segment, ok := raw.(map[string]any)
				if !ok {
					return nil, false
				}
				start, startOK := number(segment["start"])
				end, endOK := number(segment["end"])
				if !startOK || !endOK || start < 0 || end <= 0 {
					return nil, false
				}
				segments = append(segments, map[string]any{"start": start, "end": end})
			}
			out[key] = segments
		}
	}
	return out, true
}
