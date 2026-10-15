package stories

import (
	"context"
	"errors"
	"sneepcut/backend-go/internal/story"
	"sneepcut/backend-go/internal/studiocomposition"
	"testing"
)

func TestStudioCandidatesStayStagedUntilOnlyChosenOutputIsCommitted(t *testing.T) {
	r, user, id, ids := fixture(t, 5)
	ctx := context.Background()
	e := queue(t, r, user, id, ids)
	chosen, rejected := version(id, 1), version(id, 2)
	chosen.Output.StudioArtifactID = newID()
	rejected.Output.StudioArtifactID = newID()
	rejected.Accepted = false
	for _, v := range []story.Version{chosen, rejected} {
		if err := e.SaveVersion(ctx, v); err != nil {
			t.Fatal(err)
		}
	}
	var selected int
	if err := r.db.QueryRow(`SELECT current_version FROM story_projects WHERE id=$1`, id).Scan(&selected); err != nil || selected != 0 {
		t.Fatal("candidate was published before commit", selected, err)
	}
	var committed []string
	commit := func(_ context.Context, owner, artifact string) error {
		if owner != user {
			t.Error("wrong owner")
		}
		committed = append(committed, artifact)
		return nil
	}
	if err := e.finish(ctx, story.Result{Best: chosen}, nil, commit); err != nil {
		t.Fatal(err)
	}
	var artifact string
	if err := r.db.QueryRow(`SELECT story_version,studio_artifact_id::text FROM clips WHERE story_project_id=$1`, id).Scan(&selected, &artifact); err != nil {
		t.Fatal(err)
	}
	if selected != 1 || artifact != chosen.Output.StudioArtifactID || len(committed) != 1 || committed[0] != artifact {
		t.Fatal("wrong candidate published", selected, artifact, committed)
	}
	project, err := r.Get(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	var clipID string
	if err = r.db.QueryRow(`SELECT id::text FROM clips WHERE story_project_id=$1`, id).Scan(&clipID); err != nil {
		t.Fatal(err)
	}
	if len(project.Versions) != 2 || project.Versions[0].ClipID != clipID || project.Versions[1].ClipID != "" {
		t.Fatal("only the published version may open its Studio clip", project.Versions)
	}
}

func TestStudioPublicationConflictPreservesPreviousVersionAndManualWorkspace(t *testing.T) {
	r, user, id, ids := fixture(t, 5)
	ctx := context.Background()
	e := queue(t, r, user, id, ids)
	previous := version(id, 1)
	previous.Output.StudioArtifactID = newID()
	if err := e.SaveVersion(ctx, previous); err != nil {
		t.Fatal(err)
	}
	if err := e.finish(ctx, story.Result{Best: previous}, nil, func(context.Context, string, string) error { return nil }); err != nil {
		t.Fatal(err)
	}
	requestID := newID()
	if err := r.Queue(ctx, user, id, Generate{RequestID: requestID, Version: 1, Action: "improve_flow"}); err != nil {
		t.Fatal(err)
	}
	e, err := r.Claim(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if e.Input.StudioBaseArtifactID != previous.Output.StudioArtifactID || e.Input.StudioOperationID != requestID {
		t.Fatal("missing durable shared lineage", e.Input)
	}
	candidate := version(id, 2)
	candidate.Output.StudioArtifactID = newID()
	if err = e.SaveVersion(ctx, candidate); err != nil {
		t.Fatal(err)
	}
	if err = e.finish(ctx, story.Result{Best: candidate}, nil, func(context.Context, string, string) error { return studiocomposition.ErrProjectChanged }); !errors.Is(err, studiocomposition.ErrProjectChanged) {
		t.Fatal(err)
	}
	var current int
	var artifact, outcome string
	if err = r.db.QueryRow(`SELECT current_version,request->>'outcome' FROM story_projects WHERE id=$1`, id).Scan(&current, &outcome); err != nil {
		t.Fatal(err)
	}
	if err = r.db.QueryRow(`SELECT studio_artifact_id::text FROM clips WHERE story_project_id=$1`, id).Scan(&artifact); err != nil {
		t.Fatal(err)
	}
	if current != 1 || artifact != previous.Output.StudioArtifactID || outcome != "failed" {
		t.Fatal("conflict overwrote published selection", current, artifact, outcome)
	}
}

func TestStudioRegenerationAfterRollbackUsesHistoricalReceiptLineage(t *testing.T) {
	r, user, id, ids := fixture(t, 5)
	ctx := context.Background()
	e := queue(t, r, user, id, ids)
	first, second := version(id, 1), version(id, 2)
	first.Output.StudioArtifactID = newID()
	second.Output.StudioArtifactID = newID()
	for _, v := range []story.Version{first, second} {
		if err := e.SaveVersion(ctx, v); err != nil {
			t.Fatal(err)
		}
	}
	commits := 0
	if err := e.finish(ctx, story.Result{Best: second}, nil, func(context.Context, string, string) error { commits++; return nil }); err != nil {
		t.Fatal(err)
	}
	if err := r.Rollback(ctx, user, id, 1, newID()); err != nil {
		t.Fatal(err)
	}
	requestID := newID()
	if err := r.Queue(ctx, user, id, Generate{RequestID: requestID, Version: 1, Action: "improve_flow"}); err != nil {
		t.Fatal(err)
	}
	next, err := r.Claim(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if commits != 1 || next.Input.StudioBaseArtifactID != first.Output.StudioArtifactID || next.Input.StudioOperationID != requestID {
		t.Fatal("rollback replaced workspace instead of retaining receipt lineage", commits, next.Input)
	}
}
