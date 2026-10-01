package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/config"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/gemini"
	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/openrouter"
	"sneepcut/backend-go/internal/processing"
	"sneepcut/backend-go/internal/stories"
	"sneepcut/backend-go/internal/story"
	"sneepcut/backend-go/internal/worker"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	if err := run(logger); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return
		}
		logger.Error("Worker stopped", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	options, err := parseOptions(os.Args[1:], os.Stderr)
	if err != nil {
		return err
	}
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
	storyLimits, err := story.LimitsFromEnv(os.Getenv)
	if err != nil {
		return err
	}
	processor := processing.New(cfg, storage, ai)
	storyRepo := stories.NewRepository(db, storyLimits)
	storyRunner := &stories.Runner{Repo: storyRepo, Builder: story.New(processor, ai, storyLimits), Logger: logger}
	if options.storyID != "" {
		if options.improve {
			if err := storyRepo.QueueFlowImprovement(ctx, options.storyID); err != nil {
				return err
			}
		}
		logger.Info("Processing only the selected Story", "story_id", options.storyID)
		if err := storyRunner.RunStory(ctx, options.storyID); err != nil {
			return err
		}
		logger.Info("Selected Story processing finished", "story_id", options.storyID)
		return nil
	}
	executor := worker.Worker{Repo: worker.NewRepository(db), Pipeline: processor, Storage: storage, Logger: logger, YouTubeImportApproved: app.YouTubeImportApproved, Stories: storyRunner}
	return executor.Run(ctx)
}

type workerOptions struct {
	storyID string
	improve bool
}

func parseOptions(args []string, output io.Writer) (workerOptions, error) {
	var options workerOptions
	flags := flag.NewFlagSet("worker", flag.ContinueOnError)
	flags.SetOutput(output)
	flags.BoolVar(&options.improve, "improve", false, "Queue an Improve flow revision before processing the selected Story")
	selected := false
	flags.Func("story-id", "Process only this pending Story UUID once, then exit (no queue recovery)", func(value string) error {
		if selected {
			return errors.New("--story-id may be specified only once")
		}
		selected = true
		if err := stories.ValidateStoryID(value); err != nil {
			return err
		}
		options.storyID = strings.ToLower(value)
		return nil
	})
	if err := flags.Parse(args); err != nil {
		return workerOptions{}, err
	}
	if flags.NArg() != 0 {
		return workerOptions{}, fmt.Errorf("unexpected worker arguments: %v", flags.Args())
	}
	if options.improve && options.storyID == "" {
		return workerOptions{}, errors.New("--improve requires --story-id")
	}
	return options, nil
}
