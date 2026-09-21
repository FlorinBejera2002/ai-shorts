package calendar

import (
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/publishing"
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
	for _, body := range []string{strings.Repeat(" ", (128<<10)+1), `{"title":"x"}` + strings.Repeat(" ", 128<<10)} {
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

func TestValidationPreservesMixedCarouselAndReorderedCover(t *testing.T) {
	media := []any{
		map[string]any{"type": "video", "reference": "publishing/user/cover.mp4", "name": "cover.mp4"},
		map[string]any{"type": "image", "reference": "publishing/user/photo.jpg", "name": "photo.jpg"},
		map[string]any{"type": "video", "reference": "publishing/user/last.mp4", "name": "last.mp4"},
	}
	for _, selection := range [][]any{media, {media[2], media[0], media[1]}} {
		out, err := Validate(map[string]any{"media": selection}, false)
		if err != nil {
			t.Fatal(err)
		}
		actual := out["media"].([]map[string]string)
		for i, item := range selection {
			if actual[i]["reference"] != item.(map[string]any)["reference"] {
				t.Fatalf("carousel order changed: %v", actual)
			}
		}
	}
	tooMany := make([]any, 36)
	for i := range tooMany {
		tooMany[i] = media[0]
	}
	if _, err := Validate(map[string]any{"media": tooMany}, false); err == nil {
		t.Fatal("accepted more than 35 carousel items")
	}
}

func TestValidationNormalizesOptionalTikTokSettingsForDrafts(t *testing.T) {
	out, err := Validate(map[string]any{
		"status": "draft",
		"tiktok": map[string]any{
			"privacyLevel":        " SELF_ONLY ",
			"disableComment":      true,
			"musicUsageConfirmed": false,
		},
	}, false)
	if err != nil {
		t.Fatal(err)
	}
	options, ok := out["tiktok"].(publishing.TikTokOptions)
	if !ok || options.PrivacyLevel != "SELF_ONLY" || !options.DisableComment || options.MusicUsageConfirmed {
		t.Fatalf("TikTok settings were not normalized: %#v", out["tiktok"])
	}
	for _, invalid := range []any{
		"private",
		map[string]any{"privacyLevel": true},
		map[string]any{"disableDuet": "false"},
		map[string]any{"privacyLevel": "SELF_ONLY", "unexpected": true},
	} {
		_, err = Validate(map[string]any{"tiktok": invalid}, false)
		var validation *ValidationError
		if !errors.As(err, &validation) || len(validation.Issues) != 1 || validation.Issues[0].Field != "tiktok" {
			t.Fatalf("accepted invalid TikTok settings %#v: %v", invalid, err)
		}
	}
}
