package media

import (
	"bufio"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestClamAVProtocolRequiresExplicitCleanVerdict(t *testing.T) {
	for _, tc := range []struct {
		response string
		want     error
	}{{"stream: OK\x00", nil}, {"stream: Eicar-Test-Signature FOUND\x00", ErrUnsafeUpload}, {"stream: size limit exceeded. ERROR\x00", ErrScannerUnavailable}, {"stream: OK", ErrScannerUnavailable}, {strings.Repeat("x", 4097) + "\x00", ErrScannerUnavailable}} {
		t.Run(tc.response[:min(len(tc.response), 25)], func(t *testing.T) {
			client, connection := net.Pipe()
			done := make(chan error, 1)
			go func() {
				defer connection.Close()
				reader := bufio.NewReader(connection)
				command, e := reader.ReadString(0)
				if e != nil || command != "zINSTREAM\x00" {
					done <- errors.New("wrong scanner command")
					return
				}
				var received strings.Builder
				for {
					var length uint32
					if e := binary.Read(reader, binary.BigEndian, &length); e != nil {
						done <- e
						return
					}
					if length == 0 {
						break
					}
					if length > 1024*1024 {
						done <- errors.New("unbounded chunk")
						return
					}
					if _, e := io.CopyN(&received, reader, int64(length)); e != nil {
						done <- e
						return
					}
				}
				if received.String() != "test video" {
					done <- errors.New("unexpected scanner body")
					return
				}
				_, _ = io.WriteString(connection, tc.response)
				done <- nil
			}()
			filename := filepath.Join(t.TempDir(), "input")
			_ = os.WriteFile(filename, []byte("test video"), 0600)
			scanner := NewClamAV(ClamAVConfig{Address: "scanner:3310", Enabled: true, Environment: "test", Timeout: time.Second, MaxBytes: 1024})
			scanner.dial = func(context.Context, string, string) (net.Conn, error) { return client, nil }
			e := scanner.Scan(context.Background(), filename)
			if !errors.Is(e, tc.want) {
				t.Fatalf("got %v want %v", e, tc.want)
			}
			if e = <-done; e != nil {
				t.Fatal(e)
			}
		})
	}
}
func TestClamAVCannotBeDisabledInProduction(t *testing.T) {
	file := filepath.Join(t.TempDir(), "video")
	_ = os.WriteFile(file, videoBytes, 0600)
	for _, environment := range []string{"production", "staging", ""} {
		scanner := NewClamAV(ClamAVConfig{Address: "127.0.0.1:0", Enabled: false, Environment: environment, Timeout: time.Millisecond, MaxBytes: 1024})
		if e := scanner.Scan(context.Background(), file); !errors.Is(e, ErrScannerUnavailable) {
			t.Fatalf("scanner disabled for %q: %v", environment, e)
		}
	}
	for _, environment := range []string{"development", "test", "testing"} {
		scanner := NewClamAV(ClamAVConfig{Enabled: false, Environment: environment})
		if e := scanner.Scan(context.Background(), file); e != nil {
			t.Fatal(e)
		}
	}
}
func TestScannerHonorsContextDeadline(t *testing.T) {
	client, connection := net.Pipe()
	done := make(chan struct{})
	go func() {
		defer connection.Close()
		_, _ = io.Copy(io.Discard, connection)
		close(done)
	}()
	filename := filepath.Join(t.TempDir(), "video")
	_ = os.WriteFile(filename, videoBytes, 0600)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	scanner := NewClamAV(ClamAVConfig{Enabled: true, Address: "scanner:3310", Timeout: time.Minute, MaxBytes: 1024})
	scanner.dial = func(context.Context, string, string) (net.Conn, error) { return client, nil }
	if e := scanner.Scan(ctx, filename); !errors.Is(e, ErrScannerUnavailable) {
		t.Fatal(e)
	}
	<-done
}

// fakeClamd answers one INSTREAM exchange with response, after reading the whole stream.
func fakeClamd(response string) net.Conn {
	client, connection := net.Pipe()
	go func() {
		defer connection.Close()
		reader := bufio.NewReader(connection)
		if _, e := reader.ReadString(0); e != nil {
			return
		}
		for {
			var length uint32
			if e := binary.Read(reader, binary.BigEndian, &length); e != nil || length == 0 {
				break
			}
			if _, e := io.CopyN(io.Discard, reader, int64(length)); e != nil {
				return
			}
		}
		_, _ = io.WriteString(connection, response)
	}()
	return client
}

func TestClamAVRetriesOnceWhenClamdRefusesConnection(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "video")
	_ = os.WriteFile(filename, videoBytes, 0600)
	attempts := 0
	scanner := NewClamAV(ClamAVConfig{Enabled: true, Address: "scanner:3310", Timeout: time.Minute, MaxBytes: 1 << 20})
	scanner.dial = func(context.Context, string, string) (net.Conn, error) {
		attempts++
		if attempts == 1 {
			return nil, syscall.ECONNREFUSED
		}
		return fakeClamd("stream: OK\x00"), nil
	}
	if e := scanner.Scan(context.Background(), filename); e != nil {
		t.Fatalf("scan after one refused connection: %v", e)
	}
	if attempts != 2 {
		t.Fatalf("expected one retry, got %d attempts", attempts)
	}
}

func TestClamAVReportsUnavailableWhenRetryAlsoFails(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "video")
	_ = os.WriteFile(filename, videoBytes, 0600)
	attempts := 0
	scanner := NewClamAV(ClamAVConfig{Enabled: true, Address: "scanner:3310", Timeout: time.Minute, MaxBytes: 1 << 20})
	scanner.dial = func(context.Context, string, string) (net.Conn, error) {
		attempts++
		return nil, syscall.ECONNREFUSED
	}
	if e := scanner.Scan(context.Background(), filename); !errors.Is(e, ErrScannerUnavailable) {
		t.Fatalf("got %v want scanner unavailable", e)
	}
	if attempts != 2 {
		t.Fatalf("expected exactly two attempts, got %d", attempts)
	}
}

func TestClamAVRetryStaysWithinOneScanBudget(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "video")
	_ = os.WriteFile(filename, videoBytes, 0600)
	const budget = 300 * time.Millisecond
	attempts := 0
	scanner := NewClamAV(ClamAVConfig{Enabled: true, Address: "scanner:3310", Timeout: budget, MaxBytes: 1 << 20})
	scanner.dial = func(context.Context, string, string) (net.Conn, error) {
		attempts++
		client, connection := net.Pipe()
		if attempts == 1 {
			// clamd drops the connection after the upload has started streaming.
			go func() {
				time.Sleep(150 * time.Millisecond)
				_ = connection.Close()
			}()
		} else {
			// The second attempt hangs, so only the shared budget can end it.
			go func() { _, _ = io.Copy(io.Discard, connection) }()
		}
		return client, nil
	}
	started := time.Now()
	e := scanner.Scan(context.Background(), filename)
	elapsed := time.Since(started)
	if !errors.Is(e, ErrScannerUnavailable) {
		t.Fatalf("got %v want scanner unavailable", e)
	}
	if elapsed >= 2*budget-50*time.Millisecond {
		t.Fatalf("scan took %v; retry must not extend past one budget of %v", elapsed, budget)
	}
}

func TestClamAVDoesNotRetryAfterOwnDeadline(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "video")
	_ = os.WriteFile(filename, videoBytes, 0600)
	attempts := 0
	scanner := NewClamAV(ClamAVConfig{Enabled: true, Address: "scanner:3310", Timeout: 20 * time.Millisecond, MaxBytes: 1 << 20})
	scanner.dial = func(context.Context, string, string) (net.Conn, error) {
		attempts++
		client, connection := net.Pipe()
		go func() { _, _ = io.Copy(io.Discard, connection) }()
		return client, nil
	}
	if e := scanner.Scan(context.Background(), filename); !errors.Is(e, ErrScannerUnavailable) {
		t.Fatalf("got %v want scanner unavailable", e)
	}
	if attempts != 1 {
		t.Fatalf("timed-out scan must not be retried, got %d attempts", attempts)
	}
}

func TestClamAVCanceledClientIsNotScannerOutage(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "video")
	_ = os.WriteFile(filename, videoBytes, 0600)
	ctx, cancel := context.WithCancel(context.Background())
	scanner := NewClamAV(ClamAVConfig{Enabled: true, Address: "scanner:3310", Timeout: time.Minute, MaxBytes: 1 << 20})
	scanner.dial = func(dialCtx context.Context, _, _ string) (net.Conn, error) {
		cancel()
		<-dialCtx.Done()
		return nil, dialCtx.Err()
	}
	e := scanner.Scan(ctx, filename)
	if !errors.Is(e, context.Canceled) || errors.Is(e, ErrScannerUnavailable) {
		t.Fatalf("got %v want context.Canceled", e)
	}
	if status, _ := statusFor(e); status != 499 {
		t.Fatalf("canceled upload status %d, want 499", status)
	}
}

func TestClientCancellationIsNotReportedAsOutage(t *testing.T) {
	for _, tc := range []struct {
		name   string
		err    error
		status int
	}{
		{"scanner outage", ErrScannerUnavailable, 503},
		{"canceled storage write", fmt.Errorf("put object: %w", context.Canceled), 499},
		{"storage failure", errors.New("bucket unreachable"), 503},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if status, _ := statusFor(tc.err); status != tc.status {
				t.Fatalf("status %d for %v, want %d", status, tc.err, tc.status)
			}
		})
	}
}
