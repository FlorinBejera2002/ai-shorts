package story

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestSemanticReviewNormalizesOnlyKnownUniqueCandidateSourceIDs(t *testing.T) {
	for _, test := range []struct {
		name     string
		ids      []string
		complete bool
	}{
		{"exact known candidate", []string{"a"}, true},
		{"already correct source", []string{"source-a"}, true},
		{"deduplicated exact mappings", []string{"a", "source-a", "a-alt"}, true},
		{"invented suffix", []string{"source-a-s999"}, false},
		{"candidate prefix", []string{"a-al"}, false},
		{"wrong case", []string{"A-ALT"}, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			req := fixtureRequest()
			version := fixtureBase(t, req)
			issue := Issue{Type: "hook", Severity: "minor", BlockID: "block-a", SourceIDs: test.ids, Evidence: "The complete opening phrase could provide a clearer introduction.", Confidence: .9}
			raw, _ := json.Marshal(semanticReview{Complete: true, Issues: []Issue{issue}})
			ai := &fakeGenerator{responses: []string{string(raw)}}
			report := New(&fakeMedia{}, ai, DefaultLimits()).preReview(context.Background(), req, version, &runBudget{max: 12})
			if report.Coverage.Semantics != test.complete {
				t.Fatalf("incorrect source evidence acceptance: %+v", report)
			}
			if test.complete {
				if len(report.Issues) != 1 || !reflect.DeepEqual(report.Issues[0].SourceIDs, []string{"source-a"}) || report.Issues[0].Evidence != issue.Evidence {
					t.Fatal("normalization changed evidence or failed exact deduplication")
				}
			} else if report.Status != "needs_review" || !strings.Contains(strings.Join(report.Coverage.Incomplete, " "), "issues[0].source_ids contains unknown source") {
				t.Fatalf("unknown source must remain a visible incomplete review: %+v", report)
			}
			if !strings.Contains(ai.prompts[0], `"allowed_source_ids":["source-a"]`) || !strings.Contains(ai.prompts[0], `"candidate_source_ids":{"a":"source-a"`) {
				t.Fatal("review payload omitted the explicit source whitelist or candidate mapping")
			}
		})
	}
}

func TestSemanticSourceNormalizationRejectsAmbiguousOrUnverifiedAssociation(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func([]Asset)
	}{
		{"duplicate candidate in same source", func(a []Asset) { a[0].Candidates = append(a[0].Candidates, a[0].Candidates[0]) }},
		{"candidate claims unrelated source", func(a []Asset) { a[0].Candidates[0].SourceID = "another-source" }},
	} {
		t.Run(test.name, func(t *testing.T) {
			assets := []Asset{fixtureAsset()}
			test.change(assets)
			issues := []Issue{{SourceIDs: []string{"a"}}}
			if err := normalizeSemanticSourceIDs(issues, assets); err == nil || !strings.Contains(err.Error(), "ambiguous candidate") {
				t.Fatalf("unverified candidate mapping was accepted: %v", err)
			}
		})
	}
	assets := []Asset{fixtureAsset(), fixtureAsset()}
	assets[1].ID = "source-b"
	assets[1].Candidates[0].SourceID = "source-b"
	if err := normalizeSemanticSourceIDs([]Issue{{SourceIDs: []string{"a"}}}, assets); err == nil {
		t.Fatal("duplicate candidate across different original files was guessed")
	}
	unknown := "invented\n" + strings.Repeat("x", 1000)
	err := normalizeSemanticSourceIDs([]Issue{{SourceIDs: []string{unknown}}}, []Asset{fixtureAsset()})
	if err == nil || len(err.Error()) > 250 || strings.Contains(err.Error(), "\n") {
		t.Fatalf("diagnostic was unbounded or contained an unescaped newline: %v", err)
	}
}
