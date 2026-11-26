package publishing

import (
	"context"
	"sneepcut/backend-go/internal/media"
	"testing"
	"time"
)

type bucketMedia struct{ media.Storage }

func (bucketMedia) SignedURL(context.Context, string, time.Duration) (string, error) {
	return "https://private.hel1.your-objectstorage.com/clips/job/video.mp4?private=signature", nil
}
func TestTikTokUsesOwnedDeliveryURLWithS3Storage(t *testing.T) {
	service := media.NewService(media.Config{AppURL: "https://sneepcut.com", SigningSecret: "synthetic-secret"}, nil, bucketMedia{}, nil, nil)
	h := &Handler{media: service}
	for _, key := range []string{"clips/job/video.mp4", "publishing/owner/photo.webp"} {
		link, err := h.publishingURL(context.Background(), "tiktok", key)
		if err != nil {
			t.Fatal(err)
		}
		if !verifiedMediaURL("https://sneepcut.com/media/", link) {
			t.Fatal("S3-backed TikTok media does not match the owned prefix")
		}
	}
	link, err := h.publishingURL(context.Background(), "instagram", "clips/job/video.mp4")
	if err != nil || verifiedMediaURL("https://sneepcut.com/media/", link) {
		t.Fatal("other providers unexpectedly use the application relay")
	}
}
