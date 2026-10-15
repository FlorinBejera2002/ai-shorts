package story

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"strings"
	"testing"
)

const originalSpeechLiveBrief = "LIVE QA Herbert 11 clipuri — 15 octombrie. Creează un montaj auto cu toate cele 11 filmări. Păstrează vocea originală integrală, cu sunetul sincronizat și subtitrări în limba vorbită. Include cadrele de detaliu ale mașinii și păstrează fiecare filmare editabilă separat."

func TestPreserveOriginalSpeechRequiresExplicitContract(t *testing.T) {
	for _, brief := range []string{originalSpeechLiveBrief, "Preserve all original speech.", "Keep the entire original voice.", "Păstrează tot dialogul.", "Păstrează toată vorbirea originală."} {
		if !PreserveOriginalSpeech(Options{Brief: brief}) {
			t.Errorf("explicit instruction not recognized: %q", brief)
		}
	}
	for _, brief := range []string{"", "Caption all speech.", "Use all eleven sources.", "Do not preserve all original speech.", "Nu păstra toată vorbirea.", `He said "preserve all original speech".`, "Keep the original voice."} {
		if PreserveOriginalSpeech(Options{Brief: brief, Captions: true, CaptionMode: "all"}) {
			t.Errorf("invented all-speech contract: %q", brief)
		}
	}
	options := Options{PreserveOriginalSpeech: true}
	if !PreserveOriginalSpeech(options) || !BuildEditingBrief(Request{Options: options}).SelectedSettings.PreserveOriginalSpeech {
		t.Fatal("typed contract not preserved")
	}
}

func originalSpeechElevenSources() Request {
	req := Request{ID: "speech-fixture", UserID: "synthetic", Options: DefaultOptions(), VersionStart: 1}
	req.Options.TargetSeconds, req.Options.Brief, req.Options.CaptionMode = 60, originalSpeechLiveBrief, "all"
	for i := 1; i <= 11; i++ {
		id := fmt.Sprintf("source-%02d", i)
		asset := Asset{ID: id, Key: "synthetic/" + id + ".mp4", Size: 1000, Duration: 10, Width: 160, Height: 90, Order: i, Include: "required", HasAudio: i != 11}
		candidate := Candidate{ID: id + "-phrase", SourceID: id, In: 1, Out: 9, Role: "a_roll", Confidence: .95}
		if i <= 7 {
			candidate.Text, candidate.Words = "Original.", []Word{{Text: "Original.", Start: 1.2, End: 3.5}}
		}
		if i == 5 || i == 6 {
			candidate.Out = 4
		}
		if i == 8 || i == 9 || i == 10 {
			candidate.Out = 3
		}
		if i == 11 {
			candidate.In, candidate.Out, candidate.Role = 0, 3, "b_roll"
		}
		asset.Candidates = []Candidate{candidate}
		if i == 5 || i == 6 || i == 8 || i == 9 {
			asset.TranscriptProposals = []TranscriptProposal{{ID: id + "-proposal", CandidateID: candidate.ID, In: 4, Out: 9, TimingVerified: i != 9, Words: []Word{{Text: "UNVERIFIED", Start: 4.2, End: 8.5}}}}
		}
		if asset.HasAudio {
			asset.VoiceIntervals = []Interval{{SourceID: id, In: 1, Out: 9}}
		}
		req.Assets = append(req.Assets, asset)
	}
	return req
}

func prepareSpeechFixture(t *testing.T, req *Request) {
	t.Helper()
	if err := prepareCandidates(req.Assets); err != nil {
		t.Fatal(err)
	}
	if err := PrepareOriginalSpeech(req.Assets, req.Options); err != nil {
		t.Fatal(err)
	}
	if err := prepareCandidates(req.Assets); err != nil {
		t.Fatal(err)
	}
}

func TestOriginalSpeechCompletesElevenSourcesBeforeSemanticReview(t *testing.T) {
	for _, fallback := range []bool{false, true} {
		t.Run(fmt.Sprintf("fallback-%v", fallback), func(t *testing.T) {
			req := originalSpeechElevenSources()
			prepareSpeechFixture(t, &req)
			selected := Plan{Blocks: []Block{{CandidateID: "source-01-phrase"}, {CandidateID: "source-05-phrase"}, {CandidateID: "source-11-phrase"}}}
			ai := &fakeGenerator{responses: []string{proposal(selected)}}
			if fallback {
				ai.err = fmt.Errorf("synthetic planner unavailable")
			}
			builder := New(&fakeMedia{}, ai, DefaultLimits())
			plan, err := builder.plan(context.Background(), req, &runBudget{max: 12})
			if err != nil {
				t.Fatal(err)
			}
			timeline, err := BuildTimeline(plan, req.Assets)
			if err != nil {
				t.Fatal(err)
			}
			if len(timeline) != 11 || math.Abs(timelineDuration(timeline)-83) > .001 {
				t.Fatalf("voice was shortened/duplicated to fit 60s: entries=%d duration=%g", len(timeline), timelineDuration(timeline))
			}
			if issues := OriginalSpeechCoverage(req.Assets, timeline); len(issues) != 0 {
				t.Fatalf("missing original speech: %+v", issues)
			}
			for i, entry := range timeline {
				if entry.Video.SourceID != req.Assets[i].ID {
					t.Fatalf("source chronology changed: %+v", timeline)
				}
				for _, word := range entry.Words {
					if word.Text == "UNVERIFIED" {
						t.Fatal("unverified proposal promoted to captions")
					}
				}
			}
			if issues := ValidatePlan(plan, req.Assets, req.Options, nil); hasBlocking(issues) {
				t.Fatalf("complete speech plan failed source constraints: %+v", issues)
			}
			if !fallback {
				review := builder.preReview(context.Background(), req, Version{Number: 1, Plan: plan, Timeline: timeline}, &runBudget{max: 12})
				if ai.calls != 2 || !review.Coverage.Semantics {
					t.Fatalf("independent review was bypassed: calls=%d report=%+v", ai.calls, review)
				}
			}
		})
	}
}

func TestOriginalSpeechOverlappingCandidatesPlayOnceWithVerifiedWords(t *testing.T) {
	req := Request{Options: Options{PreserveOriginalSpeech: true, PreserveOrder: true}, Assets: []Asset{{ID: "one", HasAudio: true, Duration: 8, VoiceIntervals: []Interval{{"one", 0, 7}}, Candidates: []Candidate{
		{ID: "first", SourceID: "one", In: 0, Out: 4, Text: "First.", Words: []Word{{"First.", .5, 3.5}}, Confidence: .9},
		{ID: "second", SourceID: "one", In: 3.8, Out: 7, Text: "Second.", Words: []Word{{"Second.", 4.1, 6.5}}, Confidence: .9, Dependencies: []string{"first"}},
		{ID: "empty-wide", SourceID: "one", In: 0, Out: 7},
	}}}}
	prepareSpeechFixture(t, &req)
	input := Plan{Blocks: []Block{{ID: "first-block", CandidateID: "first"}, {ID: "second-block", CandidateID: "second"}}}
	original := clonePlan(input)
	plan, err := CompleteOriginalSpeech(input, req.Assets, req.Options)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(input, original) {
		t.Fatal("completion mutated saved input")
	}
	timeline, err := BuildTimeline(plan, req.Assets)
	if err != nil {
		t.Fatal(err)
	}
	if len(timeline) != 1 || timelineDuration(timeline) != 7 || len(timeline[0].Words) != 2 {
		t.Fatalf("overlap replayed or verified captions lost: %+v", timeline)
	}
	if issues := ValidatePlan(plan, req.Assets, req.Options, nil); hasBlocking(issues) {
		t.Fatalf("contained dependency was not retained: %+v", issues)
	}
	again, err := CompleteOriginalSpeech(plan, req.Assets, req.Options)
	if err != nil || !reflect.DeepEqual(plan, again) {
		t.Fatalf("completion not idempotent: %+v %v", again, err)
	}
	input.Blocks[0].Locked = true
	if _, err := CompleteOriginalSpeech(input, req.Assets, req.Options); err == nil {
		t.Fatal("locked source interval was rewritten")
	}
}

func TestOriginalSpeechRequiresAudioNotBRollInclusion(t *testing.T) {
	assets := []Asset{
		{ID: "voice", Duration: 5, HasAudio: true, VoiceIntervals: []Interval{{"voice", 0, 5}}, Candidates: []Candidate{{ID: "voice-c", SourceID: "voice", In: 0, Out: 5, Role: "b_roll"}}},
		{ID: "other", Duration: 5, HasAudio: true, Candidates: []Candidate{{ID: "other-c", SourceID: "other", In: 0, Out: 5}}},
	}
	plan := Plan{Blocks: []Block{{ID: "one", CandidateID: "other-c", BRollID: "voice-c"}}}
	issues := ValidatePlan(plan, assets, Options{PreserveOriginalSpeech: true}, nil)
	if len(issues) != 1 || issues[0].Type != "original_speech" || issues[0].SourceIDs[0] != "voice" {
		t.Fatalf("B-roll falsely counted as retained voice: %+v", issues)
	}
	if issues := ValidatePlan(plan, assets, Options{CaptionMode: "all", Captions: true}, nil); len(issues) != 0 {
		t.Fatalf("normal montage behavior changed: %+v", issues)
	}
}

func TestOriginalSpeechEvidenceIsClonedReboundAndImmutable(t *testing.T) {
	a := fixtureAsset()
	a.ID = "source-a"
	a.VoiceIntervals = []Interval{{a.ID, 1, 4}}
	copy := cloneAssets([]Asset{a})
	copy[0].VoiceIntervals[0].Out = 5
	if a.VoiceIntervals[0].Out != 4 {
		t.Fatal("voice evidence aliases caller")
	}
	if _, err := mergeSourceMeaning([]Asset{a}, copy); err == nil {
		t.Fatal("semantic model altered measured voice evidence")
	}
	for i := range a.Candidates {
		a.Candidates[i].ID = a.ID + fmt.Sprintf("-%d", i)
	}
	b := a
	b.ID = "source-b"
	reused, ok := reuseDuplicateAnalysis(a, b)
	if !ok || reused.VoiceIntervals[0].SourceID != b.ID || a.VoiceIntervals[0].SourceID != a.ID {
		t.Fatalf("duplicate voice evidence not rebound safely: %+v %v", reused.VoiceIntervals, ok)
	}
}

func TestOriginalSpeechDoesNotWaiveSemanticFailure(t *testing.T) {
	req := originalSpeechElevenSources()
	prepareSpeechFixture(t, &req)
	plan, err := CompleteOriginalSpeech(fallbackPlan(req), req.Assets, req.Options)
	if err != nil {
		t.Fatal(err)
	}
	timeline, err := BuildTimeline(plan, req.Assets)
	if err != nil {
		t.Fatal(err)
	}
	judgment, _ := json.Marshal(semanticReview{Complete: true, Issues: []Issue{{Type: "meaning", Severity: "critical", BlockID: plan.Blocks[0].ID, Evidence: "The source message still contradicts the brief.", Confidence: 1}}})
	ai := &fakeGenerator{responses: []string{string(judgment)}}
	report := New(&fakeMedia{}, ai, DefaultLimits()).preReview(context.Background(), req, Version{Number: 1, Plan: plan, Timeline: timeline}, &runBudget{max: 12})
	if ai.calls != 1 || !hasCritical(report.Issues) || !strings.Contains(report.Issues[0].Evidence, "contradicts") {
		t.Fatalf("semantic safety relaxed: %+v", report)
	}
}

func TestOriginalSpeechCompletionPreservesMetadataAndLocks(t *testing.T) {
	req := originalSpeechElevenSources()
	prepareSpeechFixture(t, &req)
	visual := Asset{ID: "visual", Duration: 12, Candidates: []Candidate{{ID: "visual-c", SourceID: "visual", In: 0, Out: 12, Role: "b_roll"}}}
	req.Assets = append(req.Assets, visual)
	plan := Plan{Blocks: []Block{{ID: "partial", CandidateID: "source-05-phrase", BRollID: "visual-c", Crop: "track", Role: "evidence"}}}
	completed, err := CompleteOriginalSpeech(plan, req.Assets, req.Options)
	if err != nil {
		t.Fatal(err)
	}
	var found Block
	for _, block := range completed.Blocks {
		if block.ID == "partial" {
			found = block
		}
	}
	if found.BRollID != "visual-c" || found.Crop != "track" || found.Role != "evidence" {
		t.Fatalf("valid block metadata was lost: %+v", found)
	}
	plan.Blocks[0].IdentityReferenceID = "source-05-phrase"
	if _, err := CompleteOriginalSpeech(plan, req.Assets, req.Options); err == nil {
		t.Fatal("identity comparison was silently removed")
	}
	plan = Plan{Blocks: []Block{{ID: "last", CandidateID: "source-11-phrase", LockOrder: true}}}
	if _, err := CompleteOriginalSpeech(plan, req.Assets, req.Options); err == nil {
		t.Fatal("completion moved order-locked block")
	}
}

func TestOriginalSpeechRefreshesDerivedUnionWithoutDuplicatingIdentity(t *testing.T) {
	req := originalSpeechElevenSources()
	prepareSpeechFixture(t, &req)
	asset := &req.Assets[4]
	before := len(asset.Candidates)
	union := speechRangeCandidate(*asset, Interval{asset.ID, 1, 9})
	asset.Candidates[0].Words[0].Text = "Reviewed."
	asset.Candidates[0].Text = "Reviewed."
	if err := PrepareOriginalSpeech(req.Assets, req.Options); err != nil {
		t.Fatal(err)
	}
	if err := prepareCandidates(req.Assets); err != nil {
		t.Fatal(err)
	}
	after := speechRangeCandidate(*asset, Interval{asset.ID, 1, 9})
	if len(asset.Candidates) != before || after.ID != union.ID || after.Words[0].Text != "Reviewed." {
		t.Fatalf("derived union identity duplicated or stale: before=%+v after=%+v", union, after)
	}
}

func TestOriginalSpeechInitialTimelineStillHonorsHardLimit(t *testing.T) {
	req := Request{ID: "hard-limit", Options: DefaultOptions(), Assets: []Asset{{ID: "audio", Key: "synthetic/audio.mp4", Size: 1000, Duration: 10, Width: 160, Height: 90, HasAudio: true, VoiceIntervals: []Interval{{"audio", 0, 5}}, Candidates: []Candidate{
		{ID: "speech", SourceID: "audio", In: 0, Out: 5, Text: "Original.", Words: []Word{{"Original.", 1, 4}}},
		{ID: "visual-a", SourceID: "audio", In: 5, Out: 10},
		{ID: "visual-b", SourceID: "audio", In: 5, Out: 10},
	}}}}
	req.Options.PreserveOriginalSpeech = true
	selected := Plan{Blocks: []Block{{CandidateID: "speech"}, {CandidateID: "visual-a"}, {CandidateID: "visual-b"}}}
	limits := DefaultLimits()
	limits.MaxTotalSeconds, limits.MaxSourceSeconds = 10, 10
	media := &fakeMedia{}
	_, err := New(media, &fakeGenerator{responses: []string{proposal(selected)}}, limits).Run(context.Background(), req, &memoryCheckpoints{})
	if err == nil || !strings.Contains(err.Error(), "configured duration limit") || len(media.renders) != 0 {
		t.Fatalf("hard duration limit bypassed: err=%v renders=%d", err, len(media.renders))
	}
}

func TestOriginalSpeechUnionDoesNotInventDependencyOnItsOwnComponent(t *testing.T) {
	req := Request{Options: Options{PreserveOriginalSpeech: true}, Assets: []Asset{{ID: "source", Duration: 10, HasAudio: true, Candidates: []Candidate{
		{ID: "part-one", SourceID: "source", In: 0, Out: 5, Text: "Therefore continue.", Words: []Word{{"Therefore", .2, 2}, {"continue.", 2.2, 4.7}}},
		{ID: "part-two", SourceID: "source", In: 4.9, Out: 9, Text: "Keep going.", Words: []Word{{"Keep", 5.1, 6}, {"going.", 6.1, 8.7}}},
	}}}}
	prepareSpeechFixture(t, &req)
	union := speechRangeCandidate(req.Assets[0], Interval{"source", 0, 9})
	if len(union.Dependencies) != 0 {
		t.Fatalf("union depends on its own component: %+v", union.Dependencies)
	}
	plan, err := CompleteOriginalSpeech(Plan{}, req.Assets, req.Options)
	if err != nil {
		t.Fatal(err)
	}
	issues := ValidatePlan(plan, req.Assets, req.Options, nil)
	if len(issues) != 1 || issues[0].Type != "context" {
		t.Fatalf("unknown antecedent should remain a real review finding, without invented self-dependency: %+v", issues)
	}
}
