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

// Link-only jobs, including ones queued before link imports were removed, must
// never reach the pipeline.
func TestJobsWithoutOwnedSourceKeyNeverReachPipeline(t *testing.T) {
	pipeline := &importGatePipeline{}
	w := &Worker{Pipeline: pipeline}
	if _, err := w.processInput(context.Background(), processing.Input{}, nil); err == nil || pipeline.calls != 0 {
		t.Fatal("link-only job reached processing")
	}
	if _, err := w.processInput(context.Background(), processing.Input{SourceKey: "uploads/user/original.mp4"}, nil); err != nil || pipeline.calls != 1 {
		t.Fatal("owned upload was incorrectly blocked")
	}
}
