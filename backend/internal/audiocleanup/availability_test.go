package audiocleanup

import (
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAvailabilityRequiresExplicitVerifiedWorkerConfiguration(t *testing.T) {
	for _, tc := range []struct {
		name, verified, binary, model string
		want                          bool
	}{
		{"default unavailable", "", "", "", false},
		{"paths are not verification", "", "/runtime/deep-filter", "/runtime/model", false},
		{"verification needs binary", "true", "", "/runtime/model", false},
		{"verification needs model", "true", "/runtime/deep-filter", "", false},
		{"configured", "true", "/runtime/deep-filter", "/runtime/model", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			env := map[string]string{"AUDIO_CLEANUP_VERIFIED": tc.verified, "DEEPFILTER_PATH": tc.binary, "DEEPFILTER_MODEL": tc.model}
			if got := Available(func(key string) string { return env[key] }); got != tc.want {
				t.Fatalf("available=%v", got)
			}
		})
	}
}
func TestUnavailableRejectsCleanupButAllowsOriginal(t *testing.T) {
	t.Setenv("AUDIO_CLEANUP_VERIFIED", "false")
	if !errors.Is(Check(&Settings{Enabled: true}), ErrUnavailable) {
		t.Fatal("accepted unavailable cleanup")
	}
	if Check(nil) != nil || Check(&Settings{Enabled: false}) != nil {
		t.Fatal("blocked original audio")
	}
	t.Setenv("AUDIO_CLEANUP_VERIFIED", "true")
	t.Setenv("DEEPFILTER_PATH", "/private/runtime")
	t.Setenv("DEEPFILTER_MODEL", "/private/model")
	if err := Check(&Settings{Enabled: true}); err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	capabilities(response, httptest.NewRequest("GET", "/api/media-capabilities", nil))
	if !strings.Contains(response.Body.String(), `"available":true`) || strings.Contains(response.Body.String(), "private/") {
		t.Fatal(response.Body.String())
	}
	if !strings.Contains(response.Header().Get("Cache-Control"), "no-store") {
		t.Fatal("capability must not be publicly cached")
	}
}
