package media

import (
	"bufio"
	"context"
	"encoding/binary"
	"errors"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
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
