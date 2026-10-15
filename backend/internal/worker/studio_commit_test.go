package worker

import (
	"context"
	"errors"
	"sneepcut/backend-go/internal/processing"
	"testing"
)

type recordingStudioCommitter struct {
	Pipeline
	owners, artifacts []string
	err               error
}

func (p *recordingStudioCommitter) CommitStudio(_ context.Context, owner, artifact string) error {
	p.owners = append(p.owners, owner)
	p.artifacts = append(p.artifacts, artifact)
	return p.err
}
func TestStudioCommitPublishesOnlyPrimaryAndPropagatesConflict(t *testing.T) {
	p := &recordingStudioCommitter{}
	w := Worker{Pipeline: p}
	clips := []processing.Clip{{StudioArtifactID: "primary", TikTokStudioArtifactID: "clean"}}
	if err := w.commitStudioClips(context.Background(), "owner", clips); err != nil {
		t.Fatal(err)
	}
	if len(p.artifacts) != 1 || p.artifacts[0] != "primary" || p.owners[0] != "owner" {
		t.Fatal(p)
	}
	p.err = errors.New("newer manual edit")
	if err := w.commitStudioClips(context.Background(), "owner", clips); !errors.Is(err, p.err) {
		t.Fatal("conflict was ignored", err)
	}
	w.Pipeline = nil
	if err := w.commitStudioClips(context.Background(), "owner", clips); err == nil {
		t.Fatal("canonical output published without commit capability")
	}
}
