package processing

import (
	"log/slog"
	"time"
)

// stageTimer records how long each step of one operation took, so a single
// log line shows where the time went (for example proxy vs. transcription).
type stageTimer struct {
	started time.Time
	last    time.Time
	attrs   []any
}

func newStageTimer() *stageTimer {
	now := time.Now()
	return &stageTimer{started: now, last: now}
}

// mark closes the step that began at the previous mark.
func (t *stageTimer) mark(step string) {
	now := time.Now()
	t.attrs = append(t.attrs, step+"_ms", now.Sub(t.last).Milliseconds())
	t.last = now
}

// log writes the steps, the total and the given context attributes.
func (t *stageTimer) log(message string, attrs ...any) {
	attrs = append(attrs, t.attrs...)
	attrs = append(attrs, "total_ms", time.Since(t.started).Milliseconds())
	slog.Info(message, attrs...)
}
