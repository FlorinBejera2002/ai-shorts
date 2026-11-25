// Package audiocleanup defines reversible, opt-in speech-noise reduction.
package audiocleanup

import "strings"

// Settings selects noise reduction. AssetIDs narrows story footage cleanup to
// the chosen sources; an empty selection applies to every eligible source.
type Settings struct {
	Enabled  bool     `json:"enabled"`
	AssetIDs []string `json:"asset_ids,omitempty"`
}

func Enabled(s *Settings) bool { return s != nil && s.Enabled }

// Selects reports whether cleanup applies to the source with assetID.
func Selects(s *Settings, assetID string) bool {
	if !Enabled(s) {
		return false
	}
	if len(s.AssetIDs) == 0 {
		return true
	}
	for _, id := range s.AssetIDs {
		if strings.EqualFold(id, assetID) {
			return true
		}
	}
	return false
}

// OriginalKey is never replaced. HTTP handlers expose signed URLs, not keys.
type Derivative struct {
	Status      string  `json:"status"`
	Message     string  `json:"message,omitempty"`
	Key         string  `json:"key,omitempty"`
	OriginalKey string  `json:"original_key,omitempty"`
	SourceHash  string  `json:"source_hash,omitempty"`
	Fingerprint string  `json:"fingerprint,omitempty"`
	Provider    string  `json:"provider,omitempty"`
	Duration    float64 `json:"duration,omitempty"`
}
type Failure struct{ Message string }

func (e *Failure) Error() string { return e.Message }
