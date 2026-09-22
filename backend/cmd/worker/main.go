package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/config"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/gemini"
	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/openrouter"
	"sneepcut/backend-go/internal/processing"
	"sneepcut/backend-go/internal/worker"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	if err := run(logger); err != nil {
		logger.Error("Worker stopped", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	environment := os.Getenv("APP_ENV")
	if environment == "" {
		environment = "development"
	}
	app, err := config.ApplicationFromEnv(os.Getenv, environment)
	if err != nil {
		return err
	}
	db, err := data.Open(ctx, data.Config{DSN: os.Getenv("DATABASE_URL"), MaxOpenConns: 5, MaxIdleConns: 2, MaxIdleTime: 15 * time.Minute})
	if err != nil {
		return err
	}
	defer db.Close()
	var storage media.Storage
	if app.StorageType == "s3" {
		storage, err = media.NewS3Storage(media.S3Config{AccessKey: app.S3AccessKey, SecretKey: app.S3SecretKey, SessionToken: app.S3SessionToken, Region: app.S3Region, Bucket: app.S3Bucket, Endpoint: app.S3Endpoint, PathStyle: app.S3PathStyle})
	} else {
		storage, err = media.NewLocalStorage(app.MediaRoot)
	}
	if err != nil {
		return err
	}
	var ai aiprovider.Generator = gemini.New(app.GeminiKey, app.GeminiModel)
	if app.AIProvider == "openrouter" || (app.AIProvider == "auto" && app.GeminiKey == "" && app.OpenRouterKey != "") {
		ai = openrouter.New(app.OpenRouterKey, app.OpenRouterModel, app.AppURL)
	}
	cfg, err := processing.ConfigFromEnv(os.Getenv)
	if err != nil {
		return err
	}
	executor := worker.Worker{Repo: worker.NewRepository(db), Pipeline: processing.New(cfg, storage, ai), Storage: storage, Logger: logger, YouTubeImportApproved: app.YouTubeImportApproved}
	return executor.Run(ctx)
}
