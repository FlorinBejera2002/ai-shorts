// Package youtubechannel connects a creator's YouTube channel with read-only
// access so the channel's own uploads can be listed and turned into clips.
// Its Google OAuth client is separate from sign-in, publishing and file import.
package youtubechannel

import "errors"

// ReadonlyScope is the only Google permission this package requests.
const ReadonlyScope = "https://www.googleapis.com/auth/youtube.readonly"

const (
	VisibilityAll      = "all"
	VisibilityPublic   = "public"
	VisibilityUnlisted = "unlisted"
	VisibilityPrivate  = "private"
)

var (
	// ErrNotConnected means the user has no usable channel grant. HTTP maps it to 409.
	ErrNotConnected = errors.New("YouTube channel is not connected")
	// ErrNotConfigured means the Google OAuth client for this feature is absent.
	ErrNotConfigured = errors.New("YouTube channel access is not configured")
	// ErrNotAllowed means the account may not connect or change its connection.
	ErrNotAllowed = errors.New("YouTube channel access is not allowed for this account")
	// ErrReauthorize means Google no longer honours the stored refresh token.
	ErrReauthorize = errors.New("YouTube access must be authorized again")
	// ErrAccessNotGranted means Google returned without the read-only scope or a refresh token.
	ErrAccessNotGranted = errors.New("YouTube read-only access was not granted")
	// ErrNoChannel means the Google account has no YouTube channel.
	ErrNoChannel = errors.New("the Google account has no YouTube channel")
	// ErrRevocationFailed means Google could not confirm revocation, so the local grant is kept.
	ErrRevocationFailed = errors.New("YouTube access could not be revoked")
)

// Config holds the HTTP-facing settings shared by the handler.
type Config struct {
	AppURL        string
	SecureCookies bool
}

// Account is the connected channel shown in the Create clips workspace.
type Account struct {
	ChannelID string  `json:"channel_id"`
	Title     string  `json:"title"`
	AvatarURL *string `json:"avatar_url"`
}

// Status reports whether the feature is configured and the user is connected.
type Status struct {
	Enabled   bool     `json:"enabled"`
	Connected bool     `json:"connected"`
	Account   *Account `json:"account"`
}

// Video is one upload from the connected channel.
type Video struct {
	ID              string  `json:"id"`
	Title           string  `json:"title"`
	DurationSeconds int     `json:"duration_seconds"`
	PublishedAt     string  `json:"published_at"`
	Visibility      string  `json:"visibility"`
	ThumbnailURL    *string `json:"thumbnail_url"`
	URL             string  `json:"url"`
	// ChannelID is the owning channel, used to confirm a lookup stays on the connected channel.
	ChannelID string `json:"-"`
}

// VideoPage is one page of channel uploads. NextPageToken is nil when exhausted.
type VideoPage struct {
	Videos        []Video `json:"videos"`
	NextPageToken *string `json:"next_page_token"`
}

// VideoQuery filters the channel uploads. Search matches titles case-insensitively.
type VideoQuery struct {
	Search     string
	Visibility string
	PageToken  string
}
