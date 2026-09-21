package scripts

import (
	_ "embed"
	"encoding/json"
	"math"
	"slices"
	"strconv"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

//go:embed prompts/movement.json
var movementJSON []byte
var movement struct {
	TypeAliases      map[string]string   `json:"typeAliases"`
	DirectionAliases map[string]string   `json:"directionAliases"`
	Allowed          map[string][]string `json:"allowed"`
	TypeTerms        []json.RawMessage   `json:"typeTerms"`
	DirectionTerms   []json.RawMessage   `json:"directionTerms"`
}

func init() {
	if err := json.Unmarshal(movementJSON, &movement); err != nil {
		panic(err)
	}
}
func text(value any, fallback string) string {
	if s, ok := value.(string); ok {
		return s
	}
	return fallback
}
func number(value any, fallback float64) float64 {
	var v float64
	switch x := value.(type) {
	case float64:
		v = x
	case int:
		v = float64(x)
	case string:
		var err error
		v, err = strconv.ParseFloat(strings.TrimSpace(x), 64)
		if err != nil {
			return fallback
		}
	default:
		return fallback
	}
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return fallback
	}
	return v
}
func integer(value any, fallback int) int {
	if s, ok := value.(string); ok {
		n, err := strconv.Atoi(strings.TrimSpace(s))
		if err != nil {
			return fallback
		}
		return max(1, n)
	}
	return max(1, int(number(value, float64(fallback))))
}
func bounded(value any, minimum, maximum, fallback float64) float64 {
	return min(maximum, max(minimum, number(value, fallback)))
}
func textList(value any, limit int) []string {
	result := []string{}
	if list, ok := value.([]any); ok {
		for _, item := range list {
			if s, ok := item.(string); ok {
				result = append(result, s)
				if len(result) == limit {
					break
				}
			}
		}
	}
	return result
}
func token(value any) string {
	s := norm.NFD.String(strings.ToLower(strings.TrimSpace(text(value, ""))))
	var result strings.Builder
	for _, r := range s {
		if unicode.Is(unicode.Mn, r) {
			continue
		}
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			result.WriteRune(r)
		} else {
			result.WriteByte(' ')
		}
	}
	return strings.Join(strings.Fields(result.String()), " ")
}
func infer(source string, choices []json.RawMessage, fallback string) string {
	for _, choice := range choices {
		var tuple []json.RawMessage
		_ = json.Unmarshal(choice, &tuple)
		if len(tuple) != 2 {
			continue
		}
		var value string
		var terms []string
		_ = json.Unmarshal(tuple[0], &value)
		_ = json.Unmarshal(tuple[1], &terms)
		for _, term := range terms {
			if strings.Contains(" "+source, term) {
				return value
			}
		}
	}
	return fallback
}
func normalizeMovement(scene map[string]any) (string, string) {
	label := token(scene["camera_movement"])
	rawType := token(scene["camera_movement_type"])
	rawDirection := token(scene["camera_movement_direction"])
	kind := rawType
	if alias, ok := movement.TypeAliases[kind]; ok {
		kind = alias
	}
	if _, ok := movement.Allowed[kind]; !ok {
		kind = infer(rawType+" "+label, movement.TypeTerms, "static")
	}
	direction := rawDirection
	if alias, ok := movement.DirectionAliases[direction]; ok {
		direction = alias
	}
	if !slices.Contains([]string{"none", "left", "right", "up", "down", "in", "out"}, direction) {
		direction = infer(rawDirection+" "+label, movement.DirectionTerms, "none")
	}
	if !slices.Contains(movement.Allowed[kind], direction) {
		direction = "none"
	}
	return kind, direction
}

func Normalize(raw map[string]any) map[string]any {
	scenes := []map[string]any{}
	total := 0
	input, _ := raw["scenes"].([]any)
	for i, value := range input {
		scene, _ := value.(map[string]any)
		if scene == nil {
			scene = map[string]any{}
		}
		duration := integer(scene["duration_seconds"], 5)
		total += duration
		kind, direction := normalizeMovement(scene)
		position := []float64{0, 0, 0}
		rawPosition, _ := scene["subject_position"].([]any)
		limits := [][2]float64{{-3, 3}, {0, 2.5}, {-3, 5}}
		for j := range position {
			if j < len(rawPosition) {
				position[j] = bounded(rawPosition[j], limits[j][0], limits[j][1], 0)
			}
		}
		lens := 24
		rawLens := bounded(scene["lens_mm"], 1, 200, 35)
		for _, candidate := range []int{35, 50, 70} {
			if math.Abs(float64(candidate)-rawLens) < math.Abs(float64(lens)-rawLens) {
				lens = candidate
			}
		}
		scenes = append(scenes, map[string]any{
			"scene_number": integer(scene["scene_number"], i+1), "duration_seconds": duration,
			"visual_description": text(scene["visual_description"], ""), "camera_angle": text(scene["camera_angle"], "eye-level"), "camera_movement": text(scene["camera_movement"], "static"),
			"camera_movement_type": kind, "camera_movement_direction": direction, "dialogue": text(scene["dialogue"], ""), "text_overlay": text(scene["text_overlay"], ""), "music_mood": text(scene["music_mood"], ""), "transition": text(scene["transition"], "cut"), "shot_type": text(scene["shot_type"], "medium_shot"),
			"camera_height": bounded(scene["camera_height"], .4, 2.6, 1.55), "camera_distance": bounded(scene["camera_distance"], .5, 6, 1.8), "camera_yaw": bounded(scene["camera_yaw"], -45, 45, 0), "camera_pitch": bounded(scene["camera_pitch"], -25, 25, 0), "lens_mm": lens, "subject_position": position,
			"subject_action": text(scene["subject_action"], "Speak naturally to camera"), "lighting": text(scene["lighting"], "soft_key_left"), "voice_emotion": text(scene["voice_emotion"], "confident"), "voice_pace": bounded(scene["voice_pace"], .75, 1.35, 1), "voice_emphasis": textList(scene["voice_emphasis"], 5),
		})
	}
	return map[string]any{"title": text(raw["title"], "Untitled Script"), "hook": text(raw["hook"], ""), "scenes": scenes, "call_to_action": text(raw["call_to_action"], ""), "caption": text(raw["caption"], ""), "hashtags": textList(raw["hashtags"], 10), "total_duration_seconds": total, "equipment_suggestions": textList(raw["equipment_suggestions"], 20), "filming_tips": textList(raw["filming_tips"], 20)}
}
