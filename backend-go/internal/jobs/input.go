package jobs

import (
	"context"
	"errors"
	"net"
	"net/url"
	"strings"
	"unicode/utf8"
)

type Options struct {
	NumClips         int     `json:"num_clips_requested"`
	AspectRatio      string  `json:"aspect_ratio"`
	Language         *string `json:"language"`
	SubtitleStyle    string  `json:"subtitle_style"`
	IncludeBrand     bool    `json:"include_brand"`
	BurnSubtitles    bool    `json:"burn_subtitles"`
	SmartCrop        bool    `json:"smart_crop"`
	UserInstructions *string `json:"user_instructions"`
}

type CreateInput struct {
	Options
	SourceType       string  `json:"source_type"`
	SourceURL        *string `json:"source_url"`
	SourceFilePath   *string `json:"source_file_path"`
	SourceStorageKey *string `json:"source_storage_key"`
}

type BatchInput struct {
	Options
	SourceURLs []string `json:"source_urls"`
}

func DefaultOptions() Options {
	return Options{NumClips: 5, AspectRatio: "9:16", SubtitleStyle: "default", BurnSubtitles: true, SmartCrop: true}
}

func (o Options) Validate() error {
	if o.NumClips < 1 || o.NumClips > 15 {
		return errors.New("num_clips_requested must be between 1 and 15")
	}
	if o.AspectRatio != "9:16" && o.AspectRatio != "1:1" && o.AspectRatio != "16:9" {
		return errors.New("invalid aspect_ratio")
	}
	if !bounded(o.Language, 50) || utf8.RuneCountInString(o.SubtitleStyle) > 50 || !bounded(o.UserInstructions, 4000) {
		return errors.New("job options exceed their maximum length")
	}
	return nil
}

func (p CreateInput) Validate() error {
	if err := p.Options.Validate(); err != nil {
		return err
	}
	if !bounded(p.SourceURL, 2048) || !bounded(p.SourceFilePath, 2048) || !bounded(p.SourceStorageKey, 2048) {
		return errors.New("source exceeds 2048 characters")
	}
	switch p.SourceType {
	case "url", "youtube":
		if empty(p.SourceURL) || !empty(p.SourceFilePath) || !empty(p.SourceStorageKey) {
			return errors.New("provide exactly one source_url for URL jobs")
		}
	case "upload", "local":
		if (empty(p.SourceFilePath) && empty(p.SourceStorageKey)) || !empty(p.SourceURL) {
			return errors.New("provide an uploaded file path or storage key")
		}
	default:
		return errors.New("invalid source_type")
	}
	return nil
}

func bounded(s *string, n int) bool { return s == nil || utf8.RuneCountInString(*s) <= n }
func empty(s *string) bool          { return s == nil || *s == "" }
func value(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

type LookupIP func(context.Context, string, string) ([]net.IP, error)

func ValidateSourceURL(ctx context.Context, lookup LookupIP, sourceType, source string) error {
	u, err := url.Parse(source)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil {
		return errors.New("Invalid source URL")
	}
	host := strings.ToLower(u.Hostname())
	if sourceType == "youtube" {
		switch host {
		case "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be":
		default:
			return errors.New("Only YouTube URLs are allowed for YouTube jobs")
		}
	}
	addresses, err := lookup(ctx, "ip", host)
	if err != nil || len(addresses) == 0 {
		return errors.New("Source URL host could not be resolved")
	}
	for _, ip := range addresses {
		if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || sharedOrReserved(ip) {
			return errors.New("Private network URLs are not allowed")
		}
	}
	return nil
}

func sharedOrReserved(ip net.IP) bool {
	// IsPrivate excludes shared CGNAT and reserved IPv4 ranges.
	if v := ip.To4(); v != nil {
		return v[0] == 0 || v[0] == 127 || v[0] >= 224 || (v[0] == 100 && v[1] >= 64 && v[1] <= 127) || (v[0] == 192 && v[1] == 0 && v[2] == 0) || (v[0] == 198 && (v[1] == 18 || v[1] == 19))
	}
	return false
}
