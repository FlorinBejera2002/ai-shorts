package story

import (
	"math"
	"reflect"
	"slices"
	"strings"
	"testing"
)

func continuationFixture() (Request, Plan) {
	req := fixtureRequest()
	req.Options.PreserveOrder = true
	req.Assets[0].ID, req.Assets[0].Duration = "source-001", 3.52
	req.Assets[0].Candidates = []Candidate{
		{ID: "source-001-g1", SourceID: "source-001", In: 0, Out: 2.51, Role: "b_roll"},
		{ID: "source-001-s1", SourceID: "source-001", In: 2.51, Out: 3.52, Role: "b_roll", Confidence: .113599, Reason: "Automatic phrase transcription withheld; original audio is unchanged."},
	}
	req.Assets = append(req.Assets, Asset{ID: "scene", Key: "sources/scene.mov", Order: 1, Duration: 12, Width: 1920, Height: 1080, Size: 100, Candidates: []Candidate{{ID: "scene-v1", SourceID: "scene", In: 0, Out: 2, Role: "b_roll"}}})
	return req, Plan{Blocks: []Block{{ID: "anchor", CandidateID: "source-001-g1", Crop: "fit"}, {ID: "tail", CandidateID: "scene-v1", Crop: "fit"}}}
}

func continuationIDs(plan Plan) []string {
	var ids []string
	for _, block := range plan.Blocks {
		ids = append(ids, block.CandidateID)
	}
	return ids
}

func TestContextRepairRestoresFollowingCutOffSpeechInOriginalAudioOrder(t *testing.T) {
	req, plan := continuationFixture()
	original := clonePlan(plan)
	updated, err := applyOperation(plan, repairOperation{"restore_context", "anchor", "source-001-s1"}, req.Assets)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(continuationIDs(updated), []string{"source-001-g1", "source-001-s1", "scene-v1"}) {
		t.Fatalf("following utterance was inserted before its beginning: %v", continuationIDs(updated))
	}
	if issues := ValidatePlan(updated, req.Assets, req.Options, nil); hasBlocking(issues) {
		t.Fatalf("source continuation violated deterministic chronology: %+v", issues)
	}
	timeline, err := BuildTimeline(updated, req.Assets)
	if err != nil {
		t.Fatal(err)
	}
	for i, interval := range []Interval{{SourceID: "source-001", In: 0, Out: 2.51}, {SourceID: "source-001", In: 2.51, Out: 3.52}} {
		entry := timeline[i]
		if entry.Audio == nil || *entry.Audio != interval || entry.Video != interval || entry.OutputIn != interval.In || entry.OutputOut != interval.Out || len(entry.Words) != 0 {
			t.Fatalf("continuation changed original audio/video clocks or invented withheld captions: %+v", entry)
		}
	}
	if !reflect.DeepEqual(plan, original) {
		t.Fatal("repair mutated the accepted input plan")
	}
	before, _ := BuildTimeline(plan, req.Assets)
	base := Version{Number: 1, Plan: plan, Timeline: before, Report: Report{Issues: []Issue{{ID: "cut-off", Type: "audio_cut", Severity: "major", Start: 2.2, End: 2.51, BlockID: "anchor", Operation: "restore_context", CandidateID: "source-001-s1"}}}}
	state := runState{builder: New(&fakeMedia{}, nil, DefaultLimits()), req: req, tried: make(map[string]bool), next: 2}
	if version, _, _, ok := state.nextRepair(base); !ok || !reflect.DeepEqual(version.Timeline, timeline) {
		t.Fatalf("valid continuation failed bounded repair validation: %+v", base.Report.Issues)
	}
	if _, _, _, ok := state.nextRepair(base); ok {
		t.Fatal("the same intervention was eligible for another costly render")
	}
}

func TestContextRepairStillRestoresPrecedingSameSourceContextBeforeAnchor(t *testing.T) {
	req, plan := continuationFixture()
	plan.Blocks[0].CandidateID = "source-001-s1"
	updated, err := applyOperation(plan, repairOperation{"restore_context", "anchor", "source-001-g1"}, req.Assets)
	if err != nil || !slices.Equal(continuationIDs(updated), []string{"source-001-g1", "source-001-s1", "scene-v1"}) {
		t.Fatalf("preceding source context changed direction: %+v %v", updated, err)
	}
}

func TestFollowingContextRestoresPrerequisitesOnCorrectSideOfAnchor(t *testing.T) {
	req, plan := continuationFixture()
	req.Assets[0].Duration = 8
	req.Assets[0].Candidates = []Candidate{
		{ID: "setup", SourceID: "source-001", In: 0, Out: 2, Role: "a_roll"},
		{ID: "source-001-g1", SourceID: "source-001", In: 2, Out: 4, Role: "b_roll"},
		{ID: "middle", SourceID: "source-001", In: 4, Out: 6, Role: "a_roll", Dependencies: []string{"setup", "source-001-g1"}},
		{ID: "source-001-s1", SourceID: "source-001", In: 6, Out: 8, Role: "a_roll", Dependencies: []string{"middle"}},
	}
	updated, err := applyOperation(plan, repairOperation{"restore_context", "anchor", "source-001-s1"}, req.Assets)
	if err != nil || !slices.Equal(continuationIDs(updated), []string{"setup", "source-001-g1", "middle", "source-001-s1", "scene-v1"}) {
		t.Fatalf("recursive continuation setup reversed source time or became a false cycle: %+v %v", updated, err)
	}
	if issues := ValidatePlan(updated, req.Assets, req.Options, nil); hasBlocking(issues) {
		t.Fatalf("continuation left a missing or misordered prerequisite: %+v", issues)
	}
}

func TestFollowingContextRejectsOverlapInvalidSourcesAndReverseDependencies(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*Request, *Plan)
		reason string
	}{
		{"partial overlap", func(req *Request, _ *Plan) { req.Assets[0].Candidates[1].In = 2.4 }, "overlaps"},
		{"containing overlap", func(req *Request, _ *Plan) { req.Assets[0].Candidates[1].In = 0 }, "overlaps"},
		{"outside source", func(req *Request, _ *Plan) { req.Assets[0].Candidates[1].Out = 4 }, "outside original source"},
		{"negative clock", func(req *Request, _ *Plan) { req.Assets[0].Candidates[1].In = -1 }, "outside original source"},
		{"nonfinite clock", func(req *Request, _ *Plan) { req.Assets[0].Candidates[1].Out = math.Inf(1) }, "outside original source"},
		{"excluded source", func(req *Request, _ *Plan) { req.Assets[0].Include = "excluded" }, "unavailable or excluded"},
		{"missing source", func(req *Request, _ *Plan) { req.Assets[0].Candidates[1].SourceID = "missing" }, "unavailable or excluded"},
		{"reversed dependency", func(req *Request, _ *Plan) {
			req.Assets[0].Duration = 5
			req.Assets[0].Candidates[1].Dependencies = []string{"later"}
			req.Assets[0].Candidates = append(req.Assets[0].Candidates, Candidate{ID: "later", SourceID: "source-001", In: 4, Out: 5})
		}, "reverse source chronology"},
		{"cycle", func(req *Request, _ *Plan) { req.Assets[0].Candidates[1].Dependencies = []string{"source-001-s1"} }, "cyclic source context"},
		{"overlapping selected neighbor", func(req *Request, p *Plan) {
			req.Assets[0].Duration = 5
			req.Assets[0].Candidates = append(req.Assets[0].Candidates, Candidate{ID: "overlap", SourceID: "source-001", In: 3, Out: 5})
			p.Blocks = append(p.Blocks[:1], Block{ID: "neighbor", CandidateID: "overlap"})
		}, "reverse or overlap original audio"},
	} {
		t.Run(test.name, func(t *testing.T) {
			req, plan := continuationFixture()
			test.change(&req, &plan)
			original := clonePlan(plan)
			if _, err := applyOperation(plan, repairOperation{"restore_context", "anchor", "source-001-s1"}, req.Assets); err == nil || !strings.Contains(err.Error(), test.reason) {
				t.Fatalf("unsafe context restoration lacked exact rejection: %v", err)
			}
			if !reflect.DeepEqual(plan, original) {
				t.Fatal("rejected context repair mutated the input plan")
			}
		})
	}
}

func TestFollowingContextReusesExistingBlockAndSkipsIdenticalOutput(t *testing.T) {
	req, plan := continuationFixture()
	existing := Block{ID: "original-continuation", CandidateID: "source-001-s1", Crop: "track", LockText: true, LockCrop: true, Reason: "Preserve this original block."}
	plan.Blocks = append([]Block{existing}, plan.Blocks...)
	updated, err := applyOperation(plan, repairOperation{"restore_context", "anchor", "source-001-s1"}, req.Assets)
	if err != nil || len(updated.Blocks) != 3 || !reflect.DeepEqual(updated.Blocks[1], existing) {
		t.Fatalf("existing continuation was duplicated or lost text/crop settings: %+v %v", updated, err)
	}
	again, err := applyOperation(updated, repairOperation{"restore_context", "anchor", "source-001-s1"}, req.Assets)
	if err != nil || !reflect.DeepEqual(again, updated) {
		t.Fatalf("repeated context repair changed the already correct plan: %+v %v", again, err)
	}
	timeline, _ := BuildTimeline(updated, req.Assets)
	base := Version{Number: 1, Plan: updated, Timeline: timeline, Report: Report{Issues: []Issue{{ID: "stale-finding", Type: "audio_cut", BlockID: "anchor", Operation: "restore_context", CandidateID: "source-001-s1"}}}}
	state := runState{builder: New(&fakeMedia{}, nil, DefaultLimits()), req: req, tried: make(map[string]bool), next: 2}
	if _, _, _, ok := state.nextRepair(base); ok || state.next != 2 || !strings.Contains(base.Report.Issues[0].RepairNote, "identical output") {
		t.Fatal("an already restored continuation could consume a render or version")
	}
}

func TestFollowingContextHonorsAnchorExistingAndDownstreamLocks(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*Plan)
		allow  bool
	}{
		{"locked anchor", func(p *Plan) { p.Blocks[0].Locked = true }, false},
		{"anchor position stays fixed", func(p *Plan) { p.Blocks[0].LockOrder = true }, true},
		{"locked downstream position", func(p *Plan) { p.Blocks[1].Locked = true }, false},
		{"locked existing continuation", func(p *Plan) {
			p.Blocks = append(p.Blocks, Block{ID: "existing", CandidateID: "source-001-s1", LockOrder: true})
		}, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			req, plan := continuationFixture()
			test.change(&plan)
			updated, err := applyOperation(plan, repairOperation{"restore_context", "anchor", "source-001-s1"}, req.Assets)
			if test.allow {
				if err != nil || !reflect.DeepEqual(updated.Blocks[0], plan.Blocks[0]) {
					t.Fatalf("following insertion changed a fixed anchor position: %+v %v", updated, err)
				}
			} else if err == nil || !strings.Contains(err.Error(), "locked") {
				t.Fatalf("lock violation was not rejected: %v", err)
			}
		})
	}
}

func TestCrossSourceContextDoesNotInferFollowingFromUnrelatedClocks(t *testing.T) {
	req, plan := continuationFixture()
	req.Assets[1].Candidates[0].In, req.Assets[1].Candidates[0].Out = 10, 11
	plan.Blocks = plan.Blocks[:1]
	updated, err := applyOperation(plan, repairOperation{"restore_context", "anchor", "scene-v1"}, req.Assets)
	if err != nil || !slices.Equal(continuationIDs(updated), []string{"scene-v1", "source-001-g1"}) {
		t.Fatalf("unrelated source clocks were treated as a proven following continuation: %+v %v", updated, err)
	}
}
