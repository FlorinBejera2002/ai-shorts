package locale

import "testing"

func TestSupportedAndPrefixes(t *testing.T) {
	for code, want := range map[string]bool{"en": true, "ro": true, "es": true, "fr": false, "": false, "ES": false} {
		if Supported(code) != want {
			t.Fatalf("Supported(%q) = %v, want %v", code, !want, want)
		}
	}
	for code, want := range map[string]string{"en": "", "ro": "/ro", "es": "/es", "fr": ""} {
		if got := PathPrefix(code); got != want {
			t.Fatalf("PathPrefix(%q) = %q, want %q", code, got, want)
		}
	}
	if Normalize("es") != "es" || Normalize("fr") != "en" {
		t.Fatal("Normalize must keep supported locales and fall back to en")
	}
}
