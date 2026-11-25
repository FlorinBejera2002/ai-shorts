package config

import (
	"encoding/base64"
	"errors"
	"net/url"
)

const youtubeChannelCallbackPath = "/v1/youtube/channel/callback"

// validateYouTubeChannel enables read-only channel access only when its own
// Google OAuth client is configured. Revoking a channel grant revokes every
// grant of that Google client for the user, so the client must belong to a
// project separate from sign-in, publishing and file import.
func validateYouTubeChannel(a *Application) error {
	a.YouTubeChannelEnabled = false
	id, secret := a.YouTubeChannelClientID, a.YouTubeChannelClientSecret
	if id == "" && secret == "" {
		return nil
	}
	if id == "" || secret == "" {
		return errors.New("YouTube channel access requires YOUTUBE_CHANNEL_CLIENT_ID and YOUTUBE_CHANNEL_CLIENT_SECRET")
	}
	for _, existing := range []string{a.GoogleClientID, a.YouTubeClientID, a.YouTubePortabilityClientID} {
		if existing != "" && (existing == id || sameGoogleOAuthProject(existing, id)) {
			return errors.New("YouTube channel access must use a dedicated Google Cloud project, separate from sign-in, publishing and file import")
		}
	}
	key, err := base64.StdEncoding.DecodeString(a.SocialEncryptionKey)
	if err != nil || len(key) != 32 {
		return errors.New("YouTube channel access requires SOCIAL_TOKEN_ENCRYPTION_KEY encoding 32 random bytes")
	}
	app, err := url.Parse(a.AppURL)
	if err != nil {
		return errors.New("APP_URL is invalid")
	}
	redirect, err := url.Parse(a.YouTubeChannelRedirectURL)
	if err != nil || redirect.Host != app.Host || redirect.Scheme != app.Scheme || redirect.User != nil || redirect.RawQuery != "" || redirect.Fragment != "" || redirect.Path != youtubeChannelCallbackPath {
		return errors.New("YOUTUBE_CHANNEL_REDIRECT_URL must be the APP_URL origin followed by " + youtubeChannelCallbackPath)
	}
	a.YouTubeChannelEnabled = true
	return nil
}
