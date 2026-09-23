package story

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func narrationFixture() Request {
	req := fixtureRequest()
	req.Options.Narration = true
	req.Options.TargetSeconds = 90
	voice := Asset{ID: "voice", Kind: "narration", Key: "voice.webm", Name: "My recorded voice", Size: 1000, Duration: 10, HasAudio: true, Candidates: []Candidate{{ID: "voice-phrase", SourceID: "voice", In: 0, Out: 10, Text: "A forest. A river. Home.", Role: "a_roll", Language: "en", Words: []Word{{"A forest.", 1, 1.5}, {"A river.", 4.8, 5.8}, {"Home.", 8, 8.5}}}}}
	req.Assets = []Asset{voice}
	for i, id := range []string{"forest", "river", "meadow"} {
		asset := Asset{ID: id, Key: id + ".mp4", Size: 1000, Duration: 8, Width: 1920, Height: 1080, HasAudio: true, Order: i, Candidates: []Candidate{{ID: id + "-scene", SourceID: id, In: 0, Out: 8, Role: "b_roll", Idea: "Original visual evidence: " + id}}}
		req.Assets = append(req.Assets, asset)
	}
	return req
}

func narrationProposalJSON() string {
	proposal := narrationProposal{Title: "My narrated journey", Selections: []narrationSelection{{SlotID: "voice-001", CandidateIDs: []string{"forest-scene"}, Reason: "A forest illustrates the original recording."}, {SlotID: "voice-002", CandidateIDs: []string{"river-scene"}, Reason: "The river illustrates the second recorded thought."}, {SlotID: "voice-003", CandidateIDs: []string{"meadow-scene"}, Reason: "The final visual accompanies the closing voice."}}}
	data, _ := json.Marshal(proposal)
	return string(data)
}

func generatedNarration(t *testing.T) (Request, Version) {
	t.Helper()
	req := narrationFixture()
	result, err := New(&fakeMedia{}, &fakeGenerator{responses: []string{narrationProposalJSON()}}, DefaultLimits()).Run(context.Background(), req, &memoryCheckpoints{})
	if err != nil {
		t.Fatal(err)
	}
	if result.Best.Report.Status != "ready" {
		t.Fatalf("complete narrated fixture failed: %+v", result.Best.Report)
	}
	return req, result.Best
}

func TestNarrationMontagePreservesCompleteOriginalVoicePausesAndCaptions(t *testing.T) {
	req := narrationFixture()
	media := &fakeMedia{}
	ai := &fakeGenerator{responses: []string{narrationProposalJSON()}}
	checkpoint := &memoryCheckpoints{}
	result, err := New(media, ai, DefaultLimits()).Run(context.Background(), req, checkpoint)
	if err != nil {
		t.Fatal(err)
	}
	if result.Best.Report.Status != "ready" || result.Best.Output.Duration != 10 || len(media.renders) != 1 || media.reviews != 1 {
		t.Fatalf("voice duration was replaced by target duration or skipped actual review: %+v", result)
	}
	clock := 0.0
	var words []Word
	for _, entry := range result.Best.Timeline {
		if entry.Audio == nil || entry.Audio.SourceID != "voice" || entry.Audio.In != clock || entry.OutputIn != clock || entry.Audio.Out != entry.OutputOut || entry.Video.SourceID == "voice" {
			t.Fatalf("voice was reordered, replaced with video audio or omitted: %+v", entry)
		}
		clock = entry.OutputOut
		words = append(words, entry.Words...)
	}
	if clock != 10 || !reflect.DeepEqual(words, req.Assets[0].Candidates[0].Words) {
		t.Fatal("original pauses or word clocks were trimmed or rewritten")
	}
	if !strings.Contains(ai.prompts[0], "target_seconds is ignored") || !strings.Contains(ai.prompts[1], "target_seconds does not apply") {
		t.Fatal("narration was passed to the generic source-speech editor")
	}
}

func TestNarrationInsufficientFootageCreatesUnrenderedReviewDraft(t *testing.T) {
	req := narrationFixture()
	req.Assets = req.Assets[:2]
	req.Assets[1].Duration = 4
	req.Assets[1].Candidates[0].Out = 4
	media := &fakeMedia{}
	checkpoint := &memoryCheckpoints{}
	result, err := New(media, &fakeGenerator{responses: []string{narrationProposalJSON()}}, DefaultLimits()).Run(context.Background(), req, checkpoint)
	if err != nil {
		t.Fatal(err)
	}
	if len(media.renders) != 0 || media.reviews != 0 || result.Best.Accepted || result.Best.Output.Key != "" || result.Best.Report.Status != "needs_review" || len(checkpoint.versions) == 0 {
		t.Fatalf("insufficient footage truncated voice, looped video or lost the review draft: %+v", result)
	}
	if !strings.Contains(strings.Join(result.Best.Plan.Gaps, " "), "distinct matching footage") {
		t.Fatal("missing coverage was not explained")
	}
}

func TestNarrationTimelineRejectsAlteredVoiceAndRepeatedVideo(t *testing.T) {
	req, base := generatedNarration(t)
	for _, test := range []struct {
		name   string
		change func(*Plan)
	}{
		{"omitted pause", func(p *Plan) { p.Blocks[0].Narration.In = .2 }},
		{"reordered voice", func(p *Plan) { p.Blocks[0].Narration.In = 1; p.Blocks[0].Narration.Out = 6.8 }},
		{"video original audio", func(p *Plan) { p.Blocks[0].Narration.SourceID = "forest" }},
		{"speed change", func(p *Plan) { p.Blocks[0].Visual.Out -= .5 }},
		{"invented source", func(p *Plan) { p.Blocks[0].Visual.SourceID = "unknown" }},
		{"outside source", func(p *Plan) { p.Blocks[0].Visual.In = -1 }},
		{"looped visuals", func(p *Plan) {
			p.Blocks[1].CandidateID = "forest-scene"
			p.Blocks[1].Visual = &Interval{"forest", 0, 4.2}
		}},
		{"truncated ending", func(p *Plan) { p.Blocks = p.Blocks[:1] }},
	} {
		t.Run(test.name, func(t *testing.T) {
			plan := clonePlan(base.Plan)
			test.change(&plan)
			if _, err := BuildNarrationTimeline(plan, req.Assets); err == nil {
				t.Fatal("unsafe narration EDL was executable")
			}
		})
	}
}

func TestNarrationVisualEditsKeepVoiceAndRespectLocks(t *testing.T) {
	req, base := generatedNarration(t)
	req.Base = &base
	req.Action = "alternate"
	req.BlockID = base.Plan.Blocks[0].ID
	req.CandidateID = "meadow-scene"
	if err := ValidateEdit(req); err != nil {
		t.Fatal(err)
	}
	plan, err := editNarrationPlan(req)
	if err != nil {
		t.Fatal(err)
	}
	timeline, err := BuildNarrationTimeline(plan, req.Assets)
	if err != nil {
		t.Fatal(err)
	}
	if timeline[0].Video.SourceID != "meadow" {
		t.Fatal("silent visual alternate incorrectly required speech equivalence")
	}
	for i := range timeline {
		if !reflect.DeepEqual(timeline[i].Audio, base.Timeline[i].Audio) || !reflect.DeepEqual(timeline[i].Words, base.Timeline[i].Words) {
			t.Fatal("visual alternate changed the voice")
		}
	}
	base.Plan.Blocks[0].Locked = true
	if err = ValidateEdit(req); err == nil {
		t.Fatal("locked visual was replaceable")
	}
	base.Plan.Blocks[0].Locked = false
	req.Action = "faster"
	if err = ValidateEdit(req); err == nil {
		t.Fatal("narration could be sped up by a generic speech action")
	}
}

func TestNarrationAutomaticVisualRepairRechecksActualOutput(t *testing.T) {
	req := narrationFixture()
	defect := readyReport(1)
	defect.Issues = []Issue{{ID: "match", Type: "visual_match", Severity: "major", BlockID: "visual-001", SourceIDs: []string{"forest", "voice"}, Evidence: "The selected footage does not illustrate the original recorded description.", Confidence: 1, Operation: "use_alternative", CandidateID: "meadow-scene"}}
	media := &fakeMedia{reports: []Report{defect, readyReport(2)}}
	checkpoint := &memoryCheckpoints{}
	result, err := New(media, &fakeGenerator{responses: []string{narrationProposalJSON()}}, DefaultLimits()).Run(context.Background(), req, checkpoint)
	if err != nil {
		t.Fatal(err)
	}
	if result.Best.Report.Status != "ready" || len(result.Attempts) != 1 || !result.Attempts[0].Accepted || len(media.renders) != 2 || media.reviews != 2 {
		t.Fatalf("visual repair was not bounded and verified: %+v", result)
	}
	for i := range media.renders[0].Timeline {
		if !reflect.DeepEqual(media.renders[0].Timeline[i].Audio, result.Best.Timeline[i].Audio) {
			t.Fatal("automatic visual repair changed recorded voice")
		}
	}
}

func TestNarrationModeValidationAndSeparateUploadLimit(t *testing.T) {
	req := narrationFixture()
	limits := DefaultLimits()
	limits.MaxFiles = 3
	if err := ValidateAssets(req.Assets, limits); err != nil {
		t.Fatalf("three videos plus one voice must fit: %v", err)
	}
	for _, test := range []struct {
		name   string
		change func(*Request)
	}{
		{"voice used in speech mode", func(r *Request) { r.Options.Narration = false }},
		{"missing voice", func(r *Request) { r.Assets = r.Assets[1:] }},
		{"voice only", func(r *Request) { r.Assets = r.Assets[:1] }},
		{"two voices", func(r *Request) { r.Assets = append(r.Assets, r.Assets[0]) }},
		{"voice excluded", func(r *Request) { r.Assets[0].Include = "excluded" }},
		{"voice too long", func(r *Request) { r.Assets[0].Duration = 181 }},
		{"voice too large", func(r *Request) { r.Assets[0].Size = MaxNarrationBytes + 1 }},
	} {
		t.Run(test.name, func(t *testing.T) {
			r := narrationFixture()
			test.change(&r)
			if err := ValidateNarrationAssets(r.Assets, r.Options); err == nil {
				t.Fatal("invalid narration source set accepted")
			}
		})
	}
	options := req.Options
	options.TargetSeconds = 180
	if err := ValidateOptions(options); err != nil {
		t.Fatal("irrelevant narration target duration blocked original voice")
	}
}

func TestCaptionWordCanSpanVisualCutWithoutChangingVoice(t *testing.T) {
	req := narrationFixture()
	req.Assets[0].Candidates[0].Words = []Word{{"Long original word", 1, 3}}
	plan := Plan{Blocks: []Block{{ID: "first", CandidateID: "forest-scene", Visual: &Interval{"forest", 0, 2}, Narration: &Interval{"voice", 0, 2}, Crop: "fit"}, {ID: "second", CandidateID: "river-scene", Visual: &Interval{"river", 0, 8}, Narration: &Interval{"voice", 2, 10}, Crop: "fit"}}}
	timeline, err := BuildNarrationTimeline(plan, req.Assets)
	if err != nil {
		t.Fatal(err)
	}
	if len(timeline[0].Words) != 1 || timeline[0].Words[0].End != 3 || len(timeline[1].Words) != 0 {
		t.Fatal("caption text or timing was clipped/duplicated at a visual cut")
	}
}

func TestNarrationImproveFlowKeepsLockedVisualAndVoiceSchedule(t *testing.T) {
	req, base := generatedNarration(t)
	base.Plan.Blocks[0].Locked = true
	req.Base = &base
	req.Action = "improve_flow"
	req.VersionStart = 2
	proposal := narrationProposal{Title: "More relevant visuals", Selections: []narrationSelection{{SlotID: base.Plan.Blocks[0].ID, CandidateIDs: []string{"meadow-scene"}}, {SlotID: base.Plan.Blocks[1].ID, CandidateIDs: []string{"meadow-scene"}}, {SlotID: base.Plan.Blocks[2].ID, CandidateIDs: []string{"river-scene"}}}}
	raw, _ := json.Marshal(proposal)
	result, err := New(&fakeMedia{}, &fakeGenerator{responses: []string{string(raw)}}, DefaultLimits()).Run(context.Background(), req, &memoryCheckpoints{})
	if err != nil {
		t.Fatal(err)
	}
	if result.Best.Number != 2 || result.Best.Plan.Blocks[0].CandidateID != "forest-scene" || result.Best.Plan.Blocks[1].CandidateID != "meadow-scene" {
		t.Fatalf("visual flow improvement lost locks or failed to use known video: %+v", result.Best.Plan)
	}
	for i := range base.Timeline {
		if !reflect.DeepEqual(base.Timeline[i].Audio, result.Best.Timeline[i].Audio) || !reflect.DeepEqual(base.Timeline[i].Words, result.Best.Timeline[i].Words) {
			t.Fatal("improve flow changed narration schedule")
		}
	}
}

func TestNarrationReviewRegressionPreservesPriorAcceptedVersion(t *testing.T) {
	req, base := generatedNarration(t)
	req.Base = &base
	req.Action = "alternate"
	req.BlockID = base.Plan.Blocks[0].ID
	req.CandidateID = "meadow-scene"
	req.VersionStart = 2
	defect := readyReport(2)
	defect.Coverage.Audio = false
	defect.Coverage.Incomplete = []string{"Original recorded voice could not be fully verified."}
	checkpoint := &memoryCheckpoints{}
	result, err := New(&fakeMedia{reports: []Report{defect}}, &fakeGenerator{}, DefaultLimits()).Run(context.Background(), req, checkpoint)
	if err != nil {
		t.Fatal(err)
	}
	if result.Best.Number != base.Number || result.Best.Output.Key != base.Output.Key || checkpoint.versions[len(checkpoint.versions)-1].Accepted {
		t.Fatal("unverified narration edit replaced the last usable version")
	}
}

func TestNarrationAudioDefectCannotTriggerVisualOnlyRepair(t *testing.T) {
	req, base := generatedNarration(t)
	base.Report.Issues = []Issue{{Type: "audio_cut", Severity: "critical", BlockID: base.Plan.Blocks[0].ID, Operation: "use_alternative", CandidateID: "meadow-scene", Evidence: "The original voice requires review."}}
	state := runState{builder: New(&fakeMedia{}, nil, DefaultLimits()), req: req, tried: make(map[string]bool), next: 2}
	if _, _, _, ok := state.nextNarrationRepair(base); ok {
		t.Fatal("changing visuals cannot repair the original recorded voice")
	}
}

func TestNarrationSelectedVisualSequenceUsesDistinctOriginalMoments(t *testing.T) {
	req := narrationFixture()
	proposal := narrationProposal{Title: "Matched sequence", Selections: []narrationSelection{{SlotID: "voice-001", CandidateIDs: []string{"forest-scene", "river-scene"}}, {SlotID: "voice-002", CandidateIDs: []string{"meadow-scene"}}, {SlotID: "voice-003", CandidateIDs: []string{"river-scene"}}}}
	raw, _ := json.Marshal(proposal)
	result, err := New(&fakeMedia{}, &fakeGenerator{responses: []string{string(raw)}}, DefaultLimits()).Run(context.Background(), req, &memoryCheckpoints{})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Best.Plan.Blocks) != 4 || result.Best.Plan.Blocks[0].CandidateID != "forest-scene" || result.Best.Plan.Blocks[1].CandidateID != "river-scene" || result.Best.Output.Duration != 10 {
		t.Fatalf("ordered visual choices were discarded or the voice was shortened: %+v", result.Best.Plan)
	}
}

func TestNarrationSentencesWithDifferentSubjectsGetSeparateVisualSlots(t *testing.T) {
	req := narrationFixture()
	req.Assets[0].Duration = 8
	req.Assets[0].Candidates[0].Out = 8
	req.Assets[0].Candidates[0].Text = "First a young woman speaks. Then an older man responds."
	req.Assets[0].Candidates[0].Words = []Word{{"First", .2, .6}, {"a young woman", .6, 2.4}, {"speaks.", 2.4, 3}, {"Then", 3.25, 3.6}, {"an older man", 3.6, 5.3}, {"responds.", 5.3, 6}}
	slots, err := narrationSlots(req)
	if err != nil {
		t.Fatal(err)
	}
	if len(slots) != 2 || slots[0].Out != 3 || slots[1].In != 3 || slots[1].Out != 8 || strings.Contains(slots[0].Text, "older man") || !strings.Contains(slots[1].Text, "older man") {
		t.Fatalf("six-second bin merged independent visual subjects: %+v", slots)
	}
	proposal := narrationProposal{Selections: []narrationSelection{{SlotID: slots[0].ID, CandidateIDs: []string{"forest-scene"}}, {SlotID: slots[1].ID, CandidateIDs: []string{"river-scene"}}}}
	raw, _ := json.Marshal(proposal)
	result, err := New(&fakeMedia{}, &fakeGenerator{responses: []string{string(raw)}}, DefaultLimits()).Run(context.Background(), req, &memoryCheckpoints{})
	if err != nil {
		t.Fatal(err)
	}
	if result.Best.Timeline[0].OutputOut != 3 || result.Best.Timeline[1].OutputIn != 3 || result.Best.Timeline[1].Video.SourceID != "river" || result.Best.Output.Duration != 8 {
		t.Fatal("sentence-to-shot boundary lost its original narration clock")
	}
}

func TestNarrationResumePreservesAcceptedVoiceAndReservedAttempts(t *testing.T) {
	req, base := generatedNarration(t)
	req.Base = &base
	req.Action = "resume"
	req.VersionStart = 4
	req.PreviousAttempts = []Attempt{{IssueID: "old-match", Operation: "use_alternative", BlockID: base.Plan.Blocks[0].ID, CandidateID: "meadow-scene", Version: 3, Reason: "Reserved before worker restart."}}
	media := &fakeMedia{}
	ai := &fakeGenerator{}
	result, err := New(media, ai, DefaultLimits()).Run(context.Background(), req, &memoryCheckpoints{})
	if err != nil {
		t.Fatal(err)
	}
	if result.Best.Number != 4 || result.Best.Parent != base.Number || len(result.Attempts) != 1 || len(media.renders) != 1 || !reflect.DeepEqual(result.Best.Timeline, base.Timeline) {
		t.Fatalf("durable resume changed original voice or replayed a repair: %+v", result)
	}
	if ai.calls != 1 || !strings.Contains(ai.prompts[0], "Independently review a narration-led montage") {
		t.Fatal("resume unnecessarily replanned the accepted voice timeline")
	}
}
