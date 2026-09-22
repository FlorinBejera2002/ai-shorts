package config

import (
	"errors"
	"net"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Application carries validated process settings into focused feature adapters.
type Application struct {
	YouTubeMediaURLPrefix, LinkedInMediaURLPrefix, XMediaURLPrefix                                                                                                                                                                                                                                string
	YouTubeAuditApproved                                                                                                                                                                                                                                                                          bool
	YouTubeImportApproved                                                                                                                                                                                                                                                                         bool
	SocialEncryptionKey, MetaAppID, MetaAppSecret, InstagramAppID, InstagramAppSecret, TikTokClientKey, TikTokClientSecret, YouTubeClientID, YouTubeClientSecret, LinkedInClientID, LinkedInClientSecret, LinkedInAPIVersion, XClientID, XClientSecret, MetaGraphVersion, TikTokVerifiedURLPrefix string
	LinkedInOrganizationEnabled                                                                                                                                                                                                                                                                   bool
	SocialPublishingEnabled                                                                                                                                                                                                                                                                       bool
	AppURL, RedisURL, MediaRoot, StorageType, PublicMediaURL, SigningSecret, UploadSecret, StagingDirectory, DirectUploadURL                                                                                                                                                                      string
	MaxUploadBytes                                                                                                                                                                                                                                                                                int64
	MaxClipDuration                                                                                                                                                                                                                                                                               float64
	ScannerEnabled                                                                                                                                                                                                                                                                                bool
	ScannerAddress                                                                                                                                                                                                                                                                                string
	ScannerTimeout                                                                                                                                                                                                                                                                                time.Duration
	AllowedHosts, TrustedProxies                                                                                                                                                                                                                                                                  []string
	RequireEmailVerification                                                                                                                                                                                                                                                                      bool
	InitialCredits                                                                                                                                                                                                                                                                                int
	GoogleClientID, GoogleClientSecret, GoogleRedirectURL                                                                                                                                                                                                                                         string
	EmailFrom, ResendKey, SMTPHost, SMTPUser, SMTPPassword                                                                                                                                                                                                                                        string
	SMTPPort                                                                                                                                                                                                                                                                                      int
	SMTPRequireTLS                                                                                                                                                                                                                                                                                bool
	AIProvider, GeminiKey, GeminiModel, OpenRouterKey, OpenRouterModel                                                                                                                                                                                                                            string
	S3AccessKey, S3SecretKey, S3SessionToken, S3Region, S3Bucket, S3Endpoint                                                                                                                                                                                                                      string
	S3PathStyle                                                                                                                                                                                                                                                                                   bool
	StripeKey, StripeWebhookSecret                                                                                                                                                                                                                                                                string
	StripePlans                                                                                                                                                                                                                                                                                   map[string]string
	StripeCreditPacks                                                                                                                                                                                                                                                                             map[string]int
}

func splitValues(raw string) []string {
	out := []string{}
	for _, s := range strings.Split(raw, ",") {
		if s = strings.TrimSpace(s); s != "" {
			out = append(out, s)
		}
	}
	return out
}
func ApplicationFromEnv(getenv func(string) string, environment string) (Application, error) {
	value := func(key, fallback string) string {
		if v := getenv(key); v != "" {
			return v
		}
		return fallback
	}
	a := Application{AppURL: value("APP_URL", "http://localhost:3000"), RedisURL: value("REDIS_URL", "redis://localhost:6379/0"), MediaRoot: value("LOCAL_MEDIA_ROOT", "../media"), StorageType: value("STORAGE_TYPE", "local"), PublicMediaURL: getenv("AWS_PUBLIC_BASE_URL"), SigningSecret: value("INTERNAL_API_KEY", getenv("NEXTAUTH_SECRET")), UploadSecret: getenv("UPLOAD_TOKEN_SECRET"), StagingDirectory: getenv("UPLOAD_STAGING_DIR"), DirectUploadURL: value("NEXT_PUBLIC_UPLOAD_URL", "/api/upload/direct"), AllowedHosts: splitValues(value("ALLOWED_HOSTS", "localhost,127.0.0.1,::1")), TrustedProxies: splitValues(getenv("TRUSTED_PROXY_CIDRS")), GoogleClientID: getenv("GOOGLE_CLIENT_ID"), GoogleClientSecret: getenv("GOOGLE_CLIENT_SECRET"), EmailFrom: getenv("AUTH_EMAIL_FROM"), ResendKey: getenv("RESEND_API_KEY"), SMTPHost: getenv("SMTP_HOST"), SMTPUser: getenv("SMTP_USERNAME"), SMTPPassword: getenv("SMTP_PASSWORD"), AIProvider: strings.ToLower(strings.TrimSpace(value("AI_PROVIDER", "auto"))), GeminiKey: getenv("GEMINI_API_KEY"), GeminiModel: value("GEMINI_MODEL_NAME", "gemini-2.5-flash"), OpenRouterKey: getenv("OPENROUTER_API_KEY"), OpenRouterModel: value("OPENROUTER_MODEL_NAME", "google/gemini-2.5-flash"), S3AccessKey: getenv("AWS_ACCESS_KEY_ID"), S3SecretKey: getenv("AWS_SECRET_ACCESS_KEY"), S3SessionToken: getenv("AWS_SESSION_TOKEN"), S3Region: value("AWS_REGION", "auto"), S3Bucket: getenv("AWS_S3_BUCKET"), S3Endpoint: getenv("AWS_ENDPOINT_URL"), StripeKey: getenv("STRIPE_SECRET_KEY"), StripeWebhookSecret: getenv("STRIPE_WEBHOOK_SECRET"), StripePlans: map[string]string{}, StripeCreditPacks: map[string]int{}}
	production := environment != "development" && environment != "test" && environment != "testing"
	parseInt := func(key string, fallback, low, high int) (int, error) {
		n, err := strconv.Atoi(value(key, strconv.Itoa(fallback)))
		if err != nil || n < low || n > high {
			return 0, errors.New(key + " is outside the supported range")
		}
		return n, nil
	}
	parseBool := func(key string, fallback bool) (bool, error) {
		b, err := strconv.ParseBool(value(key, strconv.FormatBool(fallback)))
		if err != nil {
			return false, errors.New(key + " must be true or false")
		}
		return b, nil
	}
	var err error
	a.SocialEncryptionKey = getenv("SOCIAL_TOKEN_ENCRYPTION_KEY")
	a.MetaAppID = getenv("META_APP_ID")
	a.MetaAppSecret = getenv("META_APP_SECRET")
	a.InstagramAppID = getenv("INSTAGRAM_APP_ID")
	a.InstagramAppSecret = getenv("INSTAGRAM_APP_SECRET")
	a.TikTokClientKey = getenv("TIKTOK_CLIENT_KEY")
	a.TikTokClientSecret = getenv("TIKTOK_CLIENT_SECRET")
	a.YouTubeClientID = getenv("YOUTUBE_CLIENT_ID")
	a.YouTubeClientSecret = getenv("YOUTUBE_CLIENT_SECRET")
	a.LinkedInClientID = getenv("LINKEDIN_CLIENT_ID")
	a.LinkedInClientSecret = getenv("LINKEDIN_CLIENT_SECRET")
	a.LinkedInAPIVersion = value("LINKEDIN_API_VERSION", "202609")
	a.LinkedInMediaURLPrefix = value("LINKEDIN_MEDIA_URL_PREFIX", a.PublicMediaURL)
	if a.LinkedInMediaURLPrefix == "" {
		a.LinkedInMediaURLPrefix = a.AppURL + "/media/"
	}
	if len(a.LinkedInAPIVersion) != 6 || strings.Trim(a.LinkedInAPIVersion, "0123456789") != "" {
		return a, errors.New("LINKEDIN_API_VERSION must use YYYYMM format")
	}
	a.LinkedInOrganizationEnabled, err = parseBool("LINKEDIN_ORGANIZATION_ENABLED", false)
	if err != nil {
		return a, err
	}
	a.XClientID = getenv("X_CLIENT_ID")
	a.XClientSecret = getenv("X_CLIENT_SECRET")
	a.XMediaURLPrefix = value("X_MEDIA_URL_PREFIX", a.PublicMediaURL)
	if a.XMediaURLPrefix == "" {
		a.XMediaURLPrefix = a.AppURL + "/media/"
	}
	a.YouTubeMediaURLPrefix = value("YOUTUBE_MEDIA_URL_PREFIX", a.PublicMediaURL)
	if a.YouTubeMediaURLPrefix == "" {
		a.YouTubeMediaURLPrefix = a.AppURL + "/media/"
	}
	a.YouTubeImportApproved, err = parseBool("YOUTUBE_IMPORT_APPROVED", false)
	if err != nil {
		return a, err
	}
	a.YouTubeAuditApproved, err = parseBool("YOUTUBE_AUDIT_APPROVED", false)
	if err != nil {
		return a, err
	}
	a.MetaGraphVersion = value("META_GRAPH_VERSION", "v23.0")
	a.TikTokVerifiedURLPrefix = getenv("TIKTOK_VERIFIED_URL_PREFIX")
	a.SocialPublishingEnabled, err = parseBool("SOCIAL_PUBLISHING_ENABLED", false)
	if err != nil {
		return a, err
	}
	mb, err := parseInt("MAX_UPLOAD_SIZE_MB", 2048, 1, 2048)
	if err != nil {
		return a, err
	}
	a.MaxUploadBytes = int64(mb) * 1024 * 1024
	duration, err := parseInt("MAX_CLIP_DURATION", 60, 3, 600)
	if err != nil {
		return a, err
	}
	a.MaxClipDuration = float64(duration)
	a.InitialCredits, err = parseInt("DEFAULT_FREE_CREDITS", 1000, 0, 1000000)
	if err != nil {
		return a, err
	}
	a.SMTPPort, err = parseInt("SMTP_PORT", 587, 1, 65535)
	if err != nil {
		return a, err
	}
	port, err := parseInt("CLAMAV_PORT", 3310, 1, 65535)
	if err != nil {
		return a, err
	}
	a.ScannerAddress = net.JoinHostPort(value("CLAMAV_HOST", "localhost"), strconv.Itoa(port))
	timeout, err := parseInt("CLAMAV_TIMEOUT_SECONDS", 120, 1, 600)
	if err != nil {
		return a, err
	}
	a.ScannerTimeout = time.Duration(timeout) * time.Second
	if a.ScannerEnabled, err = parseBool("UPLOAD_SCANNER_ENABLED", production); err != nil {
		return a, err
	}
	if production {
		a.ScannerEnabled = true
	}
	if a.RequireEmailVerification, err = parseBool("AUTH_REQUIRE_EMAIL_VERIFICATION", false); err != nil {
		return a, err
	}
	if a.SMTPRequireTLS, err = parseBool("SMTP_REQUIRE_TLS", production); err != nil {
		return a, err
	}
	if production {
		a.SMTPRequireTLS = true
	}
	if a.S3PathStyle, err = parseBool("AWS_S3_FORCE_PATH_STYLE", false); err != nil {
		return a, err
	}
	if a.StorageType != "local" && a.StorageType != "s3" {
		return a, errors.New("STORAGE_TYPE must be local or s3")
	}
	if a.AIProvider != "auto" && a.AIProvider != "gemini" && a.AIProvider != "openrouter" {
		return a, errors.New("AI_PROVIDER must be auto, gemini or openrouter")
	}
	if len(a.GeminiModel) > 200 || len(a.OpenRouterModel) > 200 || strings.ContainsAny(a.GeminiModel+a.OpenRouterModel, "\r\n\x00") {
		return a, errors.New("AI model names must be at most 200 characters without control characters")
	}
	app, err := url.Parse(a.AppURL)
	if err != nil || app.Host == "" || app.User != nil || app.RawQuery != "" || app.Fragment != "" || (app.Path != "" && app.Path != "/") || (app.Scheme != "https" && (production || app.Scheme != "http")) {
		return a, errors.New("APP_URL must be an origin (HTTPS outside development/test)")
	}
	a.AppURL = strings.TrimRight(a.AppURL, "/")
	a.GoogleRedirectURL = value("GOOGLE_REDIRECT_URL", a.AppURL+"/v1/auth/google/callback")
	if a.GoogleClientID != "" || a.GoogleClientSecret != "" {
		if a.GoogleClientID == "" || a.GoogleClientSecret == "" {
			return a, errors.New("Google sign-in requires both client ID and secret")
		}
		u, e := url.Parse(a.GoogleRedirectURL)
		if e != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "/v1/auth/google/callback" || (u.Scheme != "https" && (production || u.Scheme != "http")) {
			return a, errors.New("GOOGLE_REDIRECT_URL must be the public Go Google callback URL")
		}
	}
	if len(a.AllowedHosts) == 0 {
		return a, errors.New("ALLOWED_HOSTS must list the public and internal API hosts")
	}
	for _, host := range a.AllowedHosts {
		if host == "*" || strings.ContainsAny(host, "/\\@?# \t\r\n") {
			return a, errors.New("invalid ALLOWED_HOSTS entry")
		}
	}
	for _, prefix := range a.TrustedProxies {
		if _, err := netip.ParsePrefix(prefix); err != nil {
			return a, errors.New("TRUSTED_PROXY_CIDRS must contain IP network prefixes")
		}
	}
	redis, e := url.Parse(a.RedisURL)
	if e != nil || redis.Host == "" || (redis.Scheme != "redis" && redis.Scheme != "rediss") {
		return a, errors.New("REDIS_URL must be a Redis URL")
	}
	if a.SigningSecret == "" && !production {
		a.SigningSecret = "sneepcut-dev-key"
	}
	if a.UploadSecret == "" && !production {
		a.UploadSecret = value("JWT_SECRET", "")
	}
	if production && (len(a.SigningSecret) < 32 || len(a.UploadSecret) < 32) {
		return a, errors.New("Production requires independent INTERNAL_API_KEY and UPLOAD_TOKEN_SECRET secrets of at least 32 bytes")
	}
	if a.RequireEmailVerification && a.ResendKey == "" && a.SMTPHost == "" {
		return a, errors.New("Email verification requires configured Resend or SMTP delivery")
	}
	for _, plan := range []string{"creator", "pro", "agency"} {
		a.StripePlans[plan] = getenv("STRIPE_PRICE_" + strings.ToUpper(plan))
	}
	for _, n := range []int{100, 500, 1000} {
		if price := getenv("STRIPE_PRICE_CREDITS_" + strconv.Itoa(n)); price != "" {
			a.StripeCreditPacks[price] = n
		}
	}
	return a, nil
}
