// Package audiocleanup defines reversible, opt-in speech-noise reduction.
package audiocleanup

type Settings struct {
	Enabled bool `json:"enabled"`
}

func Enabled(s *Settings) bool { return s != nil && s.Enabled }

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
