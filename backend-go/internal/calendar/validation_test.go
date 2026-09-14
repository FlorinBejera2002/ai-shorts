package calendar

import (
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
)

func validInput() map[string]any {
	return map[string]any{"title": "  Product launch teaser  ", "caption": "  caption  ", "notes": "  ", "platforms": []any{" TIKTOK ", "instagram"}, "accountIds": []any{"123e4567-e89b-42d3-a456-426614174001"}, "status": "scheduled", "scheduledAt": "2026-09-04T10:30:00+03:00", "clipId": "123e4567-e89b-42d3-a456-426614174000"}
}
func TestValidationMatchesBrowserNormalizationAndDefaults(t *testing.T) {
	input := validInput()
	out, e := Validate(input, true)
	if e != nil {
		t.Fatal(e)
	}
	if out["title"] != "Product launch teaser" || out["caption"] != "caption" || out["notes"] != nil {
		t.Fatal(out)
	}
	platforms := out["platforms"].([]string)
	if strings.Join(platforms, ",") != "tiktok,instagram" {
		t.Fatal(platforms)
	}
	delete(input, "status")
	out, e = Validate(input, true)
	if e != nil || out["status"] != "draft" {
		t.Fatal(out, e)
	}
	input["platforms"] = []any{"facebook"}
	out, e = Validate(input, true)
	if e != nil || strings.Join(out["platforms"].([]string), ",") != "facebook" {
		t.Fatal(out, e)
	}
	out, e = Validate(map[string]any{"clipId": nil, "status": "draft"}, false)
	if e != nil || out["clipId"] != nil || out["status"] != "draft" {
		t.Fatal(out, e)
	}
}
func TestValidationReportsRequiredInvalidAndUnknownFields(t *testing.T) {
	for field, value := range map[string]any{"title": strings.Repeat("😀", 61), "caption": strings.Repeat("x", 5001), "notes": strings.Repeat("x", 2001), "clipId": "123e4567-e89b-02d3-a456-426614174000", "scheduledAt": "2026-09-04T10:30", "status": "queued", "userId": "foreign"} {
		input := validInput()
		input[field] = value
		_, e := Validate(input, true)
		var validation *ValidationError
		if !errors.As(e, &validation) {
			t.Fatalf("accepted %s", field)
		}
		found := false
		for _, issue := range validation.Issues {
			if issue.Field == field || field == "userId" && issue.Field == "body" {
				found = true
			}
		}
		if !found {
			t.Fatalf("field absent: %s %+v", field, validation)
		}
	}
	for _, platforms := range []any{nil, []any{}, []any{"unsupported"}, []any{"tiktok", "tiktok"}, []any{"TikTok", " tiktok "}, []any{"youtube", 42}} {
		input := validInput()
		input["platforms"] = platforms
		if _, e := Validate(input, true); e == nil {
			t.Fatalf("accepted platforms %#v", platforms)
		}
	}
	for _, input := range []map[string]any{nil, {}, {"title": nil}, {"clipId": false}, {"notes": []any{"bad"}}, {"caption": map[string]any{"bad": true}}} {
		if _, e := Validate(input, false); e == nil {
			t.Fatalf("accepted %#v", input)
		}
	}
}
func TestAbsoluteDateTimesRejectNormalizationAndAmbiguity(t *testing.T) {
	for _, value := range []string{"2026-02-30T12:00:00Z", "2025-02-29T12:00:00Z", "2026-09-03Z", "2026-09-03T24:00:00Z", "2026-09-03T12:00:00+14:30", "2026-09-03T12:00:60Z", "2026-09-03T12:00:00-15:00", "0000-01-01T00:00:00Z", "2026-09-03T12:00:00.1234567890Z", "2026-09-03T12:00:00,2Z"} {
		if _, e := ParseDateTime(value); e == nil {
			t.Fatalf("accepted %s", value)
		}
	}
	parsed, e := ParseDateTime("2028-02-29T12:00:00.123456789+03:00")
	if e != nil || isoDate(parsed) != "2028-02-29T09:00:00.123Z" {
		t.Fatal(parsed, e)
	}
}
func TestCalendarRangeIsBoundedAndHalfOpen(t *testing.T) {
	if _, _, e := ParseRange("2026-01-01T00:00:00Z", "2026-04-11T00:00:00Z"); e != nil {
		t.Fatal(e)
	}
	for _, r := range [][2]string{{"", "2026-09-02T00:00:00Z"}, {"not-a-date", "2026-09-02T00:00:00Z"}, {"2026-02-30T00:00:00Z", "2026-03-02T00:00:00Z"}, {"2026-09-02T00:00:00Z", "2026-09-01T00:00:00Z"}, {"2026-09-01T00:00:00Z", "2026-09-01T00:00:00Z"}, {"2026-01-01T00:00:00Z", "2026-04-11T00:00:00.001Z"}} {
		if _, _, e := ParseRange(r[0], r[1]); e == nil {
			t.Fatalf("accepted %v", r)
		}
	}
}
func TestCalendarBodyIsBoundedWithoutTrustingContentLength(t *testing.T) {
	for _, body := range []string{strings.Repeat(" ", 32001), `{"title":"x"}` + strings.Repeat(" ", 32000)} {
		r := httptest.NewRequest("POST", "/api/calendar", strings.NewReader(body))
		r.ContentLength = -1
		w := httptest.NewRecorder()
		if _, ok := readBody(w, r); ok || w.Code != 413 {
			t.Fatalf("oversized body accepted: %d", w.Code)
		}
	}
	for _, body := range []string{"[]", "broken", `{"title":"x"}{"title":"y"}`} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/api/calendar", strings.NewReader(body))
		if _, ok := readBody(w, r); ok || w.Code != 400 {
			t.Fatalf("invalid body accepted: %d", w.Code)
		}
	}
}
