package config

import (
	"errors"
	"net/url"
	"strings"
)

type Auth struct {
	Enabled        bool
	DatabaseURL    string
	JWTSecret      string
	JWTIssuer      string
	JWTAudience    string
	AllowedOrigins []string
	SecureCookies  bool
}

func authFromEnv(getenv func(string) string) Auth {
	a := Auth{
		Enabled:     getenv("GO_AUTH_ENABLED") == "true",
		DatabaseURL: getenv("DATABASE_URL"), JWTSecret: getenv("JWT_SECRET"),
		JWTIssuer: "sneepcut", JWTAudience: "sneepcut-web",
		AllowedOrigins: []string{"http://localhost:3000", "http://localhost"},
	}
	if value := getenv("JWT_ISSUER"); value != "" {
		a.JWTIssuer = value
	}
	if value := getenv("JWT_AUDIENCE"); value != "" {
		a.JWTAudience = value
	}
	if value := getenv("CORS_ORIGINS"); value != "" {
		a.AllowedOrigins = nil
		for _, origin := range strings.Split(value, ",") {
			if origin = strings.TrimSpace(origin); origin != "" {
				a.AllowedOrigins = append(a.AllowedOrigins, origin)
			}
		}
	}
	return a
}

func (a *Auth) validate(environment string) error {
	a.SecureCookies = environment != "development" && environment != "test" && environment != "testing"
	if !a.Enabled {
		return nil
	}
	if len(a.JWTSecret) < 32 {
		return errors.New("Go auth requires JWT_SECRET with at least 32 bytes")
	}
	u, err := url.Parse(a.DatabaseURL)
	if err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") || u.Host == "" || u.Path == "" || u.Path == "/" {
		return errors.New("Go auth requires a PostgreSQL DATABASE_URL")
	}
	if len(a.AllowedOrigins) == 0 {
		return errors.New("Go auth requires explicit CORS_ORIGINS")
	}
	for _, origin := range a.AllowedOrigins {
		u, err := url.Parse(origin)
		if err != nil || u.Host == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" ||
			(u.Scheme != "https" && (a.SecureCookies || u.Scheme != "http")) {
			return errors.New("Go auth requires valid CORS origins (HTTPS outside development/test)")
		}
	}
	return nil
}
