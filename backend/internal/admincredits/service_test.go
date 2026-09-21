package admincredits

import (
	"testing"
	"time"
)

func TestValidate(t *testing.T) {
	cutoff := time.Date(2026, 9, 18, 0, 0, 0, 0, time.UTC)
	for _, test := range []struct {
		name   string
		key    string
		amount int
		cutoff time.Time
		valid  bool
	}{
		{"valid", "launch-2026.09", 100, cutoff, true},
		{"bad key", "spaces are unsafe", 100, cutoff, false},
		{"bad amount", "batch", 0, cutoff, false},
		{"missing cutoff", "batch", 100, time.Time{}, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := validate(test.key, test.amount, test.cutoff); (got == nil) != test.valid {
				t.Fatalf("validate() error = %v", got)
			}
		})
	}
}
