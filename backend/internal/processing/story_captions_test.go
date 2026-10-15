package processing

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestStorySelectiveCaptionsRequireAudibleEvidenceAndVerifiedWords(t *testing.T) {
	phrases := []storyCaptionPhrase{{ID: "quiet-clear"}, {ID: "masked"}, {ID: "uncertain"}}
	findings, err := parseStoryAudibility(`{"candidates":[
		{"candidate_id":"quiet-clear","status":"clear","reason":"Quiet voice is distinct from the background.","confidence":0.95,"words_verified":true},
		{"candidate_id":"masked","status":"difficult","reason":"Music masks consonants but the full phrase can be confirmed.","confidence":0.94,"words_verified":true},
		{"candidate_id":"uncertain","status":"difficult","reason":"Overlapping voices obscure the actual words.","confidence":0.96,"words_verified":false}
	]}`, phrases)
	if err != nil || findings["quiet-clear"].Status != "clear" || findings["masked"].Status != "difficult" || findings["uncertain"].Status != "unknown" {
		t.Fatalf("audibility/transcript uncertainty conflated: %#v %v", findings, err)
	}
	clearUnverified, err := parseStoryAudibility(`{"candidates":[{"candidate_id":"quiet-clear","status":"clear","reason":"Voice is audible but words cannot be confirmed.","confidence":0.96,"words_verified":false}]}`, phrases)
	if err != nil || clearUnverified["quiet-clear"].Status != "unknown" {
		t.Fatalf("unverified clear finding bypassed review: %#v %v", clearUnverified, err)
	}
	for _, raw := range []string{
		`{"candidates":[{"candidate_id":"unknown-source","status":"difficult","reason":"Actual noise evidence.","confidence":1,"words_verified":true}]}`,
		`{"candidates":[{"candidate_id":"masked","status":"difficult","reason":"Actual noise evidence.","confidence":1,"words_verified":true,"invented_words":"hello"}]}`,
		`{"candidates":[{"candidate_id":"masked","status":"clear","reason":"Clear voice evidence.","confidence":1,"words_verified":true},{"candidate_id":"masked","status":"difficult","reason":"Noise evidence.","confidence":1,"words_verified":true}]}`,
	} {
		if _, err := parseStoryAudibility(raw, phrases); err == nil {
			t.Fatal("accepted unsupported audibility evidence", raw)
		}
	}
}

func TestStoryCaptionCuesKeepWholePhraseWithoutFlashingFragments(t *testing.T) {
	file := filepath.Join(t.TempDir(), "captions.srt")
	groups := [][]Word{{
		{Text: "Nu", Start: .1, End: .22}, {Text: "schimba", Start: .22, End: .5},
		{Text: "sensul", Start: .5, End: .8}, {Text: "acestei", Start: .8, End: 1.1}, {Text: "propoziții.", Start: 1.1, End: 1.6},
	}, {{Text: "Da.", Start: 2.5, End: 2.7}}}
	if err := writeStorySRT(file, groups, 4); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(file)
	text := string(raw)
	if strings.Count(text, " --> ") != 2 || !strings.Contains(text, "Nu schimba sensul acestei propoziții.") || !strings.Contains(text, "00:00:02,500 --> 00:00:03,050") {
		t.Fatalf("fragmented natural caption or too-short cue: %s", text)
	}
	if strings.Contains(text, "00:00:00,100 --> 00:00:02,") {
		t.Fatal("caption covered expressive pause")
	}
}

func TestStoryCaptionPhraseUsesWordsRatherThanOverlappingPadding(t *testing.T) {
	phrases := []storyCaptionPhrase{
		{ID: "difficult", SourceID: "voice", In: 0, Out: 2.2, Words: []story.Word{{Text: "Da.", Start: 1, End: 1.5}}},
		{ID: "clear", SourceID: "voice", In: 1.8, Out: 3, Words: []story.Word{{Text: "Da.", Start: 2, End: 2.5}}},
	}
	entry := story.Entry{CandidateID: "visual-only", OutputIn: 0, OutputOut: 3, Audio: &story.Interval{SourceID: "voice", Out: 3}}
	if got := storyCaptionPhraseID(entry, story.Word{Text: "Da.", Start: 2, End: 2.5}, phrases); got != "clear" {
		t.Fatalf("clear speech inherited prior difficult phrase's padding: %s", got)
	}
}

func TestStoryRendersAllSelectiveAndOffWithOriginalMixedMedia(t *testing.T) {
	p, storage, dir := storyTestProcessor(t)
	ctx := context.Background()
	var assets []story.Asset
	texts := []string{"The quiet recording is still clear.", "The original voice remains unchanged."}
	for i, id := range []string{"quiet-clear", "noise-masked"} {
		file := filepath.Join(dir, id+".mp4")
		video := "color=c=red:s=320x180:r=24,drawbox=x=0:y=0:w=18:h=ih:color=lime:t=fill"
		if i == 1 {
			video = "color=c=blue:s=180x320:r=60,drawbox=x=0:y=0:w=18:h=ih:color=lime:t=fill"
		}
		args := []string{"-f", "lavfi", "-i", video}
		voiceName := []string{"clear.wav", "difficult.wav"}[i]
		voice := filepath.Join(os.Getenv("SNEEPCUT_STORY_SPEECH_DIR"), voiceName)
		if os.Getenv("SNEEPCUT_STORY_SPEECH_DIR") != "" {
			args = append(args, "-i", voice)
		} else {
			// CI tone fallback tests deterministic rendering, never semantic
			// speech quality. Retained user-review artifacts require real speech.
			if os.Getenv("SNEEPCUT_STORY_EVIDENCE_DIR") != "" {
				t.Fatal("retained evidence requires the spoken synthetic fixture")
			}
			args = append(args, "-f", "lavfi", "-i", fmt.Sprintf("sine=frequency=%d:sample_rate=48000:duration=2.8", 440+i*440))
		}
		filter := "[1:a]volume=0.12,apad,atrim=duration=4[a]"
		if i == 1 {
			args = append(args, "-f", "lavfi", "-i", "anoisesrc=d=4:c=pink:a=0.12:r=48000:seed=42")
			filter = "[1:a]apad,atrim=duration=4[voice];[voice][2:a]amix=inputs=2:normalize=0[a]"
		}
		args = append(args, "-filter_complex", filter, "-map", "0:v", "-map", "[a]", "-t", "4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", file)
		if err := p.ffmpeg(ctx, dir, args...); err != nil {
			t.Fatal(err)
		}
		key := "sources/fidelity/" + id + ".mp4"
		if err := p.storage.Save(ctx, file, key, "video/mp4"); err != nil {
			t.Fatal(err)
		}
		asset, err := p.Inspect(ctx, key)
		if err != nil {
			t.Fatal(err)
		}
		asset.ID, asset.Name, asset.Order = id, id, i
		// Deliberately give the quiet/clear phrase lower ASR and level scores.
		// Selective decisions must follow listening, not either numeric score.
		asset.Candidates = []story.Candidate{{ID: id + "-phrase", SourceID: id, In: 0, Out: 4, Text: texts[i], Words: []story.Word{{Text: texts[i], Start: .05, End: 2.8}}, Confidence: .6 + float64(i)*.35, AudioScore: .1 + float64(i)*.8}}
		assets = append(assets, asset)
	}
	plan := story.Plan{Blocks: []story.Block{{ID: "first", CandidateID: "quiet-clear-phrase", Crop: "fit"}, {ID: "second", CandidateID: "noise-masked-phrase", Crop: "fit"}}}
	timeline, err := story.BuildTimeline(plan, assets)
	if err != nil {
		t.Fatal(err)
	}
	request := story.Request{ID: "fidelity-modes", Options: story.Options{AspectRatio: "9:16"}, Assets: assets}
	version := story.Version{Number: 1, Plan: plan, Timeline: timeline}
	reviewer := &storyReviewMock{result: `{"candidates":[{"candidate_id":"quiet-clear-phrase","status":"clear","reason":"Quiet but distinct voice in a clean original mix.","confidence":0.98,"words_verified":true},{"candidate_id":"noise-masked-phrase","status":"difficult","reason":"Pink background noise masks articulation while the phrase remains recoverable.","confidence":0.98,"words_verified":true}]}`}
	p.ai = reviewer
	outputs := map[string]string{}
	metrics := map[string]any{"audibility_reviewer": "mocked; explicit clear/difficult source evidence", "speech_fixture": os.Getenv("SNEEPCUT_STORY_SPEECH_DIR") != "", "source_speed": "unchanged; 4s + 4s = 8s", "source_frames": "320x180 at 24fps; 180x320 at 60fps", "audio_gain_db": map[string]float64{}, "audio_correlation": map[string]float64{}, "audio_offset_ms": map[string]float64{}}
	for _, mode := range []string{"all", "selective", "off"} {
		request.Options.CaptionMode = mode
		output, err := renderStoryForTest(t, p, ctx, request, version)
		if err != nil {
			t.Fatal(mode, err)
		}
		if output.CaptionMode != mode || output.Captions != (mode != "off") || len(output.CaptionWarnings) != 0 || math.Abs(output.Duration-8) > .08 {
			t.Fatalf("%s mode/duration/metadata: %#v", mode, output)
		}
		if mode == "selective" && (len(output.CaptionedCandidateIDs) != 1 || output.CaptionedCandidateIDs[0] != "noise-masked-phrase") {
			t.Fatalf("selected quiet source from its low score: %#v", output)
		}
		file, err := p.storyMaterialize(ctx, dir, output.Key)
		if err != nil || p.decodeStory(ctx, file) != nil {
			t.Fatal("render did not decode", err)
		}
		outputs[mode] = file
		for i, sample := range []float64{1, 5} {
			pixels, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-ss", seconds(sample), "-i", file, "-frames:v", "1", "-vf", "scale=270:480", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
			if err != nil {
				t.Fatal(err)
			}
			white := 0
			firstRow, lastRow := 480, 0
			for j := 0; j+2 < len(pixels); j += 3 {
				if pixels[j] > 180 && pixels[j+1] > 180 && pixels[j+2] > 180 {
					white++
					firstRow, lastRow = min(firstRow, j/3/270), max(lastRow, j/3/270)
				}
			}
			wantCaption := mode == "all" || mode == "selective" && i == 1
			if (white > 5) != wantCaption {
				t.Fatalf("%s actual caption pixels at %.1fs: %d, expected caption %v", mode, sample, white, wantCaption)
			}
			if wantCaption && (firstRow < 390 || lastRow-firstRow > 45 || lastRow > 455) {
				t.Fatalf("%s portrait caption missed readable bottom safe area: rows %d..%d", mode, firstRow, lastRow)
			}
			center := (240*270 + 135) * 3
			edge := (240*270 + 4) * 3
			if i == 0 && (pixels[center] < 180 || pixels[center+2] > 80) || i == 1 && (pixels[center+2] < 180 || pixels[center] > 80) || pixels[edge+1] < 180 {
				t.Fatalf("%s source order or full-frame left marker was lost at %.1fs", mode, sample)
			}
		}
	}
	if reviewer.calls != 1 || storage.segments != 2 || len(reviewer.parts) != 2 || !strings.Contains(reviewer.prompt, "Low volume alone is NOT difficult") {
		t.Fatalf("modes failed to reuse source rendering or use listening evidence: calls %d, segments %d, parts %d", reviewer.calls, storage.segments, len(reviewer.parts))
	}
	for i, asset := range assets {
		source, _ := p.storyMaterialize(ctx, dir, asset.Key)
		decode := func(file string, start float64) []float64 {
			// Compare in the same delivery channel layout. FFmpeg's normal
			// mono-to-stereo power mapping is -3dB per channel, not loudness
			// processing, and must also be applied to the source reference.
			raw, err := run(ctx, dir, p.cfg.FFmpegPath, "-v", "error", "-ss", seconds(start), "-i", file, "-t", "2", "-vn", "-af", "aformat=channel_layouts=stereo,pan=mono|c0=0.5*c0+0.5*c1", "-ar", "16000", "-f", "s16le", "-")
			if err != nil || len(raw) == 0 {
				t.Fatal("audio evidence missing", err)
			}
			samples := make([]float64, len(raw)/2)
			for j := 0; j+1 < len(raw); j += 2 {
				samples[j/2] = float64(int16(binary.LittleEndian.Uint16(raw[j:j+2]))) / 32768
			}
			return samples
		}
		rms := func(samples []float64) float64 {
			energy := 0.0
			for _, sample := range samples {
				energy += sample * sample
			}
			return math.Sqrt(energy / float64(len(samples)))
		}
		original, rendered := decode(source, .3), decode(outputs["off"], float64(i)*4+.3)
		gain := 20 * math.Log10(rms(rendered)/rms(original))
		if math.Abs(gain) > 1 {
			t.Fatalf("source dynamics changed for %s: %.2fdB gain", asset.ID, gain)
		}
		metrics["audio_gain_db"].(map[string]float64)[asset.ID] = gain
		correlation, lag := storyFixtureCorrelation(original, rendered)
		if correlation < .85 || math.Abs(float64(lag)/16) > 40 {
			t.Fatalf("original voice/clock changed for %s: correlation %.3f, offset %.2fms", asset.ID, correlation, float64(lag)/16)
		}
		metrics["audio_correlation"].(map[string]float64)[asset.ID] = correlation
		metrics["audio_offset_ms"].(map[string]float64)[asset.ID] = float64(lag) / 16
	}
	if evidence := os.Getenv("SNEEPCUT_STORY_EVIDENCE_DIR"); evidence != "" {
		if err := os.MkdirAll(evidence, 0755); err != nil {
			t.Fatal(err)
		}
		for mode, file := range outputs {
			data, err := os.ReadFile(file)
			if err != nil || os.WriteFile(filepath.Join(evidence, mode+".mp4"), data, 0600) != nil {
				t.Fatal("save video evidence", err)
			}
			for i, at := range []float64{1, 5} {
				if err := p.ffmpeg(ctx, dir, "-ss", seconds(at), "-i", file, "-frames:v", "1", "-vf", "scale=270:480", filepath.Join(evidence, fmt.Sprintf("%s-%d.jpg", mode, i+1))); err != nil {
					t.Fatal(err)
				}
			}
		}
		for _, asset := range assets {
			file, err := p.storyMaterialize(ctx, dir, asset.Key)
			if err != nil {
				t.Fatal(err)
			}
			data, err := os.ReadFile(file)
			if err != nil || os.WriteFile(filepath.Join(evidence, "source-"+asset.ID+".mp4"), data, 0600) != nil {
				t.Fatal("save source evidence", err)
			}
		}
		data, _ := json.MarshalIndent(metrics, "", "  ")
		if err := os.WriteFile(filepath.Join(evidence, "verification.json"), data, 0600); err != nil {
			t.Fatal(err)
		}
	}
}

func storyFixtureCorrelation(original, rendered []float64) (float64, int) {
	best, offset := -1.0, 0
	for lag := -800; lag <= 800; lag++ {
		var cross, sourcePower, outputPower float64
		start, end := max(0, -lag), min(len(original), len(rendered)-lag)
		for i := start; i < end; i += 4 {
			a, b := original[i], rendered[i+lag]
			cross += a * b
			sourcePower += a * a
			outputPower += b * b
		}
		if sourcePower == 0 || outputPower == 0 {
			continue
		}
		correlation := cross / math.Sqrt(sourcePower*outputPower)
		if correlation > best {
			best, offset = correlation, lag
		}
	}
	return best, offset
}

func TestStorySelectiveCaptionsUnavailableWithholdsAndExplains(t *testing.T) {
	request := story.Request{Options: story.Options{CaptionMode: "selective"}, Assets: []story.Asset{{ID: "a", Candidates: []story.Candidate{{ID: "phrase", SourceID: "a", In: 0, Out: 2, Text: "Known words", Words: []story.Word{{Text: "Known words", Start: .2, End: 1.5}}}}}}}
	version := story.Version{Timeline: []story.Entry{{BlockID: "one", CandidateID: "phrase", OutputOut: 2, Audio: &story.Interval{SourceID: "a", Out: 2}, Words: []story.Word{{Text: "Known words", Start: .2, End: 1.5}}}}}
	p := &Processor{}
	selection, err := p.storyCaptions(context.Background(), t.TempDir(), request, version)
	if err != nil || len(selection.Groups) != 0 || len(selection.Warnings) == 0 {
		t.Fatalf("unavailable selective review silently substituted mode: %#v %v", selection, err)
	}
}
