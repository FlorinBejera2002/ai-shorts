package story

import (
	"encoding/json"
	"math"
	"strings"
	"testing"
)

func TestMusicExcerptsAndPrivateSelectionValidation(t *testing.T) {
	valid := MusicSelection{UploadReference: "uploads/00000000-0000-4000-8000-000000000001/song.flac", Volume: .2, Sync: true, StartSeconds: 30, EndSeconds: 60}
	if err := validateMusicSelection(&valid); err != nil {
		t.Fatal(err)
	}
	for _, edit := range []func(*MusicSelection){
		func(s *MusicSelection) { s.StartSeconds = -1 }, func(s *MusicSelection) { s.StartSeconds = math.NaN() },
		func(s *MusicSelection) { s.EndSeconds = 30.5 }, func(s *MusicSelection) { s.EndSeconds = 631 },
		func(s *MusicSelection) { s.UploadReference = "https://example.invalid/audio.mp3" },
		func(s *MusicSelection) { s.UploadReference = "uploads/owner/../other/song.wav" },
		func(s *MusicSelection) { s.TrackID = "incompetech:test" },
		func(s *MusicSelection) { s.SourceAudio = "guess" },
	} {
		bad := valid
		edit(&bad)
		if validateMusicSelection(&bad) == nil {
			t.Fatalf("accepted invalid selection: %+v", bad)
		}
	}
	options := DefaultOptions()
	options.Music = &valid
	encoded, err := json.Marshal(EditorialOptions(options))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), "uploads/") || strings.Contains(string(encoded), "00000000-0000") {
		t.Fatal("private owner reference leaked to editorial model")
	}
	if options.Music.UploadReference != valid.UploadReference {
		t.Fatal("sanitizing prompt mutated saved options")
	}
	brief := BuildEditingBrief(Request{Options: options})
	if !brief.SelectedSettings.MusicSelected || !brief.SelectedSettings.MusicSync {
		t.Fatal("selected music omitted from explicit editing intent")
	}
}

func TestMusicOnlyAudioRequiresExplicitSelection(t *testing.T) {
	if UsesMusicOnlyAudio(Options{}) {
		t.Fatal("absent music muted source audio")
	}
	for _, mode := range []string{"", "preserve", "mute"} {
		options := Options{Music: &MusicSelection{TrackID: "incompetech:fixture", Volume: .4, SourceAudio: mode}}
		if err := validateMusicSelection(options.Music); err != nil {
			t.Fatal(err)
		}
		if UsesMusicOnlyAudio(options) != (mode == "mute") {
			t.Fatalf("source audio permission changed for %q", mode)
		}
	}
}
