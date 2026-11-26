package stories

import (
	"context"
	"errors"
	"net/http/httptest"
	"testing"
)

func TestFailureMapsClosedRequestsAndKeepsOutageStatus(t *testing.T) {
	closed := httptest.NewRecorder()
	failure(closed, context.Canceled)
	if closed.Code != 499 {
		t.Fatalf("closed request status = %d, want 499", closed.Code)
	}
	outage := httptest.NewRecorder()
	failure(outage, errors.New("connection refused"))
	if outage.Code != 503 {
		t.Fatalf("outage status = %d, want 503", outage.Code)
	}
}
