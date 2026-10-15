package processing

import (
	"context"
	"errors"
	"testing"
)

type bridgeAdvice struct {
	reply string
	err   error
	calls int
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
