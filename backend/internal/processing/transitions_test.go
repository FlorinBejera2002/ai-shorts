package processing

import (
	"context"
	"encoding/binary"
	"math"
	"os/exec"
	"path/filepath"
	"reflect"
	"sneepcut/backend-go/internal/media"
	"testing"
)

func TestNaturalCutsPreserveWordsAndInput(t *testing.T) {
	input := []Segment{{0, 2.2}, {4.2, 7}}
	transcript := Transcript{Words: []Word{{"end.", 2, 2.4}, {"Hello", 4, 4.5}}}
	segments, decisions := PlanNaturalCuts(input, transcript, 7)
	if !reflect.DeepEqual(segments, []Segment{{0, 2.4}, {4, 7}}) {
		t.Fatalf("speech cut: %#v", segments)
	}
	if input[0].End != 2.2 || input[1].Start != 4.2 {
		t.Fatal("mutated selected segments")
	}
	if len(decisions) != 1 || !decisions[0].SpeechSafe || decisions[0].Strategy != "cut" {
		t.Fatalf("decision: %#v", decisions)
	}
	words := RemapWords(transcript.Words, segments, "cut", 0)
	if len(words) != 2 || math.Abs(words[0].End-2.4) > .00001 || math.Abs(words[1].Start-2.4) > .00001 {
		t.Fatalf("captions drift: %#v", words)
	}
}

func TestRhythmicOnsetsRejectSpeechAndSingleTransient(t *testing.T) {
	pcm := make([]byte, 8000*4*2)
	for _, at := range []float64{.5, 1, 1.5, 2, 2.5, 3} {
		for i := int(at * 8000); i < int((at+.04)*8000); i++ {
			binary.LittleEndian.PutUint16(pcm[i*2:], 12000)
		}
	}
	if len(rhythmicOnsets(pcm, 0, nil)) < 4 {
		t.Fatal("regular onsets missing")
	}
	if len(rhythmicOnsets(pcm, 0, []Word{{"speech", 0, 4}})) != 0 {
		t.Fatal("speech must not become beat evidence")
	}
	if len(rhythmicOnsets(pcm[:8000*2], 0, nil)) != 0 {
		t.Fatal("one onset is not a beat pattern")
	}
}

func TestNaturalRenderAndUnchangedRegeneration(t *testing.T) {
	for _, binary := range []string{"ffmpeg", "ffprobe"} {
		if _, err := exec.LookPath(binary); err != nil {
			t.Skip("requires real FFmpeg and FFprobe")
		}
	}
	dir := t.TempDir()
	storage, err := media.NewLocalStorage(filepath.Join(dir, "media"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = storage.Close() })
	cfg, _ := ConfigFromEnv(func(string) string { return "" })
	p := New(cfg, storage, nil)
	ctx := context.Background()
	source := filepath.Join(dir, "source.mp4")
	if err = p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "color=c=gray:s=320x180:r=30", "-f", "lavfi", "-i", "sine=frequency=440", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", source); err != nil {
		t.Fatal(err)
	}
	if err = storage.Save(ctx, source, "sources/transitions.mp4", "video/mp4"); err != nil {
		t.Fatal(err)
	}
	input := RenderInput{SourceKey: "sources/transitions.mp4", Namespace: "natural", PreserveGeometry: true, NaturalTransitions: true, Segments: []Segment{{0, .65}, {1.15, 2}}, Transcript: Transcript{Words: []Word{{"end.", .5, .7}, {"start", 1.1, 1.3}}}}
	clip, err := p.Render(ctx, input)
	if err != nil {
		t.Fatal(err)
	}
	if math.Abs(clip.Duration-1.6) > .001 || clip.Transition != "cut" {
		t.Fatalf("unexpected result: %#v", clip)
	}
	state := clip.Metadata["transition_state"].(TransitionState)
	if !reflect.DeepEqual(state.Recipe.Segments, input.Segments) {
		t.Fatal("regeneration must retain original bounds")
	}
	state.Recipe.Namespace = "unchanged"
	state.Recipe.Reuse = &clip
	state.Recipe.PreviousDecisions = state.Decisions
	again, err := p.Render(ctx, state.Recipe)
	if err != nil {
		t.Fatal(err)
	}
	if again.StorageKey != clip.StorageKey {
		t.Fatal("unchanged analysis re-encoded the clip")
	}
	file := filepath.Join(dir, "result.mp4")
	if err = p.materialize(ctx, clip.StorageKey, file); err != nil {
		t.Fatal(err)
	}
	info, err := p.probe(ctx, file)
	if err != nil || math.Abs(info.Duration-clip.Duration) > .12 || !info.Audio {
		t.Fatalf("render timing/audio mismatch: %#v %v", info, err)
	}
}

func TestNaturalCutsDoNotOverlapAdjacentSelections(t *testing.T) {
	segments, _ := PlanNaturalCuts([]Segment{{0, 2.2}, {2.3, 5}}, Transcript{Words: []Word{{"word", 2, 2.5}}}, 5)
	if segments[0].End > segments[1].Start {
		t.Fatalf("duplicated source audio: %#v", segments)
	}
}

func TestNaturalCutsStayInsideSourceAndHandleEmptyInputs(t *testing.T) {
	for _, segments := range [][]Segment{nil, {{0, 1}}, {{0, 1}, {3, 4}}} {
		planned, decisions := PlanNaturalCuts(segments, Transcript{}, 4)
		if len(decisions) != max(0, len(segments)-1) {
			t.Fatal("incorrect boundary count")
		}
		if !reflect.DeepEqual(planned, segments) {
			t.Fatalf("changed safe cuts: %#v", planned)
		}
	}
}

func TestFrameDifferenceHandlesUnavailableEvidence(t *testing.T) {
	if frameDifference(nil, nil) != 1 {
		t.Fatal("missing frames must not imply continuity")
	}
	if frameDifference([]byte{0, 255}, []byte{0, 255}) != 0 {
		t.Fatal("identical frames")
	}
	if frameDifference([]byte{0}, []byte{255}) != 1 {
		t.Fatal("different frames")
	}
}
