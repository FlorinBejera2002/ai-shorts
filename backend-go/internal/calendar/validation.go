package calendar

import (
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"
)

const PostLimit = 500
const RecentClipLimit = 100

var idPattern = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
var datePattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$`)
var mutationColumns = map[string]string{"title": "title", "caption": "caption", "notes": "notes", "platforms": "platforms", "status": "status", "scheduledAt": "scheduled_at", "clipId": "clip_id"}

type Issue struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}
type ValidationError struct{ Issues []Issue }

func (e *ValidationError) Error() string { return "Please correct the highlighted fields." }
func utf16Length(value string) int       { return len(utf16.Encode([]rune(value))) }

func ParseDateTime(value string) (time.Time, error) {
	match := datePattern.FindStringSubmatch(value)
	if match == nil {
		return time.Time{}, errors.New("invalid absolute date-time")
	}
	offset := match[1]
	if offset != "Z" {
		hours, _ := strconv.Atoi(offset[1:3])
		minutes, _ := strconv.Atoi(offset[4:6])
		if hours > 14 || minutes > 59 || hours == 14 && minutes != 0 {
			return time.Time{}, errors.New("invalid date-time offset")
		}
	}
	parsed, e := time.Parse(time.RFC3339Nano, value)
	if e != nil || parsed.Year() == 0 {
		return time.Time{}, errors.New("invalid absolute date-time")
	}
	return parsed.UTC().Truncate(time.Millisecond), nil
}
func ParseRange(startValue, endValue string) (time.Time, time.Time, error) {
	if startValue == "" || endValue == "" {
		return time.Time{}, time.Time{}, errors.New("Both start and end query parameters are required")
	}
	start, e := ParseDateTime(startValue)
	end, endErr := ParseDateTime(endValue)
	if e != nil || endErr != nil {
		return time.Time{}, time.Time{}, errors.New("Calendar range is invalid")
	}
	if !end.After(start) {
		return time.Time{}, time.Time{}, errors.New("Calendar end must be after start")
	}
	if end.Sub(start) > 100*24*time.Hour {
		return time.Time{}, time.Time{}, errors.New("Calendar range cannot exceed 100 days")
	}
	return start, end, nil
}
func Validate(input map[string]any, create bool) (map[string]any, error) {
	if input == nil {
		return nil, &ValidationError{[]Issue{{"body", "Request body must be an object"}}}
	}
	output := map[string]any{}
	issues := []Issue{}
	unknown := []string{}
	for key := range input {
		if _, ok := mutationColumns[key]; !ok {
			unknown = append(unknown, key)
		}
	}
	if len(unknown) > 0 {
		slices.Sort(unknown)
		plural := ""
		if len(unknown) > 1 {
			plural = "s"
		}
		issues = append(issues, Issue{"body", "Unsupported field" + plural + ": " + strings.Join(unknown, ", ")})
	}
	if raw, exists := input["title"]; create || exists {
		title, ok := raw.(string)
		title = strings.TrimSpace(title)
		if !ok || title == "" {
			issues = append(issues, Issue{"title", "Title is required"})
		} else if utf16Length(title) > 120 {
			issues = append(issues, Issue{"title", "Title must be 120 characters or fewer"})
		} else {
			output["title"] = title
		}
	}
	for _, field := range []string{"caption", "notes"} {
		raw, exists := input[field]
		if !exists {
			continue
		}
		if raw == nil || raw == "" {
			output[field] = nil
			continue
		}
		value, ok := raw.(string)
		if !ok {
			issues = append(issues, Issue{field, field + " must be text"})
			continue
		}
		value = strings.TrimSpace(value)
		maximum := 5000
		label := "5,000"
		if field == "notes" {
			maximum = 2000
			label = "2,000"
		}
		if utf16Length(value) > maximum {
			issues = append(issues, Issue{field, fmt.Sprintf("%s must be %s characters or fewer", field, label)})
			continue
		}
		if value == "" {
			output[field] = nil
		} else {
			output[field] = value
		}
	}
	if raw, exists := input["platforms"]; create || exists {
		values, ok := raw.([]any)
		if !ok {
			issues = append(issues, Issue{"platforms", "Choose at least one platform"})
		} else {
			normalized := []string{}
			invalid := len(values) == 0
			for _, value := range values {
				text, ok := value.(string)
				if !ok {
					invalid = true
					continue
				}
				text = strings.ToLower(strings.TrimSpace(text))
				if slices.Contains(normalized, text) || !slices.Contains([]string{"tiktok", "instagram", "youtube", "linkedin"}, text) {
					invalid = true
				}
				normalized = append(normalized, text)
			}
			if invalid {
				issues = append(issues, Issue{"platforms", "Choose one or more supported platforms"})
			} else {
				output["platforms"] = normalized
			}
		}
	}
	if raw, exists := input["status"]; create || exists {
		if create && !exists {
			raw = "draft"
		}
		status, ok := raw.(string)
		if !ok || !slices.Contains([]string{"draft", "scheduled", "published"}, status) {
			issues = append(issues, Issue{"status", "Choose a valid status"})
		} else {
			output["status"] = status
		}
	}
	if raw, exists := input["scheduledAt"]; create || exists {
		value, ok := raw.(string)
		if !ok {
			issues = append(issues, Issue{"scheduledAt", "Choose a date and time with a time zone"})
		} else {
			date, e := ParseDateTime(value)
			if e != nil {
				issues = append(issues, Issue{"scheduledAt", "Choose a valid date and time with a time zone"})
			} else {
				output["scheduledAt"] = date
			}
		}
	}
	if raw, exists := input["clipId"]; exists {
		if raw == nil || raw == "" {
			output["clipId"] = nil
		} else {
			id, ok := raw.(string)
			if !ok || !idPattern.MatchString(id) {
				issues = append(issues, Issue{"clipId", "Choose a valid clip"})
			} else {
				output["clipId"] = strings.ToLower(id)
			}
		}
	}
	if !create && len(output) == 0 && len(issues) == 0 {
		issues = append(issues, Issue{"body", "Provide at least one field to update"})
	}
	if len(issues) > 0 {
		return nil, &ValidationError{issues}
	}
	return output, nil
}
