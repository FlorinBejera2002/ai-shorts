package clips

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"reflect"
	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/processing"
	"sneepcut/backend-go/internal/testdb"
	"sneepcut/backend-go/internal/worker"
	"testing"
)

type stylePipeline struct{ input processing.RenderInput }

func (p *stylePipeline) Process(context.Context, processing.Input, processing.Progress) (processing.Result, error) {
	return processing.Result{}, errors.New("unexpected processing")
}
func (p *stylePipeline) Render(_ context.Context, in processing.RenderInput) (processing.Clip, error) {
	p.input = in
	if in.Reuse != nil {
		clip := *in.Reuse
		clip.Metadata = map[string]any{"transition_state": processing.TransitionState{Recipe: in, Decisions: in.PreviousDecisions}}
		return clip, nil
	}
	return processing.Clip{StorageKey: "clips/" + in.Namespace + "/clip.mp4", ThumbnailKey: "clips/" + in.Namespace + "/thumbnail.jpg", Start: in.Segments[0].Start, End: in.Segments[len(in.Segments)-1].End, Duration: 10, FileSize: 4096, Resolution: "1080x1080", HasSubtitles: in.BurnSubtitles, Segments: in.Segments}, nil
}

func TestAgentTransitionsReuseVerifiedOwnedArtifact(t *testing.T) {
	db := testdb.Open(t)
	user, job, id := seedClip(t, db)
	ctx := context.Background()
	storage := &agentVerifiedMedia{exists: true}
	h := New(db, nil, storage, Config{})
	state := processing.TransitionState{Recipe: processing.RenderInput{SourceKey: "sources/" + job + "/source.mp4", Segments: []processing.Segment{{Start: 0, End: 5}, {Start: 10, End: 15}}}, Decisions: []processing.BoundaryDecision{{Index: 0, Strategy: "cut", SpeechSafe: true}}}
	raw, _ := json.Marshal(state)
	if _, err := db.Exec(`UPDATE clips SET segments='[{"start":0,"end":5,"order":0},{"start":10,"end":15,"order":1}]',transition_state=$2 WHERE id=$1`, id, string(raw)); err != nil {
		t.Fatal(err)
	}
	read, err := h.AgentRead(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	task, err := h.AgentEdit(ctx, user, newID(), id, read.ExpectedState, "transition", json.RawMessage(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	pipeline := &stylePipeline{}
	w := &worker.Worker{Repo: worker.NewRepository(db), Pipeline: pipeline, Storage: styleWorkerStorage{}, Logger: slog.Default()}
	if worked, err := w.Once(ctx); err != nil || !worked {
		t.Fatalf("worker %v %v", worked, err)
	}
	if pipeline.input.Reuse == nil || !pipeline.input.NaturalTransitions {
		t.Fatal("did not use existing transition review path")
	}
	result, err := h.AgentPoll(ctx, user, id, task)
	if err != nil || result.Clip == nil {
		t.Fatalf("reused output %+v %v", result, err)
	}
	if _, err = db.Exec(`UPDATE clips SET file_size=file_size+1 WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	if _, err = h.AgentPoll(ctx, user, id, task); err == nil {
		t.Fatal("accepted changed transition receipt")
	}
}

type styleWorkerStorage struct{ media.Storage }

func (styleWorkerStorage) Delete(context.Context, string) error              { return nil }
func (styleWorkerStorage) DeletePrefix(context.Context, string) (int, error) { return 0, nil }

func TestAgentStyleRunsSharedWorkerAndVerifiesStoredOutput(t *testing.T) {
	db := testdb.Open(t)
	user, job, id := seedClip(t, db)
	ctx := context.Background()
	storage := &agentVerifiedMedia{exists: true}
	h := New(db, nil, storage, Config{})
	read, err := h.AgentRead(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	task, err := h.AgentEdit(ctx, user, newID(), id, read.ExpectedState, "style", json.RawMessage(`{"aspect_ratio":"1:1","burn_subtitles":false}`))
	if err != nil {
		t.Fatal(err)
	}
	pipeline := &stylePipeline{}
	w := &worker.Worker{Repo: worker.NewRepository(db), Pipeline: pipeline, Storage: styleWorkerStorage{}, Logger: slog.Default()}
	if worked, err := w.Once(ctx); err != nil || !worked {
		t.Fatalf("worker %v %v", worked, err)
	}
	if pipeline.input.SourceKey != "sources/"+job+"/source.mp4" || pipeline.input.AspectRatio != "1:1" {
		t.Fatalf("wrong recipe %+v", pipeline.input)
	}
	result, err := h.AgentPoll(ctx, user, id, task)
	if err != nil || result.Clip == nil || result.Pending {
		t.Fatalf("poll %+v %v", result, err)
	}
	var aspect, resolution string
	if err = db.QueryRow(`SELECT aspect_ratio,resolution FROM clips WHERE id=$1`, id).Scan(&aspect, &resolution); err != nil || aspect != "1:1" || resolution != "1080x1080" {
		t.Fatalf("metadata %s %s %v", aspect, resolution, err)
	}
	storage.exists = false
	if _, err = h.AgentPoll(ctx, user, id, task); err == nil {
		t.Fatal("claimed completed with physically missing output")
	}
}

type agentVerifiedMedia struct {
	fakeMedia
	exists  bool
	outage  bool
	checked string
}

func (m *agentVerifiedMedia) Exists(_ context.Context, key string) (bool, error) {
	m.checked = key
	if m.outage {
		return false, errors.New("outage")
	}
	return m.exists, nil
}

func TestAgentExportVerifiesOwnedCurrentPhysicalArtifact(t *testing.T) {
	db := testdb.Open(t)
	user, job, id := seedClip(t, db)
	ctx := context.Background()
	storage := &agentVerifiedMedia{exists: true}
	h := New(db, nil, storage, Config{})
	clip, err := h.AgentRead(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = h.AgentExport(ctx, user, id, clip.ExpectedState); err != nil || storage.checked != "clips/"+job+"/video.mp4" {
		t.Fatalf("export %v %s", err, storage.checked)
	}
	storage.exists = false
	if _, err = h.AgentExport(ctx, user, id, clip.ExpectedState); err == nil {
		t.Fatal("exported missing object")
	}
	storage.exists = true
	storage.outage = true
	if _, err = h.AgentExport(ctx, user, id, clip.ExpectedState); err == nil {
		t.Fatal("claimed verified during outage")
	}
	storage.outage = false
	if _, err = h.AgentExport(ctx, newID(), id, clip.ExpectedState); err == nil {
		t.Fatal("foreign export")
	}
	if _, err = db.Exec(`UPDATE clips SET title='Changed' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	if _, err = h.AgentExport(ctx, user, id, clip.ExpectedState); !errors.Is(err, ErrAgentConflict) {
		t.Fatalf("stale export %v", err)
	}
}

func TestAgentStyleUsesOriginalMappingAfterTrim(t *testing.T) {
	db := testdb.Open(t)
	user, _, id := seedClip(t, db)
	ctx := context.Background()
	h := New(db, nil, nil, Config{})
	if _, err := db.Exec(`UPDATE clips SET segments='[{"start":20,"end":25,"order":0},{"start":40,"end":45,"order":1}]' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	read, err := h.AgentRead(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = h.AgentEdit(ctx, user, newID(), id, read.ExpectedState, "trim", json.RawMessage(`{"start_time":3,"end_time":8}`)); err != nil {
		t.Fatal(err)
	}
	repo := worker.NewRepository(db)
	edit, err := repo.ClaimEdit(ctx)
	if err != nil || edit == nil {
		t.Fatalf("claim %v", err)
	}
	if err = repo.CompleteEdit(ctx, edit, processing.Clip{StorageKey: "clips/trim.mp4", Start: 3, End: 8, Duration: 5, FileSize: 100}, nil); err != nil {
		t.Fatal(err)
	}
	read, err = h.AgentRead(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	task, err := h.AgentEdit(ctx, user, newID(), id, read.ExpectedState, "style", json.RawMessage(`{"aspect_ratio":"1:1","burn_subtitles":false}`))
	if err != nil {
		t.Fatal(err)
	}
	var raw []byte
	if err = db.QueryRow(`SELECT payload FROM edit_deliveries WHERE task_id=$1`, task).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var payload struct {
		Recipe processing.RenderInput `json:"recipe"`
	}
	if err = json.Unmarshal(raw, &payload); err != nil {
		t.Fatal(err)
	}
	want := []processing.Segment{{Start: 23, End: 25}, {Start: 40, End: 43}}
	if !reflect.DeepEqual(payload.Recipe.Segments, want) || payload.Recipe.AspectRatio != "1:1" || payload.Recipe.PreserveGeometry {
		t.Fatalf("wrong source recipe: %+v", payload.Recipe)
	}
	if err = h.AgentCancel(ctx, user, id, task); err != nil {
		t.Fatal(err)
	}
	read, err = h.AgentRead(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = h.AgentEdit(ctx, user, newID(), id, read.ExpectedState, "style", json.RawMessage(`{"burn_subtitles":true}`)); err == nil {
		t.Fatal("invented subtitle timing")
	}
}

func TestAgentStyleRejectsInvalidOptionsAndAmbiguousLegacyTrim(t *testing.T) {
	db := testdb.Open(t)
	user, _, id := seedClip(t, db)
	ctx := context.Background()
	h := New(db, nil, nil, Config{})
	read, err := h.AgentRead(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	for _, body := range []string{`{}`, `{"aspect_ratio":"4:3"}`, `{"subtitle_style":"shell"}`, `{"recipe":{"SourceKey":"other"}}`} {
		if _, err = h.AgentEdit(ctx, user, newID(), id, read.ExpectedState, "style", json.RawMessage(body)); err == nil {
			t.Fatalf("accepted %s", body)
		}
	}
	task, err := h.beginEdit(ctx, user, id, "trim", map[string]any{"start_time": 0, "end_time": 5})
	if err != nil {
		t.Fatal(err)
	}
	repo := worker.NewRepository(db)
	edit, err := repo.ClaimEdit(ctx)
	if err != nil || edit == nil {
		t.Fatal(err)
	}
	if err = repo.CompleteEdit(ctx, edit, processing.Clip{StorageKey: "clips/legacy.mp4", Start: 0, End: 5, Duration: 5, FileSize: 100}, nil); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`UPDATE edit_deliveries SET payload=payload-'source_segments' WHERE task_id=$1`, task); err != nil {
		t.Fatal(err)
	}
	read, err = h.AgentRead(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = h.AgentEdit(ctx, user, newID(), id, read.ExpectedState, "style", json.RawMessage(`{"burn_subtitles":false}`)); err == nil {
		t.Fatal("styled unknown original range")
	}
}
