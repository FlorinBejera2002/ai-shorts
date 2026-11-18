package story

import (
	"reflect"
	"testing"
)

func TestSuccessfulSourceMeaningRefreshClearsOnlyItsOldFailures(t *testing.T) {
	original := []Asset{{ID: "source", Warnings: []string{"Variable frame timing is normalized.", "Source meaning analysis returned invalid source evidence; local source analysis was retained.", "Source frames could not be prepared within analysis limits; visual relevance needs review."}}}
	updated := cloneAssets(original)
	updated[0].SemanticAnalysisVersion = "fresh-success"
	updated[0].Warnings = WithoutSourceMeaningWarnings(updated[0].Warnings)
	updated[0].Warnings = append(updated[0].Warnings, "Some source intervals have no confident sampled visual/semantic description; verify relevance in the rendered story.")
	merged, err := mergeSourceMeaning(original, updated)
	if err != nil || !reflect.DeepEqual(merged[0].Warnings, updated[0].Warnings) || len(original[0].Warnings) != 3 {
		t.Fatalf("successful retry left obsolete warnings or erased unrelated evidence: %+v %v", merged, err)
	}
	updated = cloneAssets(original)
	updated[0].Warnings = nil
	merged, err = mergeSourceMeaning(original, updated)
	if err != nil || !reflect.DeepEqual(merged[0].Warnings, original[0].Warnings) {
		t.Fatal("failed semantic refresh erased pending source findings", err)
	}
}
