// Package errorlog records platform errors (API, worker and browser) so the
// admin console can show which failures happen, how often and where.
// Recording is best effort: it never blocks or fails the code that reports.
package errorlog

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// Sources and kinds accepted by the platform_error_groups constraints.
const (
	SourceAPI    = "api"
	SourceWorker = "worker"
	SourceWeb    = "web"
	SourceAdmin  = "admin"

	KindHTTP   = "http"
	KindLog    = "log"
	KindClient = "client"
)

const (
	maxMessage = 500
	maxRoute   = 200
	maxDetail  = 4000
)

// Event is one error occurrence before grouping.
type Event struct {
	Source  string
	Kind    string
	Message string
	Route   string
	Detail  string
	Context map[string]string
	At      time.Time
}

var (
	uuidPattern   = regexp.MustCompile(`(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`)
	hexPattern    = regexp.MustCompile(`(?i)\b[0-9a-f]{12,}\b`)
	numberPattern = regexp.MustCompile(`\d+`)
	spacePattern  = regexp.MustCompile(`\s+`)
	tokenSegment  = regexp.MustCompile(`^[A-Za-z0-9_-]{20,}$`)
)

// normalizeMessage removes identifiers and numbers so repeated failures with
// different IDs, sizes or durations share one group.
func normalizeMessage(message string) string {
	message = uuidPattern.ReplaceAllString(message, "<id>")
	message = hexPattern.ReplaceAllString(message, "<hex>")
	message = numberPattern.ReplaceAllString(message, "<n>")
	return truncate(strings.TrimSpace(spacePattern.ReplaceAllString(message, " ")), 300)
}

// NormalizeRoute turns a request path into a route template, e.g.
// /api/clips/3f0c…/export -> /api/clips/:id/export.
func NormalizeRoute(path string) string {
	if path == "" {
		return ""
	}
	segments := strings.Split(path, "/")
	for i, segment := range segments {
		switch {
		case uuidPattern.MatchString(segment), numberPattern.FindString(segment) == segment && segment != "", tokenSegment.MatchString(segment):
			segments[i] = ":id"
		}
	}
	return truncate(strings.Join(segments, "/"), maxRoute)
}

// Fingerprint identifies the group an event belongs to.
func (e Event) Fingerprint() string {
	sum := sha256.Sum256([]byte(e.Source + "\x00" + e.Kind + "\x00" + e.Route + "\x00" + normalizeMessage(e.Message)))
	return hex.EncodeToString(sum[:16])
}

func (e Event) sanitized() Event {
	e.Message = truncate(strings.TrimSpace(e.Message), maxMessage)
	if e.Message == "" {
		e.Message = "Eroare fără mesaj"
	}
	e.Route = truncate(e.Route, maxRoute)
	e.Detail = truncate(e.Detail, maxDetail)
	if e.At.IsZero() {
		e.At = time.Now()
	}
	return e
}

func truncate(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	cut := limit
	for cut > 0 && !utf8.RuneStart(value[cut]) {
		cut--
	}
	return value[:cut] + "…"
}
