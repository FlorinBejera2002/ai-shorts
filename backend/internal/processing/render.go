package processing

import (
	"math"
	"os"
	"reflect"
)

func canReuseNaturalClip(in RenderInput, decisions []BoundaryDecision, faceModelSignature string) bool {
	if in.Reuse == nil || !reflect.DeepEqual(in.Segments, in.Reuse.Segments) || !reflect.DeepEqual(decisions, in.PreviousDecisions) {
		return false
	}
	// Older clips have no signature and refresh once when face tracking applies.
	return faceModelSignature == "" || in.Reuse.Metadata["face_model_signature"] == faceModelSignature
}

func transitionOverlaps(segments []Segment, duration float64) []float64 {
	overlaps := make([]float64, 0, len(segments)-1)
	for i := 0; i < len(segments)-1; i++ {
		left := segments[i].End - segments[i].Start
		right := segments[i+1].End - segments[i+1].Start
		o := math.Min(duration, math.Min(left/2, right/2))
		overlaps = append(overlaps, o)
	}
	return overlaps
}

func clipDuration(segments []Segment, transition string, transitionDur float64) float64 {
	total := 0.0
	for _, s := range segments {
		total += s.End - s.Start
	}
	if transition != "" && transition != "cut" {
		overlaps := transitionOverlaps(segments, transitionDur)
		for _, o := range overlaps {
			total -= o
		}
	}
	return math.Round(total*1000) / 1000
}

func brandBool(brand map[string]any, key string) bool {
	if brand == nil {
		return false
	}
	v, _ := brand[key].(bool)
	return v
}

func brandString(brand map[string]any, key string) string {
	if brand == nil {
		return ""
	}
	v, _ := brand[key].(string)
	return v
}

func copyBrand(brand map[string]any) map[string]any {
	c := make(map[string]any, len(brand))
	for k, v := range brand {
		c[k] = v
	}
	return c
}

func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0600)
}
