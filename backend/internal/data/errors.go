package data

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"net"

	"github.com/lib/pq"
)

// queryCanceled is the SQLSTATE PostgreSQL reports when a statement is
// cancelled, which lib/pq returns when the request context ends mid-query.
const queryCanceled pq.ErrorCode = "57014"

// ClientGone reports whether err only means the caller stopped waiting: the
// request context was cancelled, typically because the browser navigated away
// or aborted a fetch. Such failures are not platform outages.
func ClientGone(err error) bool {
	var pqErr *pq.Error
	return errors.Is(err, context.Canceled) || errors.As(err, &pqErr) && pqErr.Code == queryCanceled
}

// ErrorClass names a storage failure without its text. Driver messages can
// carry connection details, so only the kind and SQLSTATE code are returned.
func ErrorClass(err error) string {
	var pqErr *pq.Error
	var netErr net.Error
	switch {
	case err == nil:
		return "none"
	case errors.As(err, &pqErr):
		return "sqlstate " + string(pqErr.Code)
	case errors.Is(err, context.DeadlineExceeded):
		return "timeout"
	case errors.Is(err, driver.ErrBadConn), errors.Is(err, sql.ErrConnDone):
		return "bad connection"
	case errors.As(err, &netErr):
		return "network"
	}
	return "other"
}
