package media

import (
	"context"
	"net/http/httptest"
	"testing"
	"time"
)

type retryNonce struct {
	mockNonce
	wait time.Duration
}

func (n *retryNonce) RetryAfter(context.Context, string) (time.Duration, error) { return n.wait, nil }
func TestUploadBusyUsesRemainingWindowWithoutChangingAllowance(t *testing.T) {
	for _, wait := range []time.Duration{1500 * time.Millisecond, 37 * time.Second, 0} {
		s, mock, _, _ := uploadService(t)
		s.nonce = &retryNonce{mockNonce: mockNonce{limited: true}, wait: wait}
		activeAccount(mock, "member", false)
		err := s.allow(context.Background(), testUserID, "upload", 60)
		if err == nil {
			t.Fatal("rate protection bypassed")
		}
		w := httptest.NewRecorder()
		mediaError(w, err)
		want := "37"
		if wait == 1500*time.Millisecond {
			want = "2"
		}
		if wait == 0 {
			want = "1"
		}
		if w.Code != 429 || w.Header().Get("Retry-After") != want {
			t.Fatalf("retry window %v: %d %s", wait, w.Code, w.Header().Get("Retry-After"))
		}
	}
}
