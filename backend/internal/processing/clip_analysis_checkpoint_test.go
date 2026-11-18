package processing

import (
	"context"
	"path/filepath"
	"testing"

	"sneepcut/backend-go/internal/media"
)

func TestClipAnalysisCheckpointRoundTripAndInvalidation(t *testing.T) {
	dir := t.TempDir()
	storage, err := media.NewLocalStorage(filepath.Join(dir, "media"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = storage.Close() })
	cfg, _ := ConfigFromEnv(func(string) string { return "" })
	processor := New(cfg, storage, nil)
	ctx := context.Background()
	in := Input{Namespace: "job/attempts/one", Language: "ro", RequestedClips: 3, Instructions: "funny moments"}
	key, digest := processor.clipAnalysisKey(in, "job", "source-hash", 120)
	if _, ok := processor.loadClipAnalysis(ctx, dir, key, digest); ok {
		t.Fatal("missing checkpoint was reported as saved")
	}
	saved := clipAnalysis{Digest: digest, Transcript: Transcript{Text: "salut lume", Duration: 120, Words: []Word{{"salut", 1, 1.4}, {"lume", 1.5, 2}}}, Highlights: []highlight{{Title: "Hook", Score: 8, Segments: []Segment{{Start: 1, End: 40}}}}}
	processor.saveClipAnalysis(ctx, dir, key, saved)
	loaded, ok := processor.loadClipAnalysis(ctx, dir, key, digest)
	if !ok || loaded.Transcript.Text != "salut lume" || len(loaded.Transcript.Words) != 2 || len(loaded.Highlights) != 1 || loaded.Highlights[0].Segments[0].End != 40 {
		t.Fatalf("checkpoint did not round-trip: %+v %v", loaded, ok)
	}
	// A retry with another attempt token reuses the job-scoped checkpoint.
	retry := in
	retry.Namespace = "job/attempts/two"
	if retryKey, retryDigest := processor.clipAnalysisKey(retry, "job", "source-hash", 120); retryKey != key || retryDigest != digest {
		t.Fatal("attempt token changed the analysis checkpoint")
	}
	// Inputs that change the transcript or highlight choice never match it.
	changed := []Input{in, in, in}
	changed[0].RequestedClips = 4
	changed[1].Instructions = "serious moments"
	changed[2].Language = "en"
	for _, variant := range changed {
		if otherKey, _ := processor.clipAnalysisKey(variant, "job", "source-hash", 120); otherKey == key {
			t.Fatalf("stale checkpoint matched changed input %+v", variant)
		}
	}
	if otherKey, _ := processor.clipAnalysisKey(in, "job", "other-source", 120); otherKey == key {
		t.Fatal("stale checkpoint matched another source")
	}
	if _, ok := processor.loadClipAnalysis(ctx, dir, key, "other-digest"); ok {
		t.Fatal("checkpoint accepted a mismatched digest")
	}
}
