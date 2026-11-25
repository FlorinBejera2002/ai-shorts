package story

import (
	"strings"
	"testing"

	"sneepcut/backend-go/internal/audiocleanup"
)

func footageFixtures() []Asset {
	return []Asset{
		{ID: testFootageID(2), Kind: "video", Name: "interview-b.mp4", Order: 1},
		{ID: testFootageID(1), Kind: "video", Name: "interview-a.mp4", Order: 0},
		{ID: testFootageID(5), Kind: "narration", Name: "voice.m4a", Order: 9},
	}
}

func TestBriefFootageTokensValidateAgainstProjectFootage(t *testing.T) {
	brief := "Start with @[asset:" + testFootageID(2) + "] and end with @[asset:" + testFootageID(1) + "]."
	if err := ValidateBriefFootage(brief, footageFixtures()); err != nil {
		t.Fatalf("own footage rejected: %v", err)
	}
	if err := ValidateBriefFootage("Use @[asset:"+testFootageID(8)+"]", footageFixtures()); err == nil {
		t.Fatal("foreign footage token accepted")
	}
	if err := ValidateBriefFootage("Use @[asset:"+testFootageID(5)+"]", footageFixtures()); err == nil {
		t.Fatal("narration recording accepted as a footage reference")
	}
	if err := ValidateBriefFootage("Use @[asset:"+testFootageID(1)+"]", nil); err == nil {
		t.Fatal("token accepted without any project footage")
	}
	if err := ValidateBriefFootage("No references here", nil); err != nil {
		t.Fatalf("plain brief rejected: %v", err)
	}
}

func TestBriefFootageIDsAreDistinctAndLowercase(t *testing.T) {
	upper := strings.ToUpper(testFootageID(1))
	ids := BriefFootageIDs("@[asset:" + upper + "] @[asset:" + testFootageID(1) + "] @[asset:" + testFootageID(2) + "]")
	if len(ids) != 2 || ids[0] != testFootageID(1) || ids[1] != testFootageID(2) {
		t.Fatalf("ids = %v", ids)
	}
}

func TestResolveBriefFootageUsesFootageOrderAndLeavesStoredTextAlone(t *testing.T) {
	stored := "Start with @[asset:" + testFootageID(2) + "], keep @[asset:" + testFootageID(1) + "] last."
	resolved, refs := ResolveBriefFootage(stored, footageFixtures())
	if strings.Contains(resolved, "@[asset:") {
		t.Fatalf("token survived resolution: %s", resolved)
	}
	if !strings.Contains(resolved, `"Filmarea 2"`) || !strings.Contains(resolved, `"Filmarea 1"`) || !strings.Contains(resolved, testFootageID(2)) {
		t.Fatalf("footage not explicit: %s", resolved)
	}
	if len(refs) != 2 || refs[0].SourceID != testFootageID(2) || refs[0].Position != 2 || refs[1].Name != "interview-a.mp4" || refs[1].Position != 1 {
		t.Fatalf("refs = %+v", refs)
	}
	if !strings.Contains(stored, "@[asset:"+testFootageID(2)+"]") {
		t.Fatal("stored brief was mutated")
	}
}

func TestEditingBriefCarriesResolvedFootageToModels(t *testing.T) {
	req := Request{Options: DefaultOptions(), Assets: footageFixtures()}
	req.Options.Brief = "Lead with @[asset:" + testFootageID(1) + "].\nKeep it short."
	brief := BuildEditingBrief(req)
	if strings.Contains(brief.OriginalRequest, "@[asset:") {
		t.Fatalf("raw token reached the editing brief: %q", brief.OriginalRequest)
	}
	if len(brief.ReferencedFootage) != 1 || brief.ReferencedFootage[0].SourceID != testFootageID(1) {
		t.Fatalf("referenced footage = %+v", brief.ReferencedFootage)
	}
	if len(brief.ExplicitInstructions) != 2 || !strings.Contains(brief.ExplicitInstructions[0], "Filmarea 1") {
		t.Fatalf("instructions = %v", brief.ExplicitInstructions)
	}
}

func TestEditorialOptionsForHidesRawFootageTokens(t *testing.T) {
	req := Request{Options: DefaultOptions(), Assets: footageFixtures()}
	req.Options.Brief = "Use @[asset:" + testFootageID(2) + "]"
	options := EditorialOptionsFor(req)
	if strings.Contains(options.Brief, "@[asset:") || !strings.Contains(options.Brief, "Filmarea 2") {
		t.Fatalf("editorial brief = %q", options.Brief)
	}
	if !strings.Contains(req.Options.Brief, "@[asset:") {
		t.Fatal("request brief was mutated")
	}
}

func TestCleanupAppliesOnlyToSelectedFootageButAlwaysToNarration(t *testing.T) {
	footage := Asset{ID: testFootageID(1), Kind: "video"}
	narration := Asset{ID: testFootageID(5), Kind: "narration"}
	o := DefaultOptions()
	if CleanupApplies(o, footage) {
		t.Fatal("cleanup applied while disabled")
	}
	o.AudioCleanup = &audiocleanup.Settings{Enabled: true}
	if !CleanupApplies(o, footage) {
		t.Fatal("empty selection must apply to all footage")
	}
	o.AudioCleanup.AssetIDs = []string{testFootageID(2)}
	if CleanupApplies(o, footage) {
		t.Fatal("unselected footage was cleaned")
	}
	if !CleanupApplies(o, narration) {
		t.Fatal("narration recording must remain eligible")
	}
	o.AudioCleanup.AssetIDs = []string{testFootageID(1)}
	if !CleanupApplies(o, footage) {
		t.Fatal("selected footage was not cleaned")
	}
}
