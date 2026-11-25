package errorlog

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"strings"
	"sync/atomic"
)

// Capture is a slog.Handler that forwards every record to base and also
// records Error-level records once a Recorder is attached. It is installed
// before the database opens, so records logged earlier only reach base.
type Capture struct {
	base     slog.Handler
	source   string
	recorder *atomic.Pointer[Recorder]
	attrs    []slog.Attr
	groups   []string
}

func NewCapture(base slog.Handler, source string) *Capture {
	return &Capture{base: base, source: source, recorder: &atomic.Pointer[Recorder]{}}
}

// Attach starts recording Error-level records into recorder.
func (c *Capture) Attach(recorder *Recorder) { c.recorder.Store(recorder) }

// Start attaches a recorder backed by db and runs it until the returned stop
// function is called; stop waits for the final flush.
func (c *Capture) Start(ctx context.Context, db *sql.DB) (*Recorder, func()) {
	recorder := NewRecorder(db, c.Base())
	c.Attach(recorder)
	ctx, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	go func() {
		defer close(done)
		recorder.Run(ctx)
	}()
	return recorder, func() {
		c.Attach(nil)
		cancel()
		<-done
	}
}

// Base returns a logger that bypasses capture, for the recorder's own failures.
func (c *Capture) Base() *slog.Logger { return slog.New(c.base) }

func (c *Capture) Enabled(ctx context.Context, level slog.Level) bool {
	return c.base.Enabled(ctx, level)
}

func (c *Capture) Handle(ctx context.Context, record slog.Record) error {
	err := c.base.Handle(ctx, record)
	if record.Level >= slog.LevelError {
		if recorder := c.recorder.Load(); recorder != nil {
			recorder.Record(c.event(record))
		}
	}
	return err
}

func (c *Capture) WithAttrs(attrs []slog.Attr) slog.Handler {
	next := *c
	next.base = c.base.WithAttrs(attrs)
	next.attrs = append(append([]slog.Attr{}, c.attrs...), c.prefixed(attrs)...)
	return &next
}

func (c *Capture) WithGroup(name string) slog.Handler {
	next := *c
	next.base = c.base.WithGroup(name)
	next.groups = append(append([]string{}, c.groups...), name)
	return &next
}

func (c *Capture) prefixed(attrs []slog.Attr) []slog.Attr {
	if len(c.groups) == 0 {
		return attrs
	}
	prefix := strings.Join(c.groups, ".") + "."
	result := make([]slog.Attr, len(attrs))
	for i, attr := range attrs {
		result[i] = slog.Attr{Key: prefix + attr.Key, Value: attr.Value}
	}
	return result
}

// event names the group after the log message plus its error or panic value,
// so different failures behind one generic message stay apart.
func (c *Capture) event(record slog.Record) Event {
	attrs := append([]slog.Attr{}, c.attrs...)
	record.Attrs(func(attr slog.Attr) bool {
		attrs = append(attrs, c.prefixed([]slog.Attr{attr})...)
		return true
	})
	message := record.Message
	var detail strings.Builder
	for _, attr := range attrs {
		value := attr.Value.Resolve().String()
		if attr.Key == "error" || attr.Key == "panic" {
			message += ": " + value
		}
		fmt.Fprintf(&detail, "%s=%s\n", attr.Key, value)
	}
	return Event{Source: c.source, Kind: KindLog, Message: message, Detail: strings.TrimSpace(detail.String()), At: record.Time}
}
