package publishing

import (
	"context"
	"database/sql"
	"net/http"
	"testing"
)

func TestTikTokRejectsInvalidCoverSelectionBeforeProviderRequest(t *testing.T) {
	zero, one, negative, tooMany := 0, 1, -1, 35
	videoZero, videoNegative, tooLarge := int64(0), int64(-1), int64(9007199254740992)
	for _, tc := range []struct {
		kind    string
		options TikTokOptions
	}{
		{"image", TikTokOptions{PhotoCoverIndex: &one}},
		{"image", TikTokOptions{PhotoCoverIndex: &negative}},
		{"image", TikTokOptions{PhotoCoverIndex: &tooMany}},
		{"image", TikTokOptions{VideoCoverTimestampMs: &videoZero}},
		{"video", TikTokOptions{PhotoCoverIndex: &zero}},
		{"video", TikTokOptions{VideoCoverTimestampMs: &videoNegative}},
		{"video", TikTokOptions{VideoCoverTimestampMs: &tooLarge}},
	} {
		client := mockProvider(t, func(http.ResponseWriter, *http.Request) { t.Error("invalid cover reached TikTok") })
		suffix := ".mp4"
		if tc.kind == "image" {
			suffix = ".jpg"
		}
		if _, status, err := client.PublishMedia(context.Background(), "tiktok", "creator", Credentials{}, []PublishMedia{{Type: tc.kind, URL: "https://media.example/file" + suffix}}, "", tc.options, InstagramOptions{}); err == nil || status != "failed" {
			t.Fatalf("invalid cover accepted: %+v", tc)
		}
	}
}

func TestTikTokRejectsCoverTimeOutsideActualVideo(t *testing.T) {
	cover := int64(10000)
	h := &Handler{}
	field, err := h.validateTikTokMediaSelection(context.Background(), Account{}, Credentials{}, 10, sql.NullBool{}, []PublishMedia{{Type: "video"}}, "", TikTokOptions{VideoCoverTimestampMs: &cover})
	if err == nil || field != "tiktok" {
		t.Fatalf("end-of-video cover accepted: %s %v", field, err)
	}
}
