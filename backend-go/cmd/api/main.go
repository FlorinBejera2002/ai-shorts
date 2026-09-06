package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"sneepcut/backend-go/internal/config"
	"sneepcut/backend-go/internal/httpapi"
	"sneepcut/backend-go/internal/server"
)

const version = "0.1.0"

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	if err := run(logger); err != nil {
		logger.Error("API stopped", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	cfg, err := config.Load(os.Args[1:], os.Getenv, os.Stderr)
	if errors.Is(err, flag.ErrHelp) {
		return nil
	}
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Wire feature services here as migration steps are completed. The foundation
	// has no domain repositories, database connection, or Python fallback routes.
	handler := httpapi.New(logger, cfg.Environment, version)
	return server.Run(ctx, cfg.ListenAddr, handler, logger)
}
