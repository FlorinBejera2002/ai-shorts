package main

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"

	"sneepcut/backend-go/internal/config"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/youtubeimport"
)

func configuredYouTubeImport(db *sql.DB, auth *identity.Handler, storage *media.Service, app config.Application, secureCookies bool) (*youtubeimport.Handler, error) {
	var client *youtubeimport.Client
	if app.YouTubePortabilityEnabled {
		var err error
		client, err = youtubeimport.NewClient(youtubeimport.ClientConfig{
			ClientID: app.YouTubePortabilityClientID, ClientSecret: app.YouTubePortabilityClientSecret,
			RedirectURL: app.YouTubePortabilityRedirectURL,
		})
		if err != nil {
			return nil, err
		}
	}
	return youtubeimport.New(db, auth, youtubeImportMedia{service: storage, maxBytes: min(app.MaxUploadBytes, app.YouTubePortabilityMaxBytes)}, client, youtubeimport.Config{
		Enabled: app.YouTubePortabilityEnabled, TestMode: app.YouTubePortabilityTestMode,
		SecureCookies: secureCookies, AppURL: app.AppURL,
		EncryptionKey: app.SocialEncryptionKey, TempRoot: app.YouTubePortabilityTempDirectory,
		Limits: youtubeimport.ArchiveLimits{
			MaxArchiveBytes: app.YouTubePortabilityMaxBytes, MaxDownloadBytes: app.YouTubePortabilityMaxBytes,
			MaxTotalBytes: app.YouTubePortabilityMaxBytes, MaxVideoBytes: min(app.MaxUploadBytes, app.YouTubePortabilityMaxBytes),
			MaxVideos: app.YouTubePortabilityMaxVideos,
		},
	})
}

type youtubeImportMedia struct {
	service  *media.Service
	maxBytes int64
}

func (m youtubeImportMedia) ImportSource(ctx context.Context, userID string, video youtubeimport.ImportedVideo) (string, error) {
	prepared, cleanup, err := prepareYouTubeImport(ctx, video, m.maxBytes)
	if err != nil {
		return "", err
	}
	defer cleanup()
	file, err := os.Open(prepared.Path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	contentType := "application/octet-stream"
	switch strings.ToLower(filepath.Ext(prepared.FileName)) {
	case ".mp4":
		contentType = "video/mp4"
	case ".mov":
		contentType = "video/quicktime"
	case ".avi":
		contentType = "video/x-msvideo"
	case ".mkv":
		contentType = "video/x-matroska"
	case ".webm":
		contentType = "video/webm"
	}
	result, err := m.service.StoreImportedVideo(ctx, userID, media.UploadIntent{
		FileName: prepared.FileName, FileSize: prepared.Size, ContentType: contentType,
	}, file)
	if err != nil {
		return "", err
	}
	return m.service.KeyFromReference(result.FilePath)
}

func (m youtubeImportMedia) RemoveImportSource(ctx context.Context, userID, key string) error {
	return m.service.RemoveImportedVideo(ctx, userID, key)
}

func (m youtubeImportMedia) ImportSourceSize(ctx context.Context, key string) (int64, error) {
	return m.service.Storage.Size(ctx, key)
}
