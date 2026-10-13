package story

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestEditingBriefPreservesOriginalNegationsAndSettings(t *testing.T) {
	req := fixtureRequest()
	req.Options.Brief = "  Păstrează pauzele și repetiția. Nu adăuga muzică.\r\nExclude finalul; începe cu al doilea clip.  "
	req.Options.CaptionMode = "selective"
	req.Options.PreserveOrder = true
	req.Assets[0].Include = "required"
	options, err := NormalizeOptions(req.Options)
	if err != nil || options.Brief != req.Options.Brief || !options.Captions {
		t.Fatalf("normalization lost original request or caption state: %+v %v", options, err)
	}
	brief := BuildEditingBrief(req)
	if brief.OriginalRequest != req.Options.Brief || len(brief.ExplicitInstructions) != 2 || !strings.Contains(brief.ExplicitInstructions[0], "Nu adăuga muzică.") {
		t.Fatalf("explicit wording was rewritten or lost: %+v", brief)
	}
	if brief.SelectedSettings.CaptionMode != "selective" || !brief.SelectedSettings.PreserveOrder || brief.SourceConstraints[0].Include != "required" {
		t.Fatalf("selected settings missing from brief: %+v", brief)
	}
	serialized, _ := json.Marshal(brief)
	if strings.Contains(string(serialized), req.Assets[0].Key) || strings.Contains(string(serialized), req.UserID) {
		t.Fatal("internal brief leaked storage paths or account identity")
	}
}

func TestCaptionModesNormalizeLegacyAndExplicitOptions(t *testing.T) {
	for _, tc := range []struct {
		mode   string
		legacy bool
		want   string
	}{
		{"", false, "off"}, {"", true, "all"}, {"off", true, "off"}, {"all", false, "all"}, {"selective", false, "selective"},
	} {
		t.Run(tc.want+tc.mode, func(t *testing.T) {
			opts := DefaultOptions()
			opts.Captions, opts.CaptionMode = tc.legacy, tc.mode
			got, err := NormalizeOptions(opts)
			if err != nil || got.CaptionMode != tc.want || got.Captions != (tc.want != "off") {
				t.Fatalf("incoherent caption options: %+v %v", got, err)
			}
		})
	}
	opts := DefaultOptions()
	opts.CaptionMode = "sometimes"
	if _, err := NormalizeOptions(opts); err == nil {
		t.Fatal("accepted unknown caption mode")
	}
}

func TestMaterialBriefConflictsAreRejectedBeforeMediaAnalysis(t *testing.T) {
	for _, tc := range []struct{ brief, mode string }{
		{"Fără subtitrări.", "all"},
		{"No captions. Keep the pauses.", "selective"},
		{"Subtitrări pe tot dialogul.", "off"},
		{"Subtitles only where speech is hard to understand.", "all"},
		{"Subtitrări doar unde se aude greu.", "off"},
		{"Durata: 30 secunde.", "off"},
		{"Format: 16:9.", "off"},
	} {
		t.Run(tc.brief, func(t *testing.T) {
			req := fixtureRequest()
			req.Options.Brief, req.Options.CaptionMode = tc.brief, tc.mode
			media := &fakeMedia{}
			_, err := New(media, &fakeGenerator{}, DefaultLimits()).Run(context.Background(), req, &memoryCheckpoints{})
			if err == nil || media.analyses != 0 || len(media.renders) != 0 {
				t.Fatalf("conflicting settings reached processing: err=%v analyses=%d renders=%d", err, media.analyses, len(media.renders))
			}
		})
	}
}

func TestBriefSettingsDoNotInventIntentFromNegatedOrQuotedInstructions(t *testing.T) {
	for _, brief := range []string{
		`Nu vreau fără subtitrări.`,
		`Do not use subtitles only where speech is hard to understand.`,
		`He says "no captions" in the interview.`,
		`Nu folosi format 16:9.`,
		`Nu scurta la durata 30 secunde.`,
		`No captions unless the voice is unclear.`,
	} {
		opts := DefaultOptions()
		opts.Captions = true
		opts.Brief = brief
		if _, err := NormalizeOptions(opts); err != nil {
			t.Fatalf("misread %q: %v", brief, err)
		}
	}
}

func TestLegacyCaptionStyleClearsPreviousExplicitMode(t *testing.T) {
	o := DefaultOptions()
	o.CaptionMode = "selective"
	value := false
	after, err := ApplyStyle(o, Style{Captions: &value})
	if err != nil || EffectiveCaptionMode(after) != "off" || after.Captions {
		t.Fatalf("legacy switch ignored: %+v %v", after, err)
	}
	mode := "all"
	if _, err := ApplyStyle(o, Style{Captions: &value, CaptionMode: &mode}); err == nil {
		t.Fatal("accepted contradictory caption style fields")
	}
}

func TestExplicitCaptionRestyleSupersedesOnlyOriginalCaptionInstruction(t *testing.T) {
	o := DefaultOptions()
	o.Brief = "No captions. Keep the original voice and pauses."
	o.CaptionMode = "off"
	mode := "all"
	after, err := ApplyStyle(o, Style{CaptionMode: &mode})
	if err != nil || !after.CaptionModeRevised || after.Brief != o.Brief {
		t.Fatalf("explicit caption revision lost provenance: %+v %v", after, err)
	}
	if _, err := NormalizeOptions(after); err != nil {
		t.Fatalf("intentional later caption choice blocked: %v", err)
	}
	brief := BuildEditingBrief(Request{Options: after})
	if !brief.SelectedSettings.CaptionModeRevised || brief.OriginalRequest != o.Brief {
		t.Fatal("brief lost later choice or initial wording")
	}
	after.Brief = "Duration: 30 seconds."
	if _, err := NormalizeOptions(after); err == nil {
		t.Fatal("caption revision bypassed unrelated duration conflict")
	}
}

func TestNewStoryDefaultsDoNotAddCaptionsOrReorderSources(t *testing.T) {
	opts := DefaultOptions()
	if EffectiveCaptionMode(opts) != "off" || !opts.PreserveOrder {
		t.Fatalf("creative defaults: %+v", opts)
	}
}

func TestMaterialPlannerClarificationStopsBeforeRendering(t *testing.T) {
	req := fixtureRequest()
	req.Options.Brief = "Include the demonstration, and exclude the demonstration entirely."
	ai := &fakeGenerator{responses: []string{`{"title":"","summary":"","blocks":[],"gaps":[],"clarifications":["Should the demonstration be included or excluded?"]}`}}
	media := &fakeMedia{}
	_, err := New(media, ai, DefaultLimits()).Run(context.Background(), req, &memoryCheckpoints{})
	var clarification *ClarificationError
	if !errors.As(err, &clarification) || clarification.Question != "Should the demonstration be included or excluded?" {
		t.Fatalf("ambiguity silently fell back to a montage: %v", err)
	}
	if len(media.renders) != 0 || media.reviews != 0 {
		t.Fatal("ambiguous request reached media rendering")
	}
}

func TestPlannerClarificationIsBoundedAndReadable(t *testing.T) {
	for _, questions := range [][]string{{""}, {strings.Repeat("x", 321)}, {"Question one?", "Question two?", "Question three?", "Question four?"}} {
		var clarification *ClarificationError
		if err := planningClarification(questions); !errors.As(err, &clarification) || len(clarification.Question) > 960 {
			t.Fatalf("invalid question did not stop safely: %+v %v", questions, err)
		}
	}
	err := planningClarification([]string{"  Which scene\nshould be kept?  "})
	if err.Error() != "Which scene should be kept?" {
		t.Fatalf("question formatting leaked: %q", err)
	}
}

func TestFallbackPreservesExpressiveGapsRepeatsAndFullFrame(t *testing.T) {
	req := fixtureRequest()
	req.Assets[0].Candidates = append(req.Assets[0].Candidates, Candidate{ID: "pause", SourceID: req.Assets[0].ID, In: 4, Out: 5, Role: "b_roll"})
	if err := prepareCandidates(req.Assets); err != nil {
		t.Fatal(err)
	}
	plan := fallbackPlan(req)
	var ids []string
	for _, block := range plan.Blocks {
		ids = append(ids, block.CandidateID)
		if block.Crop != "fit" {
			t.Fatal("fallback cropped the original shot without a request")
		}
	}
	if !reflect.DeepEqual(ids, []string{"a", "pause", "a-alt", "b"}) {
		t.Fatalf("discarded pause or repeated phrase: %v", ids)
	}
	if plan.EditingBrief == nil || plan.EditingBrief.OriginalRequest != req.Options.Brief {
		t.Fatal("plan omitted interpretation audit")
	}
}

func TestVisualFallbackPreservesMultipleSourceOrderAndRequiredSource(t *testing.T) {
	req := Request{Options: Options{TargetSeconds: 12, PreserveOrder: true}, Assets: []Asset{
		{ID: "one", Order: 1, Candidates: []Candidate{{ID: "a", SourceID: "one", In: 0, Out: 4}, {ID: "b", SourceID: "one", In: 4, Out: 8}}},
		{ID: "two", Order: 2, Candidates: []Candidate{{ID: "c", SourceID: "two", In: 0, Out: 4}, {ID: "d", SourceID: "two", In: 4, Out: 8}}},
	}}
	plan := fallbackPlan(req)
	if issues := ValidatePlan(plan, req.Assets, req.Options, nil); hasBlocking(issues) {
		t.Fatalf("fallback shuffled sources: %+v", issues)
	}
	req.Options.TargetSeconds = 1
	req.Assets[1].Include = "required"
	plan = fallbackPlan(req)
	if issues := ValidatePlan(plan, req.Assets, req.Options, nil); hasBlocking(issues) {
		t.Fatalf("duration excluded required footage: %+v", issues)
	}
}
