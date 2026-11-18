package processing

import (
	"context"
	"errors"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/music"
	"sneepcut/backend-go/internal/story"
)

func TestMusicExcerptUsesSelectedSampleClockAndStableCache(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	ctx := context.Background()
	file := musicExcerptFixture(t, p, dir)
	selection := story.MusicSelection{TrackID: "incompetech:excerpt-fixture", StartSeconds: 2, EndSeconds: 8, Volume: .4, Sync: true}
	track := music.Track{ID: selection.TrackID, Title: "Excerpt fixture", DurationSeconds: 99, BPM: 77}
	prepare := func(selection story.MusicSelection) *story.PreparedMusic {
		t.Helper()
		configureHostedMusicFixture(p, selection.EndSeconds-selection.StartSeconds, 2.31-selection.StartSeconds)
		prepared, err := p.prepareStoryMusicExcerpt(ctx, t.TempDir(), track, "music/incompetech/original-fixture.flac", file, selection)
		if err != nil {
			t.Fatal(err)
		}
		return prepared
	}
	prepared := prepare(selection)
	if math.Abs(prepared.Track.DurationSeconds-6) > 1.0/48000 || prepared.SourceStart != 2 || prepared.SourceEnd != 8 || prepared.Analysis == nil || math.Abs(prepared.Analysis.Duration-6) > .001 {
		t.Fatalf("excerpt clocks disagree: %+v", prepared)
	}
	assertPreparedExcerptAudioPhase(t, p, prepared, .31)
	again := prepare(selection)
	if again.Key != prepared.Key || !reflect.DeepEqual(again.Analysis, prepared.Analysis) {
		t.Fatal("preparing the same excerpt changed its asset identity or timing")
	}
	selection.StartSeconds = 2.1
	shifted := prepare(selection)
	if shifted.Key == prepared.Key || math.Abs(shifted.Track.DurationSeconds-5.9) > 1.0/48000 {
		t.Fatalf("changing the excerpt reused the old interval: %+v", shifted)
	}
	assertPreparedExcerptAudioPhase(t, p, shifted, .21)

	selection.StartSeconds, selection.EndSeconds = 11.5, 14
	if _, err := p.prepareStoryMusicExcerpt(ctx, t.TempDir(), track, "music/incompetech/original-fixture.flac", file, selection); err == nil {
		t.Fatal("excerpt outside the actual recording was accepted")
	}
}

func TestStudioMusicExcerptRepeatAndEndingRemainEditable(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	configureHostedMusicFixture(p, 6, .31)
	p.cfg.MediaSigningSecret = "music-fixture-signing-secret"
	ctx := context.Background()
	file := musicExcerptFixture(t, p, dir)
	selection := story.MusicSelection{TrackID: "incompetech:excerpt-fixture", StartSeconds: 2, EndSeconds: 8, Volume: .4, Sync: true}
	prepared, err := p.prepareStoryMusicExcerpt(ctx, t.TempDir(), music.Track{ID: selection.TrackID}, "music/incompetech/original-fixture.flac", file, selection)
	if err != nil {
		t.Fatal(err)
	}
	for _, repeat := range []bool{false, true} {
		t.Run(map[bool]string{false: "play once", true: "repeat"}[repeat], func(t *testing.T) {
			selected := selection
			selected.Loop = &repeat
			request := story.Request{ID: "music-repeat-fixture", Options: story.Options{Music: &selected}, Music: prepared}
			plan := studioPlan{Width: 320, Height: 180, Duration: 13.5}
			if err := p.studioMusic(ctx, t.TempDir(), request, &plan); err != nil {
				t.Fatal(err)
			}
			wantTracks, wantEnd := 1, 6.0
			if repeat {
				wantTracks, wantEnd = 3, 13.5
			}
			if len(plan.Audio) != wantTracks || len(plan.Assets) != 1 || plan.Assets[0].Kind != "audio" || !plan.Assets[0].HasAudio {
				t.Fatalf("music was flattened or not repeated correctly: tracks=%+v assets=%+v", plan.Audio, plan.Assets)
			}
			at := 0.0
			for i, part := range plan.Audio {
				if part.Start != at || part.SourceIn != 0 || part.Duration != min(6, wantEnd-at) || part.AssetID != plan.Assets[0].ID || part.Volume != .4 {
					t.Fatalf("repeat %d changed the source/output clock: %+v", i, part)
				}
				if len(part.Envelope) < 2 || part.Envelope[0].Time != 0 || part.Envelope[len(part.Envelope)-1].Time != part.Duration {
					t.Fatalf("automation not on the editable track clock: %+v", part)
				}
				if i > 0 {
					previous := plan.Audio[i-1].Envelope
					if math.Abs(previous[len(previous)-1].Value-part.Envelope[0].Value) > .000001 || part.Envelope[0].Value < .39 {
						t.Fatal("loop boundary restarted the fade or introduced a volume gap")
					}
				}
				at += part.Duration
			}
			last := plan.Audio[len(plan.Audio)-1]
			if at != wantEnd || last.Envelope[len(last.Envelope)-1].Value != 0 {
				t.Fatalf("music did not fade at its actual ending: end=%f last=%+v", at, last)
			}
			// Normalization must preserve the excerpt's measured attacks; every
			// repeated editable part starts from this same gapless sample clock.
			normalized, err := p.storyMaterialize(ctx, t.TempDir(), plan.Assets[0].Key)
			if err != nil {
				t.Fatal(err)
			}
			raw, err := run(ctx, "", p.cfg.FFmpegPath, "-v", "error", "-i", normalized, "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1")
			if err != nil {
				t.Fatal(err)
			}
			if len(raw) != 6*16000 {
				t.Fatalf("normalization changed excerpt duration: %d PCM bytes", len(raw))
			}
			assertExcerptBeatPhase(t, analyzeStoryMusic(raw), .31)
		})
	}
}

func TestMusicPreparationRejectsInvalidSelectionsBeforeMediaAccess(t *testing.T) {
	const owner = "11111111-1111-4111-8111-111111111111"
	valid := story.MusicSelection{UploadReference: "uploads/" + owner + "/music.wav", Volume: .4, Sync: true}
	for _, test := range []struct {
		name string
		user string
		edit func(*story.MusicSelection)
	}{
		{"foreign owner", "22222222-2222-4222-8222-222222222222", nil},
		{"missing owner", "", nil},
		{"invalid owner namespace", "../other", nil},
		{"negative start", owner, func(s *story.MusicSelection) { s.StartSeconds = -1 }},
		{"nonfinite start", owner, func(s *story.MusicSelection) { s.StartSeconds = math.NaN() }},
		{"nonfinite end", owner, func(s *story.MusicSelection) { s.EndSeconds = math.Inf(1) }},
		{"backward interval", owner, func(s *story.MusicSelection) { s.StartSeconds, s.EndSeconds = 5, 3 }},
		{"oversized interval", owner, func(s *story.MusicSelection) { s.EndSeconds = 601 }},
		{"too short interval", owner, func(s *story.MusicSelection) { s.EndSeconds = .5 }},
		{"foreign URL", owner, func(s *story.MusicSelection) { s.UploadReference = "https://example.invalid/music.wav" }},
		{"path traversal", owner, func(s *story.MusicSelection) { s.UploadReference = "uploads/" + owner + "/../other/music.wav" }},
		{"mixed source identities", owner, func(s *story.MusicSelection) { s.TrackID = "incompetech:fixture" }},
		{"unsupported extension", owner, func(s *story.MusicSelection) { s.UploadReference = "uploads/" + owner + "/music.exe" }},
	} {
		t.Run(test.name, func(t *testing.T) {
			selection := valid
			if test.edit != nil {
				test.edit(&selection)
			}
			p := New(Config{TempDir: filepath.Join(t.TempDir(), "missing-parent"), FFmpegPath: "must-not-run"}, musicDeniedStorage{t: t}, nil)
			prepared, err := p.PrepareStoryMusicForUser(context.Background(), test.user, selection)
			if err == nil || prepared != nil || err.Error() == storyWorkError("music preparation").Error() {
				t.Fatalf("invalid selection reached media preparation: prepared=%+v err=%v", prepared, err)
			}
		})
	}
}

func TestUploadedMusicPreparationKeepsPrivateCacheWithOwner(t *testing.T) {
	p, storage, dir := storyTestProcessor(t)
	configureHostedMusicFixture(p, 6, .31)
	ctx := context.Background()
	const owner = "11111111-1111-4111-8111-111111111111"
	key := "uploads/" + owner + "/fixture.flac"
	file := musicExcerptFixture(t, p, dir)
	if err := storage.Save(ctx, file, key, "audio/flac"); err != nil {
		t.Fatal(err)
	}
	repeat := false
	selection := story.MusicSelection{UploadReference: key, Title: "My recording", StartSeconds: 2, EndSeconds: 8, Volume: .4, Sync: true, Loop: &repeat}
	prepared, err := p.PrepareStoryMusicForUser(ctx, owner, selection)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(prepared.Key, "uploads/"+owner+"/music-cache/") || prepared.Track.ID != "upload" || prepared.Track.Title != "My recording" || prepared.Repeat || prepared.Track.Attribution != "" {
		t.Fatalf("private recording lost its owner or selection: %+v", prepared)
	}
	assertPreparedExcerptAudioPhase(t, p, prepared, .31)
	// The existing account-cleanup prefix must include decoded derivatives,
	// not only the originally uploaded file. Only disposable fixture media is used.
	if _, err := storage.DeletePrefix(ctx, "uploads/"+owner+"/"); err != nil {
		t.Fatal(err)
	}
	if exists, err := storage.Exists(ctx, prepared.Key); err != nil || exists {
		t.Fatalf("private decoded music survived owner cleanup: exists=%v err=%v", exists, err)
	}
}

func TestUploadedMusicSizeIsCheckedBeforeDownload(t *testing.T) {
	const owner = "11111111-1111-4111-8111-111111111111"
	p := New(Config{TempDir: filepath.Join(t.TempDir(), "missing-parent")}, musicOversizedStorage{musicDeniedStorage{t: t}}, nil)
	selection := story.MusicSelection{UploadReference: "uploads/" + owner + "/large.wav", Volume: .4}
	prepared, err := p.PrepareStoryMusicForUser(context.Background(), owner, selection)
	if err == nil || prepared != nil || !strings.Contains(err.Error(), "128 MiB") {
		t.Fatalf("oversized upload was not rejected before download: prepared=%+v err=%v", prepared, err)
	}
}

func TestUploadedMusicDoesNotInventCatalogAttribution(t *testing.T) {
	request := story.Request{Options: story.Options{Music: &story.MusicSelection{UploadReference: "uploads/user/song.wav", Volume: .4}}, Music: &story.PreparedMusic{
		Track: music.Track{ID: "upload", Title: "My song", License: "User-provided"}, SourceStart: 2, SourceEnd: 8,
	}}
	plan := studioPlan{Duration: 12, Width: 320, Height: 180}
	studioMusicCreditOverlay(request, &plan)
	if len(plan.Overlays) != 0 {
		t.Fatalf("private music acquired a false provider attribution: %+v", plan.Overlays)
	}
	credit := storyMusicCredit(request, story.Version{MusicSync: &story.MusicSync{Status: "partial", Strategy: "accents", Explanation: "Complete moments retained."}})
	if credit.Attribution != "" || credit.SourceURL != "" || credit.LicenseURL != "" || credit.License != "User-provided" || credit.StartSeconds != 2 || credit.EndSeconds != 8 || credit.Strategy != "accents" {
		t.Fatalf("uploaded music metadata changed: %+v", credit)
	}
	request.Music.Track = music.Track{ID: "incompetech:fixture", Title: "Licensed song", Artist: "Kevin MacLeod", Attribution: "Music credit required", License: "CC BY 4.0"}
	studioMusicCreditOverlay(request, &plan)
	if len(plan.Overlays) != 1 || !strings.Contains(plan.Overlays[0].Text, "CC BY 4.0") {
		t.Fatal("catalog attribution was accidentally removed")
	}
}

func musicExcerptFixture(t *testing.T, p *Processor, dir string) string {
	t.Helper()
	attacks := []float64{.1, .6, 1.1, 1.6}
	for at := 2.31; at < 12; at += .5 {
		attacks = append(attacks, at)
	}
	raw := filepath.Join(dir, "music-excerpt-source.s16")
	if err := os.WriteFile(raw, musicPulsePCM(12, attacks), 0600); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(dir, "music-excerpt-source.flac")
	if err := p.ffmpeg(context.Background(), dir, "-f", "s16le", "-ar", "8000", "-ac", "1", "-i", raw, "-ar", "48000", "-ac", "2", "-c:a", "flac", file); err != nil {
		t.Fatal(err)
	}
	return file
}

func assertExcerptBeatPhase(t *testing.T, analysis *story.MusicAnalysis, first float64) {
	t.Helper()
	beats := 0
	for _, event := range analysis.Events {
		if event.Kind == "beat" {
			if beats == 0 && math.Abs(event.Time-first) > .025 {
				t.Fatalf("first excerpt attack is on the wrong clock: got %.3f want %.3f", event.Time, first)
			}
			if math.Abs(math.Remainder(event.Time-first, .5)) > .025 {
				t.Fatalf("excerpt attack has the wrong phase: %+v", event)
			}
			beats++
		}
	}
	if beats < 10 {
		t.Fatalf("excerpt lost measured rhythm: %d beats", beats)
	}
}

func assertPreparedExcerptAudioPhase(t *testing.T, p *Processor, prepared *story.PreparedMusic, first float64) {
	t.Helper()
	if prepared.Analysis == nil || len(prepared.Analysis.Events) != 0 || len(prepared.Analysis.Sections) == 0 {
		t.Fatal("hosted pacing must not supply unqualified beat timestamps")
	}
	file, err := p.storyMaterialize(context.Background(), t.TempDir(), prepared.Key)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := run(context.Background(), "", p.cfg.FFmpegPath, "-v", "error", "-i", file, "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1")
	if err != nil {
		t.Fatal(err)
	}
	// This test-only oracle checks the physical excerpt's audio clock, not the
	// accuracy of the hosted semantic fixture.
	assertExcerptBeatPhase(t, analyzeStoryMusic(raw), first)
}

type musicDeniedStorage struct {
	media.Storage
	t *testing.T
}

func (s musicDeniedStorage) Path(string) (string, error) {
	s.t.Fatal("invalid music selection accessed storage")
	return "", errors.New("unexpected storage read")
}

func (s musicDeniedStorage) Exists(context.Context, string) (bool, error) {
	s.t.Fatal("invalid music selection checked storage")
	return false, errors.New("unexpected storage read")
}

func (s musicDeniedStorage) Size(context.Context, string) (int64, error) {
	s.t.Fatal("invalid music selection checked storage size")
	return 0, errors.New("unexpected storage read")
}

type musicOversizedStorage struct{ musicDeniedStorage }

func (s musicOversizedStorage) Size(context.Context, string) (int64, error) {
	return media.MaxMusicBytes + 1, nil
}
