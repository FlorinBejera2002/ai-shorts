// Package server owns HTTP timeouts and graceful process shutdown.
package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"
)

func Run(ctx context.Context, address string, handler http.Handler, logger *slog.Logger) error {
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return err
	}
	return serve(ctx, listener, handler, logger)
}

func serve(ctx context.Context, listener net.Listener, handler http.Handler, logger *slog.Logger) error {
	srv := &http.Server{
		Handler:           handler,
		IdleTimeout:       time.Minute,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       5 * time.Second,
		WriteTimeout:      10 * time.Second,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelError),
	}
	// These small-request defaults must be revisited when uploads/AI routes are
	// implemented; they are not a policy for multi-gigabyte video transfers.
	stopped := make(chan struct{})
	shutdownResult := make(chan error, 1)
	go func() {
		select {
		case <-ctx.Done():
			logger.Info("shutting down server")
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			err := srv.Shutdown(shutdownCtx)
			if err != nil {
				_ = srv.Close()
			}
			shutdownResult <- err
		case <-stopped:
			shutdownResult <- nil
		}
	}()

	logger.Info("starting server", "addr", listener.Addr().String())
	err := srv.Serve(listener)
	close(stopped)
	shutdownErr := <-shutdownResult
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	if shutdownErr != nil {
		return fmt.Errorf("HTTP shutdown: %w", shutdownErr)
	}
	logger.Info("stopped server")
	return nil
}
