package stories

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/story"
)

func TestProviderFailureReportingPreservesOnlySafeCategory(t *testing.T) {
	for _, tc := range []struct {
		err  error
		want string
	}{
		{fmt.Errorf("private-prompt: %w", &aiprovider.RequestError{StatusCode: http.StatusForbidden, LimitSource: "openrouter_key_limit"}), "spending limit"},
		{fmt.Errorf("private-url: %w", aiprovider.ErrNotConfigured), "configured"},
		{errors.New("private-provider-response"), ""},
	} {
		message := providerFailureMessage(tc.err)
		var output bytes.Buffer
		runner := Runner{Logger: slog.New(slog.NewJSONHandler(&output, nil))}
		runner.logRunFailure("synthetic-story", tc.err)
		if !strings.Contains(message, tc.want) || tc.want == "" && message != "" || strings.Contains(message+output.String(), "private-") {
			t.Fatalf("unsafe or missing category: message=%q log=%s", message, output.String())
		}
		if tc.want != "" && !strings.Contains(output.String(), tc.want) {
			t.Fatal("provider category missing from worker log", output.String())
		}
	}
}

func TestProviderFailurePersistsReasonAndRefundsInitialGeneration(t *testing.T) {
	r, user, id, ids := fixture(t, 1)
	e := queue(t, r, user, id, ids)
	err := fmt.Errorf("private-source: %w", &aiprovider.RequestError{StatusCode: http.StatusForbidden, LimitSource: "openrouter_key_limit"})
	if err := e.finish(context.Background(), story.Result{}, err); err != nil {
		t.Fatal(err)
	}
	p, err := r.Get(context.Background(), user, id)
	if err != nil || p.Status != "failed" || !strings.Contains(p.Message, "spending limit") || strings.Contains(p.Message, "private-") || credits(t, r, user) != 100 || len(p.Assets) != 1 {
		t.Fatalf("failure reason, files or credit refund lost: project=%+v err=%v", p, err)
	}
	var message string
	if err := r.db.QueryRow("SELECT progress_message FROM jobs WHERE id=$1", id).Scan(&message); err != nil || message != p.Message {
		t.Fatal("job and story failure messages diverged", message, err)
	}
}
