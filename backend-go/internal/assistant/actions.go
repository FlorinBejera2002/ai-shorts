package assistant

import (
	"math"
	"sort"
	"strconv"
	"strings"
)

func clipped(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		r = r[:n]
	}
	return string(r)
}
func number(v any) (float64, bool) {
	var f float64
	switch x := v.(type) {
	case float64:
		f = x
	case string:
		var err error
		f, err = strconv.ParseFloat(strings.TrimSpace(x), 64)
		if err != nil {
			return 0, false
		}
	default:
		return 0, false
	}
	return f, !math.IsNaN(f) && !math.IsInf(f, 0)
}
func allowed(v any, values ...string) bool {
	s, ok := v.(string)
	if !ok {
		return false
	}
	for _, x := range values {
		if s == x {
			return true
		}
	}
	return false
}
func Actions(context string, raw []any, duration float64) []map[string]any {
	out := []map[string]any{}
	if context != "create" && context != "editor" {
		return out
	}
	for _, item := range raw {
		a, ok := item.(map[string]any)
		if !ok {
			continue
		}
		kind, _ := a["type"].(string)
		if context == "create" {
			switch kind {
			case "update_settings":
				s, ok := a["settings"].(map[string]any)
				if !ok {
					continue
				}
				clean := map[string]any{}
				if v, ok := s["clips"].(float64); ok && !math.IsNaN(v) && !math.IsInf(v, 0) {
					clean["clips"] = int(math.Max(1, math.Min(15, v)))
				}
				if allowed(s["aspect_ratio"], "9:16", "1:1", "16:9") {
					clean["aspect_ratio"] = s["aspect_ratio"]
				}
				if allowed(s["subtitle_style"], "clean", "bold", "caption-box", "none") {
					clean["subtitle_style"] = s["subtitle_style"]
				}
				for _, k := range []string{"include_brand", "smart_crop"} {
					if v, ok := s[k].(bool); ok {
						clean[k] = v
					}
				}
				if v, ok := s["language"]; ok && (v == nil || allowed(v, "en", "ro", "es", "fr", "de", "it", "pt", "pl")) {
					clean["language"] = v
				}
				if len(clean) > 0 {
					out = append(out, map[string]any{"type": kind, "settings": clean})
				}
			case "set_instructions":
				if v, ok := a["instructions"].(string); ok && strings.TrimSpace(v) != "" {
					out = append(out, map[string]any{"type": kind, "instructions": clipped(strings.TrimSpace(v), 4000)})
				}
			}
			continue
		}
		switch kind {
		case "apply_segments":
			list, ok := a["segments"].([]any)
			if !ok || len(list) < 1 || len(list) > 10 {
				continue
			}
			segments := []map[string]float64{}
			valid := true
			total := 0.0
			for _, v := range list {
				s, ok := v.(map[string]any)
				if !ok {
					valid = false
					break
				}
				start, ok1 := number(s["start"])
				end, ok2 := number(s["end"])
				if !ok1 || !ok2 {
					valid = false
					break
				}
				start = roundSeconds(start)
				end = roundSeconds(end)
				if duration > 0 {
					start = math.Max(0, math.Min(start, duration))
					end = math.Max(0, math.Min(end, duration))
				}
				if start < 0 || end-start < .25 {
					valid = false
					break
				}
				total += end - start
				segments = append(segments, map[string]float64{"start": start, "end": end})
			}
			sorted := append([]map[string]float64{}, segments...)
			sort.Slice(sorted, func(i, j int) bool { return sorted[i]["start"] < sorted[j]["start"] })
			for i := 1; i < len(sorted); i++ {
				if sorted[i]["start"] < sorted[i-1]["end"] {
					valid = false
				}
			}
			if valid && total >= 3 {
				out = append(out, map[string]any{"type": kind, "segments": segments})
			}
		case "seek":
			if v, ok := number(a["time"]); ok {
				v = math.Max(0, v)
				if duration > 0 {
					v = math.Min(v, duration)
				}
				out = append(out, map[string]any{"type": kind, "time": roundSeconds(v)})
			}
		}
	}
	return out
}

// Formatting rounds the original binary float to two decimals, matching
// Python round(x, 2). Multiplying first changes ties such as 2.675 to 2.68.
func roundSeconds(value float64) float64 {
	rounded, _ := strconv.ParseFloat(strconv.FormatFloat(value, 'f', 2, 64), 64)
	return rounded
}
