package story

import "strings"

// WithoutSourceMeaningWarnings clears only findings owned by a completed
// semantic pass. Codec, transcript, upload and other source warnings survive.
func WithoutSourceMeaningWarnings(warnings []string) []string {
	var retained []string
	for _, warning := range warnings {
		owned := false
		for _, prefix := range []string{
			"Source meaning analysis ", "Source frames could not be prepared ",
			"The configured provider cannot inspect source frames;",
			"Some source intervals have no confident sampled visual/semantic description;",
			"Source semantic analysis was unavailable:",
		} {
			owned = owned || strings.HasPrefix(warning, prefix)
		}
		if !owned {
			retained = append(retained, warning)
		}
	}
	return retained
}
