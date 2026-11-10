package openrouter

import (
	"strings"
	"testing"
)

func TestMediaReviewContentAcceptsTextPartsAndExplainsEmptyReplies(t *testing.T) {
	text, err := mediaReviewContent([]byte(`{"choices":[{"message":{"content":[{"type":"text","text":"{\"candidates\":"},{"type":"text","text":"[]}"}]}}]}`))
	if err != nil || text != `{"candidates":[]}` {
		t.Fatalf("text-part content rejected: %q %v", text, err)
	}
	if text, err = mediaReviewContent([]byte(`{"choices":[{"message":{"content":"ok"}}]}`)); err != nil || text != "ok" {
		t.Fatalf("string content rejected: %q %v", text, err)
	}
	for raw, want := range map[string]string{
		`{"choices":[{"finish_reason":"length","message":{"content":""}}]}`: `finish_reason="length"`,
		`{"error":{"code":413,"message":"private upstream detail"}}`:        "provider error 413",
		`{"choices":[]}`: "no choices",
	} {
		_, err := mediaReviewContent([]byte(raw))
		if err == nil || !strings.Contains(err.Error(), want) || strings.Contains(err.Error(), "private") {
			t.Fatalf("%s: %v", raw, err)
		}
	}
}
