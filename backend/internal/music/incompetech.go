package music

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

const providerBase = "https://incompetech.com/music/royalty-free/"
const licenseURL = "https://creativecommons.org/licenses/by/4.0/"

var safeIdentifier = regexp.MustCompile(`^[A-Za-z0-9-]{1,80}$`)

type providerPiece struct {
	UUID        scalar `json:"uuid"`
	Title       string `json:"title"`
	Filename    string `json:"filename"`
	Length      string `json:"length"`
	Genre       scalar `json:"genre"`
	BPM         scalar `json:"bpm"`
	Feel        string `json:"feel"`
	ISRC        string `json:"isrc"`
	Description string `json:"description"`
	Instruments string `json:"instruments"`
}

// The provider currently represents BPM and genre IDs as strings, but genre.json
// uses numeric IDs. Accept both without coercing arbitrary JSON into strings.
type scalar string

func (v *scalar) UnmarshalJSON(data []byte) error {
	if bytes.Equal(data, []byte("null")) {
		*v = ""
		return nil
	}
	var text string
	if err := json.Unmarshal(data, &text); err == nil {
		*v = scalar(text)
		return nil
	}
	var number json.Number
	if err := json.Unmarshal(data, &number); err != nil {
		return err
	}
	*v = scalar(number.String())
	return nil
}

func validID(id string) bool {
	return strings.HasPrefix(id, "incompetech:") && safeIdentifier.MatchString(strings.TrimPrefix(id, "incompetech:"))
}

func providerRedirect(req *http.Request, via []*http.Request) error {
	if len(via) >= 3 {
		return errors.New("too many music provider redirects")
	}
	return validateProviderURL(req.URL)
}

func validateProviderURL(u *url.URL) error {
	if u.Scheme != "https" || u.User != nil || (u.Host != "incompetech.com" && u.Host != "www.incompetech.com") ||
		!strings.HasPrefix(u.Path, "/music/royalty-free/") || strings.Contains(u.Path, "..") {
		return errors.New("music URL is outside the approved provider")
	}
	return nil
}

func (c *Catalog) request(ctx context.Context, address string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		return nil, err
	}
	if err = validateProviderURL(req.URL); err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "SneepCut/1.0 (music catalogue)")
	response, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("music provider request: %w", err)
	}
	if response.StatusCode != http.StatusOK {
		response.Body.Close()
		return nil, fmt.Errorf("music provider returned status %d", response.StatusCode)
	}
	return response, nil
}

func (c *Catalog) metadata(ctx context.Context, filename string, target any) error {
	response, err := c.request(ctx, providerBase+filename)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.ContentLength > c.metadataLimit {
		return errors.New("music metadata exceeds size limit")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, c.metadataLimit+1))
	if err != nil {
		return err
	}
	if int64(len(data)) > c.metadataLimit {
		return errors.New("music metadata exceeds size limit")
	}
	if err = json.Unmarshal(data, target); err != nil {
		return fmt.Errorf("invalid music metadata: %w", err)
	}
	return nil
}

func (c *Catalog) fetch(ctx context.Context) ([]entry, error) {
	var pieces []providerPiece
	if err := c.metadata(ctx, "pieces.json", &pieces); err != nil {
		return nil, err
	}
	if len(pieces) == 0 || len(pieces) > 20000 {
		return nil, errors.New("unexpected music catalogue size")
	}
	var genreRows []struct {
		ID    scalar `json:"id"`
		Genre string `json:"genre"`
	}
	if err := c.metadata(ctx, "genre.json", &genreRows); err != nil {
		return nil, err
	}
	genres := make(map[string]string, len(genreRows))
	for _, genre := range genreRows {
		genres[string(genre.ID)] = cleanText(genre.Genre, 80)
	}
	entries := make([]entry, 0, len(pieces))
	seen := make(map[string]bool, len(pieces))
	for _, piece := range pieces {
		track, ok := makeTrack(piece, genres)
		if !ok || seen[track.ID] {
			continue
		}
		seen[track.ID] = true
		search := strings.ToLower(strings.Join([]string{track.Title, track.Artist, strings.Join(track.Genres, " "), strings.Join(track.Moods, " "), cleanText(piece.Description, 4000), cleanText(piece.Instruments, 500)}, " "))
		entries = append(entries, entry{track: track, search: search})
	}
	if len(entries) == 0 {
		return nil, errors.New("music catalogue contains no valid tracks")
	}
	return entries, nil
}

func makeTrack(piece providerPiece, genres map[string]string) (Track, bool) {
	filename := piece.Filename
	if len(filename) == 0 || len(filename) > 220 || strings.TrimSpace(filename) != filename || strings.ContainsAny(filename, "/\\?#%:") || !strings.HasSuffix(strings.ToLower(filename), ".mp3") {
		return Track{}, false
	}
	for _, char := range filename {
		if unicode.IsControl(char) {
			return Track{}, false
		}
	}
	title := cleanText(piece.Title, 300)
	duration := parseDuration(piece.Length)
	if title == "" || duration <= 0 || duration > 4*60*60 {
		return Track{}, false
	}
	// Prefer the recording's ISRC so adding UUIDs to the upstream schema later
	// does not invalidate music choices already saved in projects.
	identifier := strings.TrimSpace(piece.ISRC)
	if !safeIdentifier.MatchString(identifier) {
		identifier = strings.TrimSpace(string(piece.UUID))
	}
	if !safeIdentifier.MatchString(identifier) {
		hash := sha256.Sum256([]byte(filename))
		identifier = hex.EncodeToString(hash[:16])
	}
	bpm, _ := strconv.ParseFloat(strings.TrimSpace(string(piece.BPM)), 64)
	if math.IsNaN(bpm) || math.IsInf(bpm, 0) || bpm < 20 || bpm > 400 {
		bpm = 0
	}
	track := Track{ID: "incompetech:" + identifier, Title: title, Artist: "Kevin MacLeod", DurationSeconds: duration, BPM: bpm, Genres: []string{}, Moods: splitLabels(piece.Feel), PreviewURL: providerBase + "mp3-royaltyfree/" + url.PathEscape(filename), SourceURL: providerBase, License: "CC BY 4.0", LicenseURL: licenseURL}
	if genre := genres[string(piece.Genre)]; genre != "" {
		track.Genres = []string{genre}
	}
	if safeIdentifier.MatchString(piece.ISRC) {
		track.SourceURL = providerBase + "index.html?isrc=" + url.QueryEscape(piece.ISRC)
	}
	track.Attribution = fmt.Sprintf("%q by Kevin MacLeod (incompetech.com). Source: %s. Licensed under Creative Commons Attribution 4.0: %s. Adapted for this video: excerpted, mixed and synchronized with visuals.", track.Title, track.SourceURL, track.LicenseURL)
	return track, true
}

func cleanText(value string, limit int) string {
	value = html.UnescapeString(value)
	value = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return ' '
		}
		return r
	}, value)
	text := strings.TrimSpace(value)
	characters := []rune(text)
	if len(characters) > limit {
		text = string(characters[:limit])
	}
	return text
}

func splitLabels(value string) []string {
	labels := []string{}
	for _, item := range strings.Split(value, ",") {
		if label := cleanText(item, 80); label != "" {
			labels = append(labels, label)
		}
		if len(labels) == 20 {
			break
		}
	}
	return labels
}

func parseDuration(value string) float64 {
	parts := strings.Split(strings.TrimSpace(value), ":")
	if len(parts) < 2 || len(parts) > 3 {
		return 0
	}
	seconds := 0.0
	for i, part := range parts {
		number, err := strconv.ParseFloat(part, 64)
		if err != nil || math.IsNaN(number) || math.IsInf(number, 0) || number < 0 || (i > 0 && number >= 60) {
			return 0
		}
		seconds = seconds*60 + number
	}
	return seconds
}
