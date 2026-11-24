package main

import (
	"database/sql"

	"sneepcut/backend-go/internal/config"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/youtubechannel"
)

// configuredYouTubeChannel wires read-only channel access. Without its own
// Google client the handler stays registered but reports enabled:false.
func configuredYouTubeChannel(db *sql.DB, auth *identity.Handler, app config.Application, secureCookies bool) (*youtubechannel.Handler, error) {
	var client *youtubechannel.Client
	if app.YouTubeChannelEnabled {
		var err error
		client, err = youtubechannel.NewClient(youtubechannel.ClientConfig{
			ClientID: app.YouTubeChannelClientID, ClientSecret: app.YouTubeChannelClientSecret,
			RedirectURL: app.YouTubeChannelRedirectURL,
		})
		if err != nil {
			return nil, err
		}
	}
	service, err := youtubechannel.NewService(youtubechannel.NewPostgresStore(db), client, app.SocialEncryptionKey)
	if err != nil {
		return nil, err
	}
	return youtubechannel.NewHandler(service, auth, youtubechannel.Config{AppURL: app.AppURL, SecureCookies: secureCookies}), nil
}
