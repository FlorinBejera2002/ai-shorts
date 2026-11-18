package processing

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
)

func TestStoryProviderDiagnosticsDoNotExposeArbitraryAdapterErrors(t *testing.T) {
	for _, test := range []struct {
		err  error
		want string
	}{
		{fmt.Errorf("wrapped: %w", &aiprovider.RequestError{StatusCode: http.StatusPaymentRequired}), "spending limit"},
		{aiprovider.ErrUnavailable, "temporarily unavailable"},
		{aiprovider.ErrOutputLimit, "output limit"},
		{errors.New("private-key private-source prompt contents"), "could not complete"},
	} {
		got := storyProviderFailure(test.err)
		if !strings.Contains(got, test.want) || strings.Contains(got, "private-") || strings.Contains(got, "prompt contents") {
			t.Fatalf("unsafe or unactionable diagnostic: %s", got)
		}
	}
}
