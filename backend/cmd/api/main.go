package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"net/http"

	"sneepcut/backend-go/internal/config"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/errorlog"
	"sneepcut/backend-go/internal/httpapi"
	"sneepcut/backend-go/internal/server"
)

const version = "0.1.0"

func main() {
	capture := errorlog.NewCapture(slog.NewTextHandler(os.Stdout, nil), errorlog.SourceAPI)
	logger := slog.New(capture)
	slog.SetDefault(logger)
	if err := run(logger, capture); err != nil {
		logger.Error("API stopped", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger, capture *errorlog.Capture) error {
	cfg, err := config.Load(os.Args[1:], os.Getenv, os.Stderr)
	if errors.Is(err, flag.ErrHelp) {
		return nil
	}
	if err != nil {
		return err
	}
	if cfg.Healthcheck {
		return checkHealth(cfg.ListenAddr)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var handler http.Handler = httpapi.New(logger, cfg.Environment, version)
	if cfg.Auth.Enabled {
		application, err := config.ApplicationFromEnv(os.Getenv, cfg.Environment)
		if err != nil {
			return err
		}

		db, err := data.Open(ctx, data.Config{
			DSN: cfg.Auth.DatabaseURL, MaxOpenConns: 25, MaxIdleConns: 5, MaxIdleTime: 15 * time.Minute,
		})
		if err != nil {
			return errors.New("Go authentication could not connect to PostgreSQL")
		}
		defer db.Close()
		recorder, stopRecorder := capture.Start(ctx, db)
		defer stopRecorder()
		applicationHandler, closeDependencies, err := buildApplication(db, cfg, application, logger, recorder)
		if err != nil {
			return err
		}
		defer closeDependencies()
		handler = applicationHandler
		logger.Info("Go application API enabled")
	}

	return server.Run(ctx, cfg.ListenAddr, handler, logger)
}
