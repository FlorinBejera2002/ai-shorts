package main

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"time"

	"github.com/julienschmidt/httprouter"
	"github.com/redis/go-redis/v9"

	"sneepcut/backend-go/internal/account"
	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/assistant"
	"sneepcut/backend-go/internal/billing"
	"sneepcut/backend-go/internal/brand"
	"sneepcut/backend-go/internal/calendar"
	"sneepcut/backend-go/internal/clips"
	"sneepcut/backend-go/internal/config"
	"sneepcut/backend-go/internal/dashboard"
	"sneepcut/backend-go/internal/email"
	"sneepcut/backend-go/internal/gemini"
	"sneepcut/backend-go/internal/httpapi"
	"sneepcut/backend-go/internal/httpx"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/jobs"
	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/openrouter"
	"sneepcut/backend-go/internal/projects"
	"sneepcut/backend-go/internal/publishing"
	"sneepcut/backend-go/internal/scripts"
)

func configuredGenerator(application config.Application) aiprovider.Generator {
	provider := application.AIProvider
	if provider == "openrouter" || (provider == "auto" && application.GeminiKey == "" && application.OpenRouterKey != "") {
		return openrouter.New(application.OpenRouterKey, application.OpenRouterModel, application.AppURL)
	}
	return gemini.New(application.GeminiKey, application.GeminiModel)
}

func buildApplication(db *sql.DB, cfg config.Config, a config.Application, logger *slog.Logger) (http.Handler, func(), error) {
	noop := func() {}
	tokens, err := identity.NewTokens(identity.TokenConfig{Secret: cfg.Auth.JWTSecret, Issuer: cfg.Auth.JWTIssuer, Audience: cfg.Auth.JWTAudience, AccessLifetime: 15 * time.Minute, RefreshLifetime: 30 * 24 * time.Hour})
	if err != nil {
		return nil, noop, err
	}
	identityService := identity.NewService(identity.NewPostgres(db), tokens)
	auth := identity.NewHandler(identityService, identity.HTTPConfig{SecureCookies: cfg.Auth.SecureCookies, AllowedOrigins: cfg.Auth.AllowedOrigins, TrustedProxies: a.TrustedProxies}, logger)
	mailer, err := email.New(email.Config{From: a.EmailFrom, ResendKey: a.ResendKey, SMTPHost: a.SMTPHost, SMTPPort: a.SMTPPort, SMTPUsername: a.SMTPUser, SMTPPassword: a.SMTPPassword, SMTPRequireTLS: a.SMTPRequireTLS})
	if err != nil {
		return nil, noop, err
	}
	accounts := identity.NewAccounts(db, identity.AccountsConfig{AppURL: a.AppURL, RequireVerification: a.RequireEmailVerification, InitialCredits: a.InitialCredits, SecurityKey: cfg.Auth.JWTSecret}, mailer)
	auth.SetAccounts(accounts)
	identityService.SetSecondFactor(accounts)
	auth.SetGoogle(identity.NewGoogle(identity.GoogleConfig{ClientID: a.GoogleClientID, ClientSecret: a.GoogleClientSecret, RedirectURL: a.GoogleRedirectURL, AppURL: a.AppURL}))
	options, err := redis.ParseURL(a.RedisURL)
	if err != nil {
		return nil, noop, err
	}
	options.DialTimeout = 2 * time.Second
	options.ReadTimeout = 2 * time.Second
	options.WriteTimeout = 2 * time.Second
	options.MaxRetries = -1
	limits := redis.NewClient(options)
	nonce, err := media.NewRedisNonceStore(a.RedisURL)
	if err != nil {
		if closeErr := limits.Close(); closeErr != nil {
			logger.Warn("Failed to close Redis request limiter", "error", closeErr)
		}
		return nil, noop, err
	}
	cleanup := func() {
		if err := nonce.Close(); err != nil {
			logger.Warn("Failed to close Redis nonce store", "error", err)
		}
		if err := limits.Close(); err != nil {
			logger.Warn("Failed to close Redis request limiter", "error", err)
		}
	}
	auth.SetRequestLimiter(identity.NewRequestLimiter(limits, cfg.Auth.SecureCookies))
	var storage media.Storage
	if a.StorageType == "s3" {
		storage, err = media.NewS3Storage(media.S3Config{AccessKey: a.S3AccessKey, SecretKey: a.S3SecretKey, SessionToken: a.S3SessionToken, Region: a.S3Region, Bucket: a.S3Bucket, Endpoint: a.S3Endpoint, PathStyle: a.S3PathStyle})
	} else {
		storage, err = media.NewLocalStorage(a.MediaRoot)
	}
	if err != nil {
		cleanup()
		return nil, noop, err
	}
	mediaService := media.NewService(media.Config{LocalRoot: a.MediaRoot, PublicBaseURL: a.PublicMediaURL, AppURL: a.AppURL, SigningSecret: a.SigningSecret, UploadSecret: a.UploadSecret, DirectUploadURL: a.DirectUploadURL, StagingDirectory: a.StagingDirectory, MaxUploadBytes: a.MaxUploadBytes}, db, storage, nonce, media.NewClamAV(media.ClamAVConfig{Address: a.ScannerAddress, Timeout: a.ScannerTimeout, MaxBytes: a.MaxUploadBytes, Enabled: a.ScannerEnabled, Environment: cfg.Environment}))
	billingService, err := billing.NewService(billing.Config{SecretKey: a.StripeKey, WebhookSecret: a.StripeWebhookSecret, AppURL: a.AppURL, PlanPrices: a.StripePlans, CreditPacks: a.StripeCreditPacks}, db, auth)
	if err != nil {
		cleanup()
		return nil, noop, err
	}
	clipHandler := clips.New(db, auth, mediaService, clips.Config{MaxClipDuration: a.MaxClipDuration})
	publishingHandler, err := publishing.New(db, auth, mediaService, publishing.Config{ProviderConfig: publishing.ProviderConfig{AppURL: a.AppURL, MetaAppID: a.MetaAppID, MetaAppSecret: a.MetaAppSecret, InstagramAppID: a.InstagramAppID, InstagramAppSecret: a.InstagramAppSecret, TikTokClientKey: a.TikTokClientKey, TikTokClientSecret: a.TikTokClientSecret, YouTubeClientID: a.YouTubeClientID, YouTubeClientSecret: a.YouTubeClientSecret, YouTubeMediaURLPrefix: a.YouTubeMediaURLPrefix, YouTubeAuditApproved: a.YouTubeAuditApproved, LinkedInClientID: a.LinkedInClientID, LinkedInClientSecret: a.LinkedInClientSecret, LinkedInAPIVersion: a.LinkedInAPIVersion, LinkedInMediaURLPrefix: a.LinkedInMediaURLPrefix, LinkedInOrganizationEnabled: a.LinkedInOrganizationEnabled, GraphVersion: a.MetaGraphVersion, TikTokVerifiedURLPrefix: a.TikTokVerifiedURLPrefix}, EncryptionKey: a.SocialEncryptionKey, Enabled: a.SocialPublishingEnabled})
	if err != nil {
		cleanup()
		return nil, noop, err
	}
	stopPublishing := publishingHandler.Start(context.Background())
	previousCleanup := cleanup
	cleanup = func() { stopPublishing(); previousCleanup() }
	generator := configuredGenerator(a)
	readiness := func(router *httprouter.Router) {
		router.HandlerFunc("GET", "/api/ready", func(w http.ResponseWriter, r *http.Request) {
			ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
			defer cancel()
			database := db.PingContext(ctx) == nil
			schema := false
			if database {
				var valid bool
				// The runtime database is supplied by configuration, independently of IDE data sources.
				//noinspection SqlNoDataSourceInspection
				schema = db.QueryRowContext(ctx, `SELECT
					EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='users' AND column_name='email_activation_required')
					AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='users' AND column_name='mfa_enabled')
					AND to_regclass('edit_deliveries') IS NOT NULL
					AND to_regclass('account_preferences') IS NOT NULL
					AND to_regclass('account_security_events') IS NOT NULL`).Scan(&valid) == nil && valid
			}
			redisReady := limits.Ping(ctx).Err() == nil
			status := 200
			if !database || !schema || !redisReady {
				status = 503
			}
			httpx.JSON(w, status, map[string]any{"ready": status == 200, "database": database, "schema": schema, "redis": redisReady})
		})
	}
	handler := httpapi.New(logger, cfg.Environment, version, auth.Register, media.NewHandler(mediaService, auth).Register, jobs.New(db, auth, mediaService, jobs.Config{YouTubeImportApproved: a.YouTubeImportApproved}).Register, projects.New(db, auth, mediaService).Register, clipHandler.Register, brand.New(db, auth, mediaService).Register, calendar.New(db, auth, mediaService, publishingHandler).Register, billingService.Register, account.New(db, auth, mediaService, billingService, account.Config{MFA: accounts}).Register, dashboard.New(db, auth, clipHandler).Register, scripts.NewWithDB(db, auth, generator).Register, assistant.New(db, auth, generator).Register, publishingHandler.Register, readiness)
	return httpapi.Policy(auth.Policy(handler), httpapi.PolicyConfig{AllowedHosts: a.AllowedHosts}), cleanup, nil
}
