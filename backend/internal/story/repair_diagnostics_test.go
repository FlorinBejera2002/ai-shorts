package story

import (
	"reflect"
	"strings"
	"testing"
)

func TestRepairRejectionReasonExplainsExistingAcceptanceGuards(t *testing.T) {
	target := Issue{Type: "context", Severity: "major", BlockID: "opening", CandidateID: "source-6-s2", SourceIDs: []string{"source-6"}, Evidence: "The opening omits the original qualification."}
	other := Issue{Type: "context", Severity: "major", BlockID: "ending", CandidateID: "source-7-s1", SourceIDs: []string{"source-7"}, Evidence: "The ending omits the following original sentence."}
	for _, test := range []struct {
		name     string
		setup    func(*Report, *Report)
		accepted bool
		contains []string
	}{
		{
			name: "unchanged score and a different omission",
			setup: func(before, after *Report) {
				before.Issues = []Issue{target}
				after.Issues = []Issue{other}
			},
			contains: []string{"review score did not decrease (before 100, after 100)", "new blocking finding", `block "ending"`, `candidate "source-7-s1"`, other.Evidence},
		},
		{
			name: "improved score but target persists",
			setup: func(before, after *Report) {
				before.Issues = []Issue{target, other}
				after.Issues = []Issue{target}
			},
			contains: []string{"target finding persists", `block "opening"`, target.Evidence},
		},
		{
			name: "improved score but new blocking defect",
			setup: func(before, after *Report) {
				critical := target
				critical.Severity = "critical"
				before.Issues = []Issue{critical}
				after.Issues = []Issue{other}
			},
			contains: []string{"new blocking finding", other.Evidence},
		},
		{
			name: "review lost coverage",
			setup: func(before, after *Report) {
				before.Issues = []Issue{target}
				after.Coverage.Semantics = false
				after.Coverage.Incomplete = []string{"Reviewer could not link source-7-s1 to the timeline."}
			},
			contains: []string{"review score did not decrease (before 100, after 1100)", "review coverage lost: semantics", "incomplete review: Reviewer could not link source-7-s1"},
		},
		{
			name: "remaining incomplete review is not a new acceptance predicate",
			setup: func(before, after *Report) {
				before.Issues = []Issue{target, other}
				after.Issues = []Issue{other}
				before.Coverage.File, after.Coverage.File = false, false
				before.Coverage.Incomplete = []string{"Pending media verification."}
				after.Coverage.Incomplete = []string{"Pending media verification."}
			},
			accepted: true,
		},
		{
			name: "resolved target",
			setup: func(before, after *Report) {
				before.Issues = []Issue{target}
				resolved := target
				resolved.Resolved = true
				after.Issues = []Issue{resolved}
			},
			accepted: true,
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			before, after := readyReport(1), readyReport(2)
			test.setup(&before, &after)
			reason := repairRejectionReason(before, after, target)
			if accepted := repairImproves(before, after, target); accepted != test.accepted || (reason == "") != accepted {
				t.Fatalf("diagnostic diverged from the unchanged acceptance guards: accepted=%v reason=%q", accepted, reason)
			}
			for _, expected := range test.contains {
				if !strings.Contains(reason, expected) {
					t.Errorf("missing %q in %q", expected, reason)
				}
			}
		})
	}
}

func TestRepairRejectionReasonUsesSourceFindingIdentityAfterReflow(t *testing.T) {
	target := Issue{Type: "context", Severity: "major", BlockID: "opening", Evidence: "Missing original setup."}
	persistent := Issue{Type: "audio_cut", Severity: "major", BlockID: "tail", Start: 5.2, End: 5.8, Evidence: "The final phoneme is clipped."}
	before, after := readyReport(1), readyReport(2)
	before.Issues = []Issue{target, persistent}
	persistent.Start, persistent.End, persistent.Evidence = 8.2, 8.8, "The final phoneme is truncated."
	after.Issues = []Issue{persistent}
	oldTimeline := []Entry{{BlockID: "tail", OutputIn: 5, OutputOut: 7}}
	newTimeline := []Entry{{BlockID: "tail", OutputIn: 8, OutputOut: 10}}
	originalBefore, originalAfter := before, after
	if reason := repairRejectionReason(before, after, target, oldTimeline, newTimeline); reason != "" {
		t.Fatalf("ordinary reflow became a false rejection: %s", reason)
	}
	reason := repairRejectionReason(before, after, before.Issues[1], oldTimeline, newTimeline)
	if !strings.Contains(reason, "target finding persists") || strings.Contains(reason, "new blocking finding") {
		t.Fatalf("reflow diagnostic disagrees with finding identity: %s", reason)
	}
	if !reflect.DeepEqual(before, originalBefore) || !reflect.DeepEqual(after, originalAfter) {
		t.Fatal("diagnostic modified the review evidence")
	}
}
