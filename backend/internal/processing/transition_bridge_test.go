package processing

import (
	"context"
	"errors"
	"math"
	"os/exec"
	"path/filepath"
	"testing"
)

type bridgeAdvice struct {
	reply string
	err   error
	calls int
}

func TestLocalBridgeRenderPreservesAudioAndDuration(t *testing.T) {
	for _, binary := range []string{"ffmpeg", "ffprobe"} {
		if _, err := exec.LookPath(binary); err != nil {
			t.Skip("requires FFmpeg and FFprobe")
		}
	}
	dir := t.TempDir()
	cfg, _ := ConfigFromEnv(func(string) string { return "" })
	p := New(cfg, nil, &bridgeAdvice{reply: `{"bridge":true}`})
	ctx := context.Background()
	source := filepath.Join(dir, "cut.mp4")
	err := p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", "color=c=0x404040:s=320x180:r=30:d=0.6", "-f", "lavfi", "-i", "color=c=0x606060:s=320x180:r=30:d=0.6", "-f", "lavfi", "-i", "sine=frequency=440:duration=1.2", "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]", "-map", "2:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", source)
	if err != nil {
		t.Fatal(err)
	}
	decisions := []BoundaryDecision{{Index: 0, Score: .75, VisualSimilarity: .7, Motion: .04, SpeechSafe: true, Outgoing: .6, Incoming: 2}}
	output, err := p.applyNaturalBridges(ctx, dir, source, RenderInput{Segments: []Segment{{0, .6}, {2, 2.6}}}, decisions)
	if err != nil {
		t.Fatal(err)
	}
	if output == source || decisions[0].Strategy != "interpolated_bridge" {
		t.Fatalf("valid bridge rejected: %#v", decisions)
	}
	info, err := p.probe(ctx, output)
	if err != nil || math.Abs(info.Duration-1.2) > .1 || !info.Audio {
		t.Fatalf("bridge changed timing/audio: %#v %v", info, err)
	}
}

func (a *bridgeAdvice) Generate(context.Context, string) (string, error) {
	a.calls++
	return a.reply, a.err
}

func TestBridgeAdviceIsSelectiveAndFailsClosed(t *testing.T) {
	d := BoundaryDecision{SpeechSafe: true, VisualSimilarity: .7, Motion: .04, Outgoing: 2, Incoming: 4}
	for _, test := range []struct {
		reply string
		err   error
		want  bool
	}{{`{"bridge":true}`, nil, true}, {`{"bridge":false}`, nil, false}, {`invalid`, nil, false}, {"", errors.New("unavailable"), false}} {
		ai := &bridgeAdvice{reply: test.reply, err: test.err}
		p := &Processor{ai: ai}
		if got := p.approveBridge(context.Background(), d, nil); got != test.want {
			t.Fatalf("%q: %v", test.reply, got)
		}
	}
	ai := &bridgeAdvice{reply: `{"bridge":true}`}
	p := &Processor{ai: ai}
	if p.approveBridge(context.Background(), d, []Word{{"speech", 1.9, 2}}) || ai.calls != 0 {
		t.Fatal("speech must prevent bridge generation")
	}
	d.VisualSimilarity = .98
	if p.approveBridge(context.Background(), d, nil) || ai.calls != 0 {
		t.Fatal("natural cuts must not call the provider")
	}
}

func TestBridgeQualityRejectsArtifactsAndUnimprovedCuts(t *testing.T) {
	frames := func(values ...byte) []byte {
		raw := make([]byte, len(values)*boundaryFrameSize)
		for i, v := range values {
			for j := 0; j < boundaryFrameSize; j++ {
				raw[i*boundaryFrameSize+j] = v
			}
		}
		return raw
	}
	if !bridgeQuality(frames(40, 48, 56, 64, 72, 80)) {
		t.Fatal("smooth candidate rejected")
	}
	for _, raw := range [][]byte{nil, frames(40, 40, 40, 80, 80, 80), frames(40, 50, 255, 60, 70, 80), frames(40, 40, 40, 40, 40, 40)} {
		if bridgeQuality(raw) {
			t.Fatal("unsafe or unhelpful candidate accepted")
		}
	}
}
