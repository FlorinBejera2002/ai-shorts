package data

import (
	"context"
	"database/sql/driver"
	"errors"
	"fmt"
	"net"
	"strings"
	"testing"

	"github.com/lib/pq"
)

func TestClientGoneRecognisesCancelledQueries(t *testing.T) {
	cancelled := &pq.Error{Code: queryCanceled, Message: "canceling statement due to user request"}
	for _, err := range []error{context.Canceled, fmt.Errorf("query: %w", context.Canceled), cancelled} {
		if !ClientGone(err) {
			t.Fatalf("ClientGone(%v) = false, want true", err)
		}
	}
	for _, err := range []error{context.DeadlineExceeded, &pq.Error{Code: "08006"}, driver.ErrBadConn, nil} {
		if ClientGone(err) {
			t.Fatalf("ClientGone(%v) = true, want false", err)
		}
	}
}

func TestErrorClassNeverReturnsDriverText(t *testing.T) {
	const secret = "password=hunter2 host=10.0.0.5"
	cases := []struct {
		err  error
		want string
	}{
		{nil, "none"},
		{&pq.Error{Code: "08006", Message: secret}, "sqlstate 08006"},
		{fmt.Errorf("wrapped: %w", &pq.Error{Code: "53300", Message: secret}), "sqlstate 53300"},
		{context.DeadlineExceeded, "timeout"},
		{driver.ErrBadConn, "bad connection"},
		{&net.OpError{Op: "dial", Err: errors.New(secret)}, "network"},
		{errors.New(secret), "other"},
	}
	for _, tc := range cases {
		got := ErrorClass(tc.err)
		if got != tc.want {
			t.Fatalf("ErrorClass(%v) = %q, want %q", tc.err, got, tc.want)
		}
		if strings.Contains(got, "hunter2") || strings.Contains(got, "10.0.0.5") {
			t.Fatalf("class leaked driver text: %q", got)
		}
	}
}
