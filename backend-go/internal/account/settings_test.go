package account

import "testing"

func TestSettingsPreferenceValidation(t *testing.T) {
	valid := defaultPreferences()
	if !valid.valid() {
		t.Fatal("defaults must always be valid")
	}
	invalid := []Preferences{
		func() Preferences { p := valid; p.Locale = "fr"; return p }(),
		func() Preferences { p := valid; p.Theme = "sepia"; return p }(),
		func() Preferences { p := valid; p.Timezone = "Not/A-Timezone"; return p }(),
		func() Preferences { p := valid; p.DefaultAspectRatio = "4:3"; return p }(),
		func() Preferences { p := valid; p.DefaultClipCount = 11; return p }(),
	}
	for _, preferences := range invalid {
		if preferences.valid() {
			t.Fatalf("invalid preferences accepted: %+v", preferences)
		}
	}
}

func TestDeviceLabelDoesNotExposeRawUserAgent(t *testing.T) {
	for userAgent, want := range map[string]string{
		"Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 secret-extension": "Chrome on Windows",
		"Mozilla/5.0 (iPhone) Version/17.0 Mobile Safari/604.1":       "Safari on iOS",
		"unknown-private-client":                                      "Browser on Unknown device",
	} {
		if got := deviceLabel(userAgent); got != want {
			t.Fatalf("%q: got %q want %q", userAgent, got, want)
		}
	}
}
