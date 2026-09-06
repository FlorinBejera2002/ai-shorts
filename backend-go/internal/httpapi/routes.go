// Package httpapi composes routes and shared HTTP middleware. Domain handlers
// belong to their own packages under internal, not in this package or cmd/api.
package httpapi

import (
	"log/slog"
	"net/http"

	"github.com/julienschmidt/httprouter"

	"sneepcut/backend-go/internal/health"
)

type application struct {
	logger *slog.Logger
}

func New(logger *slog.Logger, environment, version string) http.Handler {
	app := &application{logger: logger}
	router := httprouter.New()
	router.NotFound = http.HandlerFunc(app.notFoundResponse)
	router.MethodNotAllowed = http.HandlerFunc(app.methodNotAllowedResponse)
	router.Handler(http.MethodGet, "/v1/healthcheck", health.Handler(environment, version))
	// Keep the existing stack's health path while using the example's server base.
	router.Handler(http.MethodGet, "/api/health", health.Handler(environment, version))
	return app.recoverPanic(router)
}
