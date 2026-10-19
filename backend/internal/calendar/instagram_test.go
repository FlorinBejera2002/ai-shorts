package calendar

import (
	"encoding/json"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/publishing"
)

func TestInstagramMetadataValidationAndPersistenceEncoding(t *testing.T) {
	var input map[string]any
	err := json.Unmarshal([]byte(`{"media":[{"type":"image","reference":"publishing/user/original.png","name":"photo","altText":"Bicycle 🚲","crop":{"aspectRatio":"4:5","x":0.25,"y":0.75,"zoom":2},"userTags":[{"username":"alice","x":0.4,"y":0.6}]}],"instagram":{"shareToFeed":true,"locationId":"123456","collaborators":["bob"],"isAiGenerated":true}}`), &input)
	if err != nil {
		t.Fatal(err)
	}
	validated, err := Validate(input, false)
	if err != nil {
		t.Fatal(err)
	}
	items := validated["media"].([]publishing.MediaAttachment)
	options := validated["instagram"].(publishing.InstagramOptions)
	if items[0].AltText != "Bicycle 🚲" || items[0].Crop.X != .25 || items[0].UserTags[0].Username != "alice" {
		t.Fatalf("metadata lost %+v", items)
	}
	raw := encodeInstagramOptions(options)
	var loaded publishing.InstagramOptions
	if err := json.Unmarshal(raw, &loaded); err != nil || loaded.LocationID != "123456" || len(loaded.Collaborators) != 1 || !loaded.IsAIGenerated {
		t.Fatalf("options lost: %s %v", raw, err)
	}
	if loaded.CommentEnabled != nil {
		t.Fatal("unspecified comments turned into a disabled setting")
	}
}

func TestInstagramRejectsInvalidPhotoFields(t *testing.T) {
	for _, extra := range []string{
		`"crop":{"aspectRatio":"1:1","zoom":1}`,
		`"crop":{"aspectRatio":"1:1","x":0.5,"y":0.5,"zoom":4}`,
		`"userTags":[{"username":"alice"}]`,
		`"userTags":[{"username":"alice","x":0.5,"y":0.5},{"username":"ALICE","x":0.2,"y":0.2}]`,
		`"altText":42`,
		`"unsupported":true`,
	} {
		var input map[string]any
		if err := json.Unmarshal([]byte(`{"media":[{"type":"image","reference":"publishing/user/image.png","name":"photo",`+extra+`}]}`), &input); err != nil {
			t.Fatal(err)
		}
		if _, err := Validate(input, false); err == nil {
			t.Fatalf("invalid fields accepted: %s", extra)
		}
	}
	for _, size := range []int{1000, 1001} {
		_, err := Validate(map[string]any{"media": []any{map[string]any{"type": "image", "reference": "publishing/user/image.png", "name": "photo", "altText": strings.Repeat("🚲", size)}}}, false)
		if (err == nil) != (size == 1000) {
			t.Fatalf("Unicode text limit %d: %v", size, err)
		}
	}
}
