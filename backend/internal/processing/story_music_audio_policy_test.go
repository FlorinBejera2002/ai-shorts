package processing

import (
	"context"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/music"
	"sneepcut/backend-go/internal/story"
)

func TestMusicOnlyRenderRejectsSourceAudioBeforeMediaAccess(t *testing.T) {
	request := story.Request{ID: "music-only", Options: story.DefaultOptions(), Assets: []story.Asset{{ID: "source", Duration: 8, HasAudio: true}}}
	request.Options.Music = &story.MusicSelection{TrackID: "incompetech:test", SourceAudio: "mute", Volume: .5}
	request.Music = &story.PreparedMusic{Track: music.Track{ID: "incompetech:test", DurationSeconds: 8}, Key: "music/incompetech/test.flac"}
	version := story.Version{Timeline: []story.Entry{{OutputOut: 8, Video: story.Interval{SourceID: "source", Out: 8}, Audio: &story.Interval{SourceID: "source", Out: 8}}}}
	if _, err := validateStoryRender(request, version); err == nil || !strings.Contains(err.Error(), "music-only") {
		t.Fatal("unexpected source audio could enter music-only export", err)
	}
	version.Timeline[0].Audio = nil
	if _, err := validateStoryRender(request, version); err != nil {
		t.Fatal("valid music-only timeline rejected", err)
	}
	version.Timeline[0].Words = []story.Word{{Text: "Muted dialogue", Start: 1, End: 2}}
	if _, err := validateStoryRender(request, version); err == nil {
		t.Fatal("inaudible dialogue could be captioned")
	}
	version.Timeline[0].Words = nil
	request.Assets[0].Candidates = []story.Candidate{{ID: "speech", SourceID: "source", In: 0, Out: 8, Text: "Muted dialogue", Words: []story.Word{{Text: "Muted dialogue", Start: 1, End: 2}}}}
	request.Options.CaptionMode = "selective"
	processor := New(Config{}, storyNoAccessStorage{t: t}, nil)
	selection, err := processor.storyCaptions(context.Background(), t.TempDir(), request, version)
	if err != nil || len(selection.Groups) != 0 || len(selection.IDs) != 0 || len(selection.Warnings) != 0 {
		t.Fatalf("muted source triggered caption analysis or output: %+v %v", selection, err)
	}
}
