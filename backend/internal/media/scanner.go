package media

import (
	"bufio"
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"io"
	"net"
	"os"
	"strings"
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
		return ErrScannerUnavailable
	}
	// ClamAV cannot scan files of 2 GB or more even when StreamMaxLength is raised;
	// deploy/clamd.conf allows streams up to clamdMaxStreamBytes. Fail explicitly
	// instead of bypassing mandatory malware scanning.
	maximum := min(s.cfg.MaxBytes, clamdMaxStreamBytes)
	if info.Size() > maximum {
		return failure(413, "This file exceeds the server's malware scanner capacity. TikTok accepts videos up to 4 GB, but this server cannot safely scan this upload")
	}
	ctx, cancel := context.WithTimeout(ctx, s.cfg.Timeout+time.Duration(info.Size()/scanBytesPerSecond)*time.Second)
	defer cancel()
	connection, e := s.dial(ctx, "tcp", s.cfg.Address)
	if e != nil {
		return ErrScannerUnavailable
	}
	defer connection.Close()
	deadline, _ := ctx.Deadline()
	_ = connection.SetDeadline(deadline)
	stop := context.AfterFunc(ctx, func() { _ = connection.Close() })
	defer stop()
	in, e := os.Open(filename)
	if e != nil {
		return ErrScannerUnavailable
	}
	defer in.Close()
	if _, e = io.WriteString(connection, "zINSTREAM\x00"); e != nil {
		return ErrScannerUnavailable
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
				return ErrScannerUnavailable
			}
			if _, e := io.CopyN(connection, bytes.NewReader(buf[:n]), int64(n)); e != nil {
				return ErrScannerUnavailable
			}
		}
		if e == io.EOF {
			break
		}
		if e != nil {
			return ErrScannerUnavailable
		}
	}
	binary.BigEndian.PutUint32(size[:], 0)
	if _, e = connection.Write(size[:]); e != nil {
		return ErrScannerUnavailable
	}
	response, e := bufio.NewReader(io.LimitReader(connection, 4097)).ReadString(0)
	if e != nil || len(response) > 4096 {
		return ErrScannerUnavailable
	}
	verdict := strings.TrimSuffix(response, "\x00")
	if verdict == "stream: OK" {
		return nil
	}
	if strings.HasPrefix(verdict, "stream: ") && strings.HasSuffix(verdict, " FOUND") {
		return ErrUnsafeUpload
	}
	return ErrScannerUnavailable
}
