package story

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"
)

type fakeGenerator struct {
	calls     int
	responses []string
	err       error
	prompts   []string
}

func (g *fakeGenerator) Generate(ctx context.Context, prompt string) (string, error) {
	g.calls++
	g.prompts = append(g.prompts, prompt)
	if g.err != nil {
		return "", g.err
	}
	if len(g.responses) > 0 {
		response := g.responses[0]
		g.responses = g.responses[1:]
		return response, nil
	}
	return `{"complete":true,"issues":[],"incomplete":[]}`, nil
}

type fakeMedia struct {
	analyses    int
	renders     []Version
	reviews     int
	reports     []Report
	reviewErr   error
	renderDelay time.Duration
}

func (m *fakeMedia) Inspect(context.Context, string) (Asset, error) { return Asset{}, nil }
func (m *fakeMedia) Analyze(_ context.Context, _ string, a Asset, _ Options) (Asset, error) {
	m.analyses++
	return a, nil
}
func (m *fakeMedia) RenderStory(ctx context.Context, _ Request, v Version) (Output, error) {
	if m.renderDelay > 0 {
		select {
		case <-ctx.Done():
			return Output{}, ctx.Err()
		case <-time.After(m.renderDelay):
		}
	}
	m.renders = append(m.renders, v)
	return Output{Key: fmt.Sprintf("story/v%d.mp4", v.Number), Size: 1024, Duration: timelineDuration(v.Timeline)}, nil
}
func (m *fakeMedia) ReviewStory(_ context.Context, _ Request, v Version) (Report, error) {
	m.reviews++
	if m.reviewErr != nil {
		return Report{}, m.reviewErr
	}
	if len(m.reports) > 0 {
		report := m.reports[0]
		m.reports = m.reports[1:]
		return report, nil
	}
	return readyReport(v.Number), nil
}

type memoryCheckpoints struct {
	versions []Version
	attempts []Attempt
	assets   []Asset
	states   []string
	fail     error
}

func (c *memoryCheckpoints) Progress(_ context.Context, status, _ string) error {
	c.states = append(c.states, status)
	return c.fail
}
func (c *memoryCheckpoints) SaveAsset(_ context.Context, a Asset) error {
	c.assets = append(c.assets, a)
	return c.fail
}
func (c *memoryCheckpoints) SaveVersion(_ context.Context, v Version) error {
	for i, previous := range c.versions {
		if previous.Number == v.Number {
			c.versions[i] = v
			return c.fail
		}
	}
	c.versions = append(c.versions, v)
	return c.fail
}
func (c *memoryCheckpoints) SaveAttempt(_ context.Context, a Attempt) error {
	for i, previous := range c.attempts {
		if previous.Version == a.Version && previous.Operation == a.Operation {
			c.attempts[i] = a
			return c.fail
		}
	}
	c.attempts = append(c.attempts, a)
	return c.fail
}

func readyReport(version int) Report {
	return Report{Version: version, Status: "ready", Coverage: Coverage{Plan: true, File: true, Audio: true, Visual: true, Captions: true, Semantics: true, Boundaries: true}}
}
func fixtureAsset() Asset {
	return Asset{ID: "source-a", Key: "sources/a.mov", Name: "phone.mov", Size: 1000, Duration: 15, Width: 1920, Height: 1080, HasAudio: true, AnalysisVersion: AlgorithmVersion, Candidates: []Candidate{
		{ID: "a", SourceID: "source-a", In: 1, Out: 4, Text: "Use five grams.", Words: []Word{{"Use", 1.2, 1.5}, {"five", 1.6, 2.2}, {"grams.", 2.3, 3.8}}, Speaker: "speaker-1", Language: "en", Role: "a_roll", AudioScore: .8, VisualScore: .8, Confidence: .95},
		{ID: "a-alt", SourceID: "source-a", In: 5, Out: 9, Text: "Use five grams.", Words: []Word{{"Use", 5.2, 5.6}, {"five", 5.7, 6.2}, {"grams.", 6.3, 8.8}}, Speaker: "speaker-1", Language: "en", Role: "a_roll", AudioScore: .9, VisualScore: .9, Confidence: .95},
		{ID: "b", SourceID: "source-a", In: 10, Out: 14, Text: "Mix thoroughly.", Words: []Word{{"Mix", 10.2, 11.2}, {"thoroughly.", 11.3, 13.8}}, Speaker: "speaker-1", Language: "en", Role: "a_roll", AudioScore: .8, VisualScore: .8, Confidence: .95},
	}}
}
func fixturePlan() Plan {
	return Plan{Title: "A recipe", Blocks: []Block{{ID: "block-a", CandidateID: "a", Crop: "track", Alternatives: []string{"a-alt"}}, {ID: "block-b", CandidateID: "b", Crop: "fit"}}}
}
func fixtureRequest() Request {
	return Request{ID: "project-a", UserID: "user-a", Options: DefaultOptions(), Assets: []Asset{fixtureAsset()}, VersionStart: 1}
}
func proposal(plan Plan) string {
	p := plannerProposal{Title: plan.Title}
	for _, b := range plan.Blocks {
		p.Blocks = append(p.Blocks, plannerBlock{CandidateID: b.CandidateID, Role: b.Role, Reason: "Full original sentence", BRollID: b.BRollID})
	}
	data, _ := json.Marshal(p)
	return string(data)
}
func fixtureBase(t *testing.T, req Request) Version {
	t.Helper()
	timeline, err := BuildTimeline(fixturePlan(), req.Assets)
	if err != nil {
		t.Fatal(err)
	}
	return Version{Number: 1, Plan: fixturePlan(), Timeline: timeline, Output: Output{Key: "old.mp4", Size: 1000, Duration: timelineDuration(timeline)}, Report: readyReport(1), Accepted: true}
}

func TestWholeSourceTimelineAndBRollKeepIndependentClocks(t *testing.T) {
	a := fixtureAsset()
	visual := Asset{ID: "visual", Key: "sources/visual.mp4", Size: 100, Duration: 12, Width: 1080, Height: 1920, Candidates: []Candidate{{ID: "v", SourceID: "visual", In: 2, Out: 8, Role: "b_roll"}}}
	plan := fixturePlan()
	plan.Blocks[0].BRollID = "v"
	entries, err := BuildTimeline(plan, []Asset{a, visual})
	if err != nil {
		t.Fatal(err)
	}
	if entries[0].Video.SourceID != "visual" || entries[0].Audio.SourceID != "source-a" || entries[0].Video.Out != 5 {
		t.Fatalf("lost provenance: %+v", entries[0])
	}
	if entries[1].OutputIn != 3 || entries[0].Words[0].Start < .199 || entries[0].Words[0].Start > .201 {
		t.Fatalf("incorrect output clock: %+v", entries)
	}
	plan.Blocks[0].CandidateID = "a-alt"
	entries, err = BuildTimeline(plan, []Asset{a, visual})
	if err != nil {
		t.Fatal(err)
	}
	if entries[1].OutputIn != 4 || entries[1].Words[0].Start < 4.199 || entries[1].Words[0].Start > 4.201 {
		t.Fatalf("longer take did not reflow captions and downstream blocks: %+v", entries)
	}
}

func TestTakeEquivalencePreservesNumbersNegationConditionsAndSpeaker(t *testing.T) {
	base := Candidate{Text: "Do not use 1.5 grams if hot.", SourceID: "a", Speaker: "one", Language: "en"}
	for _, text := range []string{"Do use 1.5 grams if hot.", "Do not use 15 grams if hot.", "Do not use 1.5 grams.", "Do not use 1.5 kilograms if hot."} {
		other := base
		other.Text = text
		if EquivalentTakes(base, other) {
			t.Fatalf("unsafe equivalence: %q", text)
		}
	}
	other := base
	other.SourceID = "b"
	if !EquivalentTakes(base, other) {
		t.Fatal("known same-speaker identical take should match")
	}
	other.Speaker = "two"
	if EquivalentTakes(base, other) {
		t.Fatal("different speakers merged")
	}
	base.Speaker = ""
	other.Speaker = ""
	if EquivalentTakes(base, other) {
		t.Fatal("unknown cross-file speakers merged")
	}
}

func TestDependencyAndImmutableLocksAreHardConstraints(t *testing.T) {
	req := fixtureRequest()
	req.Assets[0].Candidates[2].Text = "Therefore mix thoroughly."
	req.Assets[0].Candidates[2].Dependencies = []string{"a"}
	plan := fixturePlan()
	plan.Blocks = plan.Blocks[1:]
	if !hasBlocking(ValidatePlan(plan, req.Assets, req.Options, nil)) {
		t.Fatal("dangling context accepted")
	}
	base := fixtureBase(t, req)
	base.Plan.Blocks[0].Locked = true
	plan = clonePlan(base.Plan)
	plan.Blocks[0].CandidateID = "a-alt"
	if !hasBlocking(ValidatePlan(plan, req.Assets, req.Options, &base)) {
		t.Fatal("locked take changed")
	}
	base.Plan.Blocks[0].Locked = false
	base.Plan.Blocks[1].LockOrder = true
	plan = clonePlan(base.Plan)
	plan.Blocks[0], plan.Blocks[1] = plan.Blocks[1], plan.Blocks[0]
	if !hasBlocking(ValidatePlan(plan, req.Assets, req.Options, &base)) {
		t.Fatal("locked order changed")
	}
}

func TestBuilderRequiresActualCompleteOutputReview(t *testing.T) {
	for _, test := range []struct {
		name   string
		report Report
		err    error
	}{{"complete", readyReport(1), nil}, {"missing audio", func() Report { r := readyReport(1); r.Coverage.Audio = false; return r }(), nil}, {"review unavailable", Report{}, errors.New("reviewer offline")}, {"invalid evidence", func() Report {
		r := readyReport(1)
		r.Issues = []Issue{{ID: "fake", Type: "cut", Severity: "major", BlockID: "another-project", Evidence: "wrong source"}}
		return r
	}(), nil}} {
		t.Run(test.name, func(t *testing.T) {
			media := &fakeMedia{reports: []Report{test.report}, reviewErr: test.err}
			ai := &fakeGenerator{responses: []string{proposal(fixturePlan())}}
			checkpoint := &memoryCheckpoints{}
			result, err := New(media, ai, DefaultLimits()).Run(context.Background(), fixtureRequest(), checkpoint)
			if err != nil {
				t.Fatal(err)
			}
			if got := result.Best.Report.Status == "ready"; got != (test.name == "complete") {
				t.Fatalf("false readiness: %+v", result.Best.Report)
			}
			if media.reviews != 1 || len(media.renders) != 1 {
				t.Fatal("actual output was not reviewed")
			}
		})
	}
}

func TestAutomaticRepairReflowsTimelineAndCachesAnalysis(t *testing.T) {
	req := fixtureRequest()
	base := fixtureBase(t, req)
	base.Report = readyReport(1)
	base.Report.Status = "needs_review"
	req.Base = &base
	req.Action = "resume"
	req.VersionStart = 2
	defect := readyReport(2)
	defect.Issues = []Issue{{ID: "cut-a", Type: "audio_cut", Severity: "major", BlockID: "block-a", Start: 0, End: 3, SourceIDs: []string{"source-a"}, Evidence: "Actual output clips the final phoneme.", Confidence: .98, Operation: "use_alternative", CandidateID: "a-alt"}}
	media := &fakeMedia{reports: []Report{defect, readyReport(3)}}
	checkpoint := &memoryCheckpoints{}
	result, err := New(media, &fakeGenerator{}, DefaultLimits()).Run(context.Background(), req, checkpoint)
	if err != nil {
		t.Fatal(err)
	}
	if result.Best.Number != 3 || result.Best.Report.Status != "ready" || len(result.Attempts) != 1 || !result.Attempts[0].Accepted {
		t.Fatalf("repair failed: %+v", result)
	}
	if media.analyses != 1 || len(media.renders) != 2 {
		t.Fatalf("unnecessary analysis: %+v", media)
	}
	if result.Best.Timeline[1].OutputIn != 4 || result.Best.Plan.Blocks[1].CandidateID != "b" {
		t.Fatal("downstream clocks or unrelated source selection changed")
	}
	if !reflect.DeepEqual(result.Attempts[0].Scope, []string{"block-a", "block-b"}) {
		t.Fatalf("repair dependencies missing: %+v", result.Attempts[0])
	}
	if base.Plan.Blocks[0].CandidateID != "a" {
		t.Fatal("repair mutated saved base")
	}
}

func TestRepairRegressionRejectedAndBestVersionRetained(t *testing.T) {
	req := fixtureRequest()
	base := fixtureBase(t, req)
	req.Base = &base
	req.Action = "resume"
	req.VersionStart = 2
	before := readyReport(2)
	before.Issues = []Issue{{ID: "cut-a", Type: "audio_cut", Severity: "major", BlockID: "block-a", Evidence: "clipped phrase", Confidence: 1, Operation: "use_alternative", CandidateID: "a-alt"}}
	after := readyReport(3)
	after.Issues = []Issue{{ID: "wrong-meaning", Type: "meaning", Severity: "critical", BlockID: "block-b", Evidence: "The repair changed narrative interpretation.", Confidence: 1}}
	media := &fakeMedia{reports: []Report{before, after}}
	checkpoint := &memoryCheckpoints{}
	result, err := New(media, &fakeGenerator{}, DefaultLimits()).Run(context.Background(), req, checkpoint)
	if err != nil {
		t.Fatal(err)
	}
	if result.Best.Number != 2 || result.Best.Plan.Blocks[0].CandidateID != "a" || len(result.Attempts) != 1 || result.Attempts[0].Accepted {
		t.Fatalf("regression replaced best: %+v", result)
	}
	if len(checkpoint.versions) != 2 || checkpoint.versions[1].Accepted {
		t.Fatal("rejected candidate evidence was not retained")
	}
}

func TestBudgetsAndTimeoutCannotProduceReady(t *testing.T) {
	limits := DefaultLimits()
	limits.MaxAICalls = 1
	media := &fakeMedia{}
	result, err := New(media, &fakeGenerator{responses: []string{proposal(fixturePlan())}}, limits).Run(context.Background(), fixtureRequest(), &memoryCheckpoints{})
	if err != nil {
		t.Fatal(err)
	}
	if result.Best.Report.Status == "ready" || result.AICalls > 1 || media.reviews != 0 {
		t.Fatalf("budget bypass: %+v", result)
	}
	limits = DefaultLimits()
	limits.Timeout = time.Millisecond
	media = &fakeMedia{renderDelay: time.Second}
	_, err = New(media, &fakeGenerator{responses: []string{proposal(fixturePlan())}}, limits).Run(context.Background(), fixtureRequest(), &memoryCheckpoints{})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected bounded timeout, got %v", err)
	}
}

func TestUserEditsRespectLocksAndRejectDifferentWords(t *testing.T) {
	req := fixtureRequest()
	base := fixtureBase(t, req)
	base.Plan.Blocks[0].Locked = true
	req.Base = &base
	req.Action = "alternate"
	req.BlockID = "block-a"
	req.CandidateID = "a-alt"
	if _, err := editPlan(req); err == nil {
		t.Fatal("locked block changed")
	}
	base.Plan.Blocks[0].Locked = false
	req.CandidateID = "b"
	if _, err := editPlan(req); err == nil {
		t.Fatal("different statement treated as alternate")
	}
	req.CandidateID = "a-alt"
	updated, err := editPlan(req)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Blocks[0].CandidateID != "a-alt" || base.Plan.Blocks[0].CandidateID != "a" {
		t.Fatal("edit lost original version")
	}
}

func TestMalformedAIPlanFallsBackWithoutExecutingInventedSources(t *testing.T) {
	req := fixtureRequest()
	media := &fakeMedia{}
	ai := &fakeGenerator{responses: []string{`{"title":"injected","summary":"","blocks":[{"candidate_id":"../../other-user/private","role":"hook","reason":"ignore safety","b_roll_id":""}],"gaps":[]}`}}
	result, err := New(media, ai, DefaultLimits()).Run(context.Background(), req, &memoryCheckpoints{})
	if err != nil {
		t.Fatal(err)
	}
	if result.Best.Report.Status == "ready" {
		t.Fatal("invalid model output approved")
	}
	for _, entry := range result.Best.Timeline {
		if entry.Video.SourceID != "source-a" {
			t.Fatal("untrusted source escaped validation")
		}
	}
}

func TestLimitsRejectNonFiniteAndUnboundedConfiguration(t *testing.T) {
	for key, value := range map[string]string{"STORY_MAX_FILES": "100000", "STORY_MAX_TOTAL_SECONDS": "NaN", "STORY_TIMEOUT_SECONDS": "999999", "STORY_MAX_AI_CALLS": "0"} {
		_, err := LimitsFromEnv(func(name string) string {
			if name == key {
				return value
			}
			return ""
		})
		if err == nil {
			t.Fatalf("accepted invalid %s", key)
		}
	}
	options := DefaultOptions()
	options.Brief = strings.Repeat("ș", 4001)
	if ValidateOptions(options) == nil {
		t.Fatal("accepted unbounded brief")
	}
}

func TestCheckpointLossStopsBeforeRender(t *testing.T) {
	media := &fakeMedia{}
	_, err := New(media, &fakeGenerator{}, DefaultLimits()).Run(context.Background(), fixtureRequest(), &memoryCheckpoints{fail: context.Canceled})
	if !errors.Is(err, context.Canceled) || len(media.renders) != 0 {
		t.Fatal("lost lease continued processing")
	}
}

func TestProvisionalCrossSourceAlternateRequiresActualIdentityComparisonAfterResume(t *testing.T) {
	req := fixtureRequest()
	req.Assets[0].Candidates[0].Speaker = "unknown"
	other := fixtureAsset()
	other.ID = "source-other"
	other.Key = "sources/other.mov"
	other.Order = 1
	other.Candidates = other.Candidates[:1]
	other.Candidates[0].ID = "other-take"
	other.Candidates[0].SourceID = other.ID
	other.Candidates[0].Speaker = "unknown"
	req.Assets = append(req.Assets, other)
	base := fixtureBase(t, req)
	base.Report.Status = "needs_review"
	req.Base = &base
	req.Action = "alternate"
	req.BlockID = "block-a"
	req.CandidateID = "other-take"
	req.VersionStart = 2
	for _, verified := range []bool{false, true} {
		t.Run(fmt.Sprintf("verified_%t", verified), func(t *testing.T) {
			mediaReport := readyReport(2)
			mediaReport.Coverage.SourceIdentity = verified
			result, err := New(&fakeMedia{reports: []Report{mediaReport}}, &fakeGenerator{}, DefaultLimits()).Run(context.Background(), req, &memoryCheckpoints{})
			if err != nil {
				t.Fatal(err)
			}
			if (result.Best.Report.Status == "ready") != verified {
				t.Fatalf("unverified speaker swap accepted: %+v", result.Best.Report)
			}
			if result.Best.Plan.Blocks[0].IdentityReferenceID != "a" {
				t.Fatal("identity provenance was not persisted")
			}
			resume := req
			resume.Base = &result.Best
			resume.Action = "resume"
			resume.VersionStart = 3
			resumed, err := New(&fakeMedia{}, &fakeGenerator{}, DefaultLimits()).Run(context.Background(), resume, &memoryCheckpoints{})
			if err != nil {
				t.Fatal(err)
			}
			if resumed.Best.Report.Status == "ready" {
				t.Fatal("resume discarded identity comparison requirement")
			}
		})
	}
}

func TestDisableRepairLimitsSurviveRepeatedNormalization(t *testing.T) {
	limits, err := LimitsFromEnv(func(name string) string {
		if name == "STORY_MAX_REPAIR_CYCLES" || name == "STORY_MAX_ALTERNATIVES" {
			return "0"
		}
		return ""
	})
	if err != nil {
		t.Fatal(err)
	}
	limits = NormalizeLimits(NormalizeLimits(limits))
	if limits.MaxRepairCycles != 0 || limits.MaxAlternatives != 0 {
		t.Fatal("explicit disabled budget was re-enabled")
	}
}

func TestDurableAIBudgetReservationFailureCannotApproveAStory(t *testing.T) {
	calls := 0
	ctx := WithAIBudget(context.Background(), func(context.Context) error { calls++; return errors.New("durable budget exhausted") })
	provider := &fakeGenerator{}
	result, err := New(&fakeMedia{}, provider, DefaultLimits()).Run(ctx, fixtureRequest(), &memoryCheckpoints{})
	if err != nil {
		t.Fatal(err)
	}
	if calls != 1 || provider.calls != 0 || result.Best.Report.Status == "ready" {
		t.Fatalf("durable budget bypass: calls=%d provider=%d result=%+v", calls, provider.calls, result)
	}
}

func TestRestartDoesNotRepeatReservedRepairOrResetAttemptBudget(t *testing.T) {
	req := fixtureRequest()
	base := fixtureBase(t, req)
	req.Base = &base
	req.Action = "resume"
	req.VersionStart = 4
	req.PreviousAttempts = []Attempt{{IssueID: "clipped", Operation: "use_alternative", BlockID: "block-a", CandidateID: "a-alt", Version: 3, Reason: "Repair candidate reserved; review pending."}}
	defect := readyReport(4)
	defect.Issues = []Issue{{ID: "clipped", Type: "audio_cut", Severity: "major", BlockID: "block-a", Evidence: "Actual audio cut remains clipped.", Confidence: 1, Operation: "use_alternative", CandidateID: "a-alt"}}
	media := &fakeMedia{reports: []Report{defect}}
	result, err := New(media, &fakeGenerator{}, DefaultLimits()).Run(context.Background(), req, &memoryCheckpoints{})
	if err != nil {
		t.Fatal(err)
	}
	if len(media.renders) != 1 || len(result.Attempts) != 1 || result.Best.Report.Status == "ready" {
		t.Fatalf("restart repeated a reserved intervention: %+v", result)
	}
}

func TestFiveAndTenUnorderedUploadsBecomeOneGlobalStory(t *testing.T) {
	for _, count := range []int{5, 10} {
		t.Run(fmt.Sprint(count), func(t *testing.T) {
			req := fixtureRequest()
			req.Assets = nil
			req.Options.TargetSeconds = 90
			plan := Plan{Title: "Global assembly"}
			for i := 0; i < count; i++ {
				asset := fixtureAsset()
				asset.ID = fmt.Sprintf("source-%d", i)
				asset.Key = fmt.Sprintf("sources/%d.mov", i)
				asset.Order = i
				asset.Candidates = asset.Candidates[:1]
				candidate := &asset.Candidates[0]
				candidate.ID = fmt.Sprintf("phrase-%d", i)
				candidate.SourceID = asset.ID
				candidate.Text = fmt.Sprintf("Use %d grams.", i+1)
				candidate.Words[1].Text = fmt.Sprint(i + 1)
				req.Assets = append(req.Assets, asset)
			}
			for i := count - 1; i >= 0; i-- {
				plan.Blocks = append(plan.Blocks, Block{CandidateID: req.Assets[i].Candidates[0].ID})
			}
			media := &fakeMedia{}
			result, err := New(media, &fakeGenerator{responses: []string{proposal(plan)}}, DefaultLimits()).Run(context.Background(), req, &memoryCheckpoints{})
			if err != nil {
				t.Fatal(err)
			}
			if len(media.renders) != 1 || len(result.Best.Timeline) != count || result.Best.Timeline[0].Video.SourceID != fmt.Sprintf("source-%d", count-1) {
				t.Fatalf("files were not selected globally: %+v", result.Best)
			}
		})
	}
}

func TestMissingContextIsAutomaticallyRestoredBeforeFirstRender(t *testing.T) {
	req := fixtureRequest()
	req.Assets[0].Candidates[2].Dependencies = []string{"a"}
	req.Assets[0].Candidates[2].Text = "Therefore mix thoroughly."
	base := fixtureBase(t, req)
	base.Plan.Blocks = base.Plan.Blocks[1:]
	base.Report.Status = "needs_review"
	req.Base = &base
	req.Action = "resume"
	req.VersionStart = 2
	media := &fakeMedia{}
	result, err := New(media, &fakeGenerator{}, DefaultLimits()).Run(context.Background(), req, &memoryCheckpoints{})
	if err != nil {
		t.Fatal(err)
	}
	if len(media.renders) != 1 || len(media.renders[0].Plan.Blocks) != 2 || media.renders[0].Plan.Blocks[0].CandidateID != "a" || result.Best.Report.Status != "ready" {
		t.Fatalf("context was not repaired before rendering: %+v", result)
	}
	if len(result.Attempts) != 1 || !result.Attempts[0].Accepted || !strings.Contains(result.Attempts[0].Reason, "before rendering") {
		t.Fatalf("missing pre-render repair audit: %+v", result.Attempts)
	}
}

func TestCriticalMeaningFailureNeverReachesRenderer(t *testing.T) {
	req := fixtureRequest()
	base := fixtureBase(t, req)
	req.Base = &base
	req.Action = "resume"
	req.VersionStart = 2
	judgment := semanticReview{Complete: true, Issues: []Issue{{ID: "meaning", Type: "meaning", Severity: "critical", BlockID: "block-a", Evidence: "The selected claim reverses the intended condition.", Confidence: 1}}}
	raw, _ := json.Marshal(judgment)
	media := &fakeMedia{}
	_, err := New(media, &fakeGenerator{responses: []string{string(raw)}}, DefaultLimits()).Run(context.Background(), req, &memoryCheckpoints{})
	if err == nil || len(media.renders) > 0 {
		t.Fatalf("critical semantic failure rendered: %v", err)
	}
}

func TestInvalidRenderedFileIsNeverPromotedAsUsableDraft(t *testing.T) {
	report := readyReport(1)
	report.Coverage.File = false
	report.Issues = []Issue{{ID: "corrupt", Type: "file", Severity: "critical", Evidence: "Full decoding found a corrupt output.", Confidence: 1}}
	cp := &memoryCheckpoints{}
	_, err := New(&fakeMedia{reports: []Report{report}}, &fakeGenerator{responses: []string{proposal(fixturePlan())}}, DefaultLimits()).Run(context.Background(), fixtureRequest(), cp)
	if err == nil {
		t.Fatal("corrupt file was promoted")
	}
	for _, version := range cp.versions {
		if version.Accepted {
			t.Fatal("invalid file replaced the accepted version")
		}
	}
}

func TestRequiredVisualSourceCountsWhenUsedAsBRoll(t *testing.T) {
	req := fixtureRequest()
	visual := Asset{ID: "visual", Key: "sources/visual.mov", Include: "required", Size: 1000, Duration: 10, Width: 1920, Height: 1080, Candidates: []Candidate{{ID: "visual-candidate", SourceID: "visual", In: 1, Out: 7, Role: "b_roll"}}}
	req.Assets = append(req.Assets, visual)
	plan := fixturePlan()
	plan.Blocks[0].BRollID = "visual-candidate"
	if issues := ValidatePlan(plan, req.Assets, req.Options, nil); hasBlocking(issues) {
		t.Fatalf("required B-roll was not counted as included: %+v", issues)
	}
}

func TestEditorialPayloadOmitsWordArraysWithoutLosingCompleteMeaning(t *testing.T) {
	req := fixtureRequest()
	candidate := &req.Assets[0].Candidates[0]
	candidate.Text = "Nu folosi 1,5 grame dacă este cald."
	candidate.Language = "ro"
	candidate.Idea = candidate.Text
	candidate.Words = []Word{{"Nu", 1.2, 1.4}, {"folosi", 1.5, 1.7}, {"1,5", 1.8, 2}, {"grame", 2.1, 2.3}, {"dacă", 2.4, 2.6}, {"este", 2.7, 3.1}, {"cald.", 3.2, 3.8}}
	media := &fakeMedia{}
	generator := &fakeGenerator{responses: []string{proposal(Plan{Title: "Romanian condition", Blocks: []Block{{CandidateID: "a"}}})}}
	result, err := New(media, generator, DefaultLimits()).Run(context.Background(), req, &memoryCheckpoints{})
	if err != nil {
		t.Fatal(err)
	}
	if len(generator.prompts) != 2 {
		t.Fatalf("expected separate planner and semantic reviewer calls, got %d", len(generator.prompts))
	}
	for _, prompt := range generator.prompts {
		if strings.Contains(prompt, `"words":`) {
			t.Fatal("word timing payload was repeated in editorial request")
		}
		if !strings.Contains(prompt, candidate.Text) {
			t.Fatal("complete phrase conditions/negation/decimal were omitted")
		}
		if !strings.Contains(prompt, `"source_id":"source-a"`) {
			t.Fatal("source provenance missing")
		}
	}
	if len(result.Best.Timeline[0].Words) != len(candidate.Words) {
		t.Fatal("compact editorial request discarded internal caption timing")
	}
}

func TestUnknownSpeakersWithinOneSourceStillRequireActualIdentityComparison(t *testing.T) {
	a := fixtureAsset().Candidates[0]
	b := fixtureAsset().Candidates[1]
	a.Speaker = "unknown"
	b.Speaker = "unknown"
	if EquivalentTakes(a, b) {
		t.Fatal("two unknown speakers from one file were certified identical")
	}
	if !CompatibleTake(a, b) || !NeedsSourceIdentity(a, b) {
		t.Fatal("provisional same-file alternate lacks mandatory identity comparison")
	}
}

func TestGlobalFasterChoosesLargestSafeUnlockedReduction(t *testing.T) {
	req := fixtureRequest()
	base := fixtureBase(t, req)
	base.Plan.Blocks[0].CandidateID = "a-alt"
	base.Plan.Blocks[0].Alternatives = []string{"a"}
	req.Base = &base
	req.Action = "faster"
	plan, err := editPlan(req)
	if err != nil {
		t.Fatal(err)
	}
	if plan.Blocks[0].CandidateID != "a" || plan.Blocks[1].CandidateID != "b" {
		t.Fatal("global faster did not choose the shorter full equivalent take")
	}
	if err = ValidateEdit(req); err != nil {
		t.Fatalf("queue dry run disagrees with execution: %v", err)
	}
	base.Plan.Blocks[0].Locked = true
	if _, err = editPlan(req); err == nil {
		t.Fatal("global faster changed a locked section")
	}
}
