package jobs

import "testing"

func TestDecodeOptionsAppliesPostJobsRules(t *testing.T) {
	options, err := DecodeOptions([]byte(`{"num_clips_requested":3,"aspect_ratio":"1:1"}`))
	if err != nil {
		t.Fatal(err)
	}
	if options.NumClips != 3 || options.AspectRatio != "1:1" || options.SubtitleStyle != "default" || !options.BurnSubtitles {
		t.Fatalf("defaults were not kept for absent fields: %+v", options)
	}
	for _, raw := range []string{
		`{"source_type":"upload"}`,
		`{"source_storage_key":"uploads/owner/a.mp4"}`,
		`{"num_clips_requested":31}`,
		`{"aspect_ratio":"4:3"}`,
		`{"num_clips_requested":3} {}`,
		`not json`,
	} {
		if _, err := DecodeOptions([]byte(raw)); err == nil {
			t.Fatalf("expected rejection for %s", raw)
		}
	}
}
