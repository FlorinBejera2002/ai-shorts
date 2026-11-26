package media

import (
	"bufio"
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"io"
	"log/slog"
	"net"
	"os"
	"strings"
	"syscall"
	"time"
)

var ErrUnsafeUpload = errors.New("Upload failed safety checks")

// ErrScannerUnavailable is temporary: the same file may pass once clamd answers again.
var ErrScannerUnavailable error = temporaryError("Upload safety scanning is temporarily unavailable")

// temporaryError marks failures unrelated to the file itself, so callers that batch
// many files (YouTube imports) can stop and retry instead of dropping the file.
type temporaryError string

func (e temporaryError) Error() string { return string(e) }
func (temporaryError) Temporary() bool { return true }

// scanBytesPerSecond is a conservative clamd throughput used to extend the scan
// deadline for large videos beyond the configured base timeout.
const scanBytesPerSecond = 8 << 20

// scanRetryDelay separates the single retry of a clamd exchange that failed before
// clamd gave a verdict. The staged file is unchanged, so rescanning it is safe.
const scanRetryDelay = 250 * time.Millisecond

type Scanner interface {
	Scan(context.Context, string) error
}
type ClamAVConfig struct {
	Address     string
	Timeout     time.Duration
	MaxBytes    int64
	Enabled     bool
	Environment string
}
type ClamAV struct {
	cfg  ClamAVConfig
	dial func(context.Context, string, string) (net.Conn, error)
}

// scanFailure records the clamd exchange step that failed. It matches
// ErrScannerUnavailable; the stage and error class are logged, never the raw error text.
type scanFailure struct {
	stage string
	cause error
}

func (f scanFailure) Error() string { return ErrScannerUnavailable.Error() }
func (f scanFailure) Unwrap() error { return ErrScannerUnavailable }

// retryable reports whether the failure happened before clamd could answer. Dial
// and send failures are typical of clamd dropping a connection while it reloads
// signatures or recycles a worker, so one more attempt is worth it.
func (f scanFailure) retryable() bool { return f.stage == "dial" || f.stage == "send" }

// clamdMaxStreamBytes matches StreamMaxLength in deploy/clamd.conf (2047M).
const clamdMaxStreamBytes int64 = 2047 * 1024 * 1024

func NewClamAV(cfg ClamAVConfig) *ClamAV {
	if cfg.Timeout <= 0 {
		cfg.Timeout = 2 * time.Minute
	}
	return &ClamAV{cfg: cfg, dial: (&net.Dialer{}).DialContext}
}
func (s *ClamAV) Scan(ctx context.Context, filename string) error {
	if !s.cfg.Enabled && (s.cfg.Environment == "development" || s.cfg.Environment == "test" || s.cfg.Environment == "testing") {
		return nil
	}
	info, err := os.Stat(filename)
	if err != nil {
		return unavailable("stat", err)
	}
	// ClamAV cannot scan files of 2 GB or more even when StreamMaxLength is raised;
	// deploy/clamd.conf allows streams up to clamdMaxStreamBytes. Fail explicitly
	// instead of bypassing mandatory malware scanning.
	maximum := min(s.cfg.MaxBytes, clamdMaxStreamBytes)
	if info.Size() > maximum {
		return failure(413, "This file exceeds the server's malware scanner capacity. TikTok accepts videos up to 4 GB, but this server cannot safely scan this upload")
	}
	// Both attempts share one budget, so a retry can never extend the scan past it.
	budget := s.cfg.Timeout + time.Duration(info.Size()/scanBytesPerSecond)*time.Second
	scanCtx, cancel := context.WithTimeout(ctx, budget)
	defer cancel()
	err = s.scanOnce(scanCtx, filename)
	var failed scanFailure
	if errors.As(err, &failed) && failed.retryable() && scanCtx.Err() == nil {
		slog.Warn("clamav scan retrying", "stage", failed.stage, "error_class", errorClass(failed.cause))
		select {
		case <-scanCtx.Done():
		case <-time.After(scanRetryDelay):
		}
		// When the budget ran out while waiting, the first failure stays the result.
		if scanCtx.Err() == nil {
			err = s.scanOnce(scanCtx, filename)
		}
	}
	if errors.Is(err, ErrScannerUnavailable) {
		// The client left mid-scan: that is not a scanner outage and must not
		// be reported as one.
		if ctx.Err() != nil {
			return ctx.Err()
		}
		var final scanFailure
		if errors.As(err, &final) {
			slog.Error("clamav scan unavailable", "stage", final.stage, "error_class", errorClass(final.cause))
		}
	}
	return err
}

// unavailable logs a scanner outage by stage and error class, never by raw error text.
func unavailable(stage string, cause error) error {
	slog.Error("clamav scan unavailable", "stage", stage, "error_class", errorClass(cause))
	return scanFailure{stage: stage, cause: cause}
}

// scanOnce streams the file to clamd once and returns its verdict within ctx's deadline.
func (s *ClamAV) scanOnce(ctx context.Context, filename string) error {
	// fail reports a step failure. A failure caused by this attempt's own deadline is
	// reported as "deadline" so it is never retried: a second attempt would wait the
	// full timeout again.
	fail := func(stage string, cause error) error {
		if ctx.Err() != nil {
			return scanFailure{stage: "deadline", cause: ctx.Err()}
		}
		return scanFailure{stage: stage, cause: cause}
	}
	connection, e := s.dial(ctx, "tcp", s.cfg.Address)
	if e != nil {
		return fail("dial", e)
	}
	defer connection.Close()
	deadline, _ := ctx.Deadline()
	_ = connection.SetDeadline(deadline)
	stop := context.AfterFunc(ctx, func() { _ = connection.Close() })
	defer stop()
	in, e := os.Open(filename)
	if e != nil {
		return fail("open", e)
	}
	defer in.Close()
	if _, e = io.WriteString(connection, "zINSTREAM\x00"); e != nil {
		return fail("send", e)
	}
	buf := make([]byte, 1024*1024)
	var size [4]byte
	total := int64(0)
	for {
		n, e := in.Read(buf)
		if n > 0 {
			total += int64(n)
			if total > s.cfg.MaxBytes {
				return ErrUnsafeUpload
			}
			binary.BigEndian.PutUint32(size[:], uint32(n))
			if _, e := connection.Write(size[:]); e != nil {
				return fail("send", e)
			}
			if _, e := io.CopyN(connection, bytes.NewReader(buf[:n]), int64(n)); e != nil {
				return fail("send", e)
			}
		}
		if e == io.EOF {
			break
		}
		if e != nil {
			return fail("read", e)
		}
	}
	binary.BigEndian.PutUint32(size[:], 0)
	if _, e = connection.Write(size[:]); e != nil {
		return fail("send", e)
	}
	response, e := bufio.NewReader(io.LimitReader(connection, 4097)).ReadString(0)
	if e != nil {
		return fail("verdict", e)
	}
	if len(response) > 4096 {
		return fail("verdict", errVerdictTooLarge)
	}
	verdict := strings.TrimSuffix(response, "\x00")
	if verdict == "stream: OK" {
		return nil
	}
	if strings.HasPrefix(verdict, "stream: ") && strings.HasSuffix(verdict, " FOUND") {
		return ErrUnsafeUpload
	}
	return fail("verdict", errUnexpectedVerdict)
}

var (
	errVerdictTooLarge   = errors.New("clamd verdict too large")
	errUnexpectedVerdict = errors.New("clamd verdict not recognized")
)

// errorClass names the kind of failure for logs without exposing driver or socket text.
func errorClass(err error) string {
	var netErr net.Error
	switch {
	case err == nil:
		return "none"
	case errors.Is(err, context.DeadlineExceeded), errors.As(err, &netErr) && netErr.Timeout():
		return "timeout"
	case errors.Is(err, syscall.ECONNREFUSED):
		return "refused"
	case errors.Is(err, syscall.ECONNRESET), errors.Is(err, syscall.EPIPE):
		return "reset"
	case errors.Is(err, net.ErrClosed):
		return "closed"
	case errors.Is(err, io.EOF), errors.Is(err, io.ErrUnexpectedEOF):
		return "eof"
	case errors.Is(err, os.ErrNotExist):
		return "missing"
	case errors.Is(err, errVerdictTooLarge), errors.Is(err, errUnexpectedVerdict):
		return "verdict"
	}
	return "other"
}
