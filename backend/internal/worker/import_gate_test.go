package worker

import (
	"context"
	"sneepcut/backend-go/internal/processing"
	"testing"
)

type importGatePipeline struct{ calls int }

func (p *importGatePipeline) Process(context.Context, processing.Input, processing.Progress) (processing.Result, error) {
	p.calls++
	return processing.Result{}, nil
}
func (p *importGatePipeline) Render(context.Context, processing.RenderInput) (processing.Clip, error) {
	return processing.Clip{}, nil
}

func TestQueuedYouTubeImportCannotReachDownloaderWithoutApproval(t *testing.T) {
	pipeline := &importGatePipeline{}
	w := &Worker{Pipeline: pipeline}
	input := processing.Input{SourceURL: "https://youtube.com/watch?v=queued-before-policy-change"}
	if _, err := w.processInput(context.Background(), input, nil); err == nil || pipeline.calls != 0 {
		t.Fatal("unapproved queued import reached processing")
	}
	w.YouTubeImportApproved = true
	if _, err := w.processInput(context.Background(), input, nil); err != nil || pipeline.calls != 1 {
		t.Fatal("approved import did not reach processing")
	}
	w.YouTubeImportApproved = false
	input.SourceKey = "uploads/user/original.mp4"
	if _, err := w.processInput(context.Background(), input, nil); err != nil || pipeline.calls != 2 {
		t.Fatal("owned upload was incorrectly blocked")
	}
}
