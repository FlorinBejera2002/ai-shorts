package media

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestStudioCleanupPropagatesFailureBeforeDeletionCanComplete(t *testing.T) {
	status := http.StatusServiceUnavailable
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
		_, _ = w.Write([]byte(`{"deleted":true}`))
	}))
	defer server.Close()
	service := NewService(Config{StudioURL: server.URL, StudioSecret: strings.Repeat("s", 32)}, nil, nil, nil, nil)
	ctx := context.Background()
	owner := "11111111-1111-4111-8111-111111111111"
	if err := service.DeleteStudioJob(ctx, owner, "story"); err == nil {
		t.Fatal("Studio deletion failure ignored")
	}
	if err := service.purgeStudioOwner(ctx, owner); err == nil {
		t.Fatal("owner cleanup failure ignored")
	}
	status = http.StatusOK
	if err := service.DeleteStudioJob(ctx, owner, "story"); err != nil {
		t.Fatal(err)
	}
	if err := service.purgeStudioOwner(ctx, owner); err != nil {
		t.Fatal(err)
	}
}
