package stories

import (
	"context"
	"errors"
	"testing"

	"sneepcut/backend-go/internal/story"
)

// signingMedia signs keys as predictable URLs and fails for unknown keys.
type signingMedia struct{}

func (signingMedia) ValidateUploadSource(context.Context, string, string) (string, error) {
	return "", nil
}
func (signingMedia) SignedURL(_ context.Context, key string) (string, error) {
	if key == "" || key == "missing" {
		return "", errors.New("unsigned")
	}
	return "https://media.test/" + key, nil
}
func (signingMedia) DeletePrefix(context.Context, string) error            { return nil }
func (signingMedia) DeleteStudioJob(context.Context, string, string) error { return nil }

func TestAttachClipIDsMapsEveryOutputToItsLibraryRow(t *testing.T) {
	versions := []story.Version{
		{Number: 1, Output: story.Output{Key: "clips/p/story/one/clip.mp4"}},
		{Number: 2, Outputs: []story.ClipOutput{{Index: 0, Key: "a"}, {Index: 1, Key: "b"}}},
	}
	ids := map[int]map[int]string{
		1: {0: "clip-one"},
		2: {0: "clip-two-0", 1: "clip-two-1"},
	}
	attachClipIDs(versions, ids)
	if versions[0].ClipID != "clip-one" || len(versions[0].Outputs) != 1 || versions[0].Outputs[0].ClipID != "clip-one" {
		t.Fatalf("legacy version identity = %+v", versions[0])
	}
	if versions[1].ClipID != "clip-two-0" || versions[1].Outputs[1].ClipID != "clip-two-1" {
		t.Fatalf("multi-clip identities = %+v", versions[1].Outputs)
	}
}

func TestAttachClipIDsLeavesUnsavedVersionsWithoutIdentity(t *testing.T) {
	versions := []story.Version{{Number: 3, Output: story.Output{Key: "clips/p/story/x/clip.mp4"}}}
	attachClipIDs(versions, map[int]map[int]string{})
	if versions[0].ClipID != "" || versions[0].Outputs[0].ClipID != "" {
		t.Fatalf("unsaved version reported a clip: %+v", versions[0])
	}
}

func TestClipOutputViewsExposeSignedMediaWithoutStorageKeys(t *testing.T) {
	h := &Handler{media: signingMedia{}}
	outputs := []story.ClipOutput{
		{ID: "v2-0", Index: 0, Key: "clips/p/story/a/clip.mp4", ThumbnailKey: "clips/p/story/a/thumb.jpg", DurationSeconds: 44, AspectRatio: "9:16", ClipID: "lib-0", Size: 10, Resolution: "1080x1920", Title: "One", TranscriptText: "private words"},
		{ID: "v2-1", Index: 1, Key: "clips/p/story/b/clip.mp4", DurationSeconds: 31, AspectRatio: "9:16", Title: "Two"},
	}
	views := h.clipOutputViews(context.Background(), outputs, true)
	if len(views) != 2 {
		t.Fatalf("views = %d", len(views))
	}
	first := views[0]
	if first["video_url"] != "https://media.test/clips/p/story/a/clip.mp4" || first["poster_url"] != "https://media.test/clips/p/story/a/thumb.jpg" || first["clip_id"] != "lib-0" || first["duration_seconds"] != 44.0 {
		t.Fatalf("first view = %+v", first)
	}
	if _, leaked := first["transcript_text"]; leaked {
		t.Fatalf("transcript leaked into the public view: %+v", first)
	}
	second := views[1]
	if second["clip_id"] != nil || second["poster_url"] != nil {
		t.Fatalf("unsaved clip exposed an identity or poster: %+v", second)
	}
	if _, leaked := second["key"]; leaked {
		t.Fatalf("storage key leaked: %+v", second)
	}
}

func TestClipOutputViewsHidePlaybackUntilVersionIsAccepted(t *testing.T) {
	h := &Handler{media: signingMedia{}}
	views := h.clipOutputViews(context.Background(), []story.ClipOutput{{Index: 0, Key: "clips/p/story/a/clip.mp4"}}, false)
	if views[0]["video_url"] != nil {
		t.Fatalf("draft output was playable: %+v", views[0])
	}
}
