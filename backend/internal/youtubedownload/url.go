// Package youtubedownload imports a single public YouTube video. It never accepts
// cookies, credentials, playlists, arbitrary download URLs or runtime plugins.
package youtubedownload

import (
	"errors"
	"net/url"
	"regexp"
	"strings"
)

const MaxBytes int64 = 10_000_000_000
const MaxHeight = 2160

var videoID = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)

// CanonicalURL is shared by the API and worker, including persisted delivery
// validation. Tracking and playlist parameters cannot change the selected video.
func CanonicalURL(raw string) (string, error) {
	invalid := errors.New("Enter a valid YouTube video link")
	if len(raw) > 2048 {
		return "", invalid
	}
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.User != nil || u.Port() != "" || (u.Scheme != "https" && u.Scheme != "http") {
		return "", invalid
	}
	var id string
	switch strings.ToLower(u.Host) {
	case "youtu.be", "www.youtu.be":
		id = strings.TrimPrefix(u.Path, "/")
	case "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com":
		parts := strings.Split(strings.Trim(u.Path, "/"), "/")
		if u.Path == "/watch" {
			values, e := url.ParseQuery(u.RawQuery)
			if e != nil || len(values["v"]) != 1 {
				return "", invalid
			}
			id = values.Get("v")
		} else if len(parts) == 2 && (parts[0] == "shorts" || parts[0] == "live" || parts[0] == "embed") {
			id = parts[1]
		}
	default:
		return "", invalid
	}
	if !videoID.MatchString(id) {
		return "", invalid
	}
	return "https://www.youtube.com/watch?v=" + id, nil
}
