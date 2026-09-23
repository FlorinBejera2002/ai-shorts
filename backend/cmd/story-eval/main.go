// story-eval runs the production story pipeline against local permissioned
// fixtures without a database or publishing. External AI is explicitly opt-in.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/gemini"
	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/openrouter"
	"sneepcut/backend-go/internal/processing"
	"sneepcut/backend-go/internal/story"
)

type evalFlags struct {
	captureResponses                                          bool
	input, replay, output, provider, briefFile, narrationFile string
	explicit                                                  map[string]bool
	options                                                   story.Options
	maxAICalls, repairCycles                                  int
	timeout                                                   time.Duration
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := runEvaluation(ctx, os.Args[1:], os.Getenv, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func parseFlags(args []string, out io.Writer) (evalFlags, error) {
	cfg := evalFlags{options: story.DefaultOptions()}
	flags := flag.NewFlagSet("story-eval", flag.ContinueOnError)
	flags.SetOutput(out)
	flags.StringVar(&cfg.input, "input", "", "Permissioned MP4/MOV directory; choose exactly one of -input or -replay")
	flags.StringVar(&cfg.replay, "replay", "", "Prior evaluation run directory; reuse verified originals and analysis in a new run")
	flags.StringVar(&cfg.output, "output", "", "Output parent directory (required; creates a unique run subfolder)")
	flags.StringVar(&cfg.provider, "provider", "offline", "offline or configured; configured opts into the existing AI_PROVIDER credentials and costs")
	flags.StringVar(&cfg.briefFile, "brief-file", "", "Optional UTF-8 editorial brief file, written only to local reports")
	flags.StringVar(&cfg.narrationFile, "narration-file", "", "Optional permissioned audio recording; sets narration mode and retains the complete voice")
	flags.BoolVar(&cfg.captureResponses, "capture-responses", false, "Save generated provider text in private local checkpoints for diagnosis; never writes request headers, credentials, prompts or media")
	flags.StringVar(&cfg.options.Language, "language", "auto", "auto, ro or en")
	flags.StringVar(&cfg.options.AspectRatio, "aspect", "9:16", "9:16, 16:9, 1:1 or 4:5")
	flags.StringVar(&cfg.options.Mode, "mode", "smart", "smart or strict")
	flags.IntVar(&cfg.options.TargetSeconds, "target", 45, "Target seconds: 15, 30, 45, 60 or 90; no artificial padding")
	flags.BoolVar(&cfg.options.Captions, "captions", true, "Burn captions from selected original words")
	flags.BoolVar(&cfg.options.PreserveOrder, "preserve-order", false, "Preserve source filename order")
	flags.IntVar(&cfg.maxAICalls, "max-ai-calls", 12, "Hard provider-call ceiling, 1..12 including review and repair")
	flags.IntVar(&cfg.repairCycles, "repair-cycles", 2, "Maximum repair cycles, 0..2")
	flags.DurationVar(&cfg.timeout, "timeout", 2*time.Hour, "Complete evaluation timeout, at most 2h")
	if err := flags.Parse(args); err != nil {
		return cfg, err
	}
	if flags.NArg() != 0 || (cfg.input == "") == (cfg.replay == "") || cfg.output == "" {
		return cfg, errors.New("provide exactly one of -input or -replay, plus -output, without positional arguments")
	}
	if cfg.narrationFile != "" && cfg.replay != "" {
		return cfg, errors.New("a replay keeps its original narration; use -input for a new recording")
	}
	cfg.options.Narration = cfg.narrationFile != ""
	cfg.explicit = map[string]bool{}
	flags.Visit(func(f *flag.Flag) { cfg.explicit[f.Name] = true })
	if cfg.provider != "offline" && cfg.provider != "configured" {
		return cfg, errors.New("provider must be offline or configured")
	}
	if cfg.maxAICalls < 1 || cfg.maxAICalls > 12 || cfg.repairCycles < 0 || cfg.repairCycles > 2 || cfg.timeout <= 0 || cfg.timeout > 2*time.Hour {
		return cfg, errors.New("evaluation budget must be 1..12 calls, 0..2 repair cycles and timeout at most 2h")
	}
	if cfg.briefFile != "" {
		file, err := os.Open(cfg.briefFile)
		if err != nil {
			return cfg, errors.New("editorial brief could not be read")
		}
		data, err := io.ReadAll(io.LimitReader(file, 16001))
		_ = file.Close()
		if err != nil || len(data) > 16000 {
			return cfg, errors.New("editorial brief exceeds the supported size")
		}
		cfg.options.Brief = string(data)
	}
	options, err := story.NormalizeOptions(cfg.options)
	cfg.options = options
	return cfg, err
}

func evaluationProvider(mode string, getenv func(string) string) (aiprovider.Generator, string, error) {
	if mode == "offline" {
		return nil, "offline", nil
	}
	provider := strings.ToLower(strings.TrimSpace(getenv("AI_PROVIDER")))
	if provider == "" {
		provider = "auto"
	}
	if provider != "auto" && provider != "gemini" && provider != "openrouter" {
		return nil, "", errors.New("configured AI_PROVIDER must be auto, gemini or openrouter")
	}
	geminiKey, routerKey := getenv("GEMINI_API_KEY"), getenv("OPENROUTER_API_KEY")
	if provider == "openrouter" || (provider == "auto" && geminiKey == "" && routerKey != "") {
		if routerKey == "" {
			return nil, "", errors.New("configured OpenRouter credentials are unavailable; use -provider offline for local-only evaluation")
		}
		return openrouter.New(routerKey, getenv("OPENROUTER_MODEL_NAME"), getenv("APP_URL")), "openrouter", nil
	}
	if geminiKey == "" {
		return nil, "", errors.New("configured Gemini credentials are unavailable; use -provider offline for local-only evaluation")
	}
	return gemini.New(geminiKey, getenv("GEMINI_MODEL_NAME")), "gemini", nil
}

func runEvaluation(parent context.Context, args []string, getenv func(string) string, out io.Writer) error {
	cfg, err := parseFlags(args, out)
	if errors.Is(err, flag.ErrHelp) {
		return nil
	}
	if err != nil {
		return err
	}
	input, output, files, replay, err := prepareEvaluation(cfg)
	if err != nil {
		return err
	}
	ai, provider, err := evaluationProvider(cfg.provider, getenv)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(output, 0700); err != nil {
		return errors.New("evaluation output directory could not be created")
	}
	resolved, err := filepath.EvalSymlinks(output)
	if err != nil {
		return errors.New("evaluation output directory could not be resolved")
	}
	if within(input, resolved) {
		return errors.New("evaluation output must be outside the input directory")
	}
	runDir, err := os.MkdirTemp(resolved, "run-"+time.Now().UTC().Format("20060102T150405Z")+"-")
	if err != nil {
		return errors.New("unique evaluation run directory could not be created")
	}
	fmt.Fprintln(out, "Evaluation directory:", runDir)
	startedAt := time.Now()
	checkpoints, err := newFileCheckpoints(runDir, out, cfg.maxAICalls)
	if err != nil {
		return err
	}
	if cfg.captureResponses && ai != nil {
		enableHTTPDiagnostics(ai, checkpoints)
		ai = &capturedProvider{Generator: ai, checkpoints: checkpoints}
	}
	datasetFile := filepath.Join(input, "manifest.json")
	if replay != nil {
		datasetFile = filepath.Join(input, "dataset-manifest.json")
	}
	if raw, err := os.ReadFile(datasetFile); err == nil {
		var dataset any
		if err = json.Unmarshal(raw, &dataset); err != nil {
			return errors.New("dataset manifest changed during evaluation preparation")
		}
		if err = writeJSONExclusive(filepath.Join(runDir, "dataset-manifest.json"), dataset); err != nil {
			return err
		}
	}
	ctx, cancel := context.WithTimeout(parent, cfg.timeout)
	defer cancel()
	ctx = story.WithAIBudget(ctx, checkpoints.reserveAI)
	storage, err := media.NewLocalStorage(filepath.Join(runDir, "media"))
	if err != nil {
		return errors.New("evaluation storage could not be opened")
	}
	defer storage.Close()
	if replay != nil {
		if err = replay.hydrate(ctx, storage); err != nil {
			return evaluationFailure(checkpoints, "replay cache", err.Error())
		}
	}
	processingConfig, err := processing.ConfigFromEnv(getenv)
	if err != nil {
		return errors.New("native processing configuration is invalid")
	}
	processingConfig.TempDir = filepath.Join(runDir, "native-tmp")
	if err = os.Mkdir(processingConfig.TempDir, 0700); err != nil {
		return errors.New("evaluation workspace could not be created")
	}
	processor := processing.New(processingConfig, storage, ai)
	limits := story.DefaultLimits()
	limits.MaxAICalls = cfg.maxAICalls
	limits.MaxRepairCycles = cfg.repairCycles
	limits.Timeout = cfg.timeout
	request := story.Request{ID: filepath.Base(runDir), UserID: "local-evaluation", Options: cfg.options, VersionStart: 1}
	provenance := []sourceProvenance{}
	if replay != nil {
		request, err = replay.verifiedRequest(ctx, processor, cfg)
		if err != nil {
			return evaluationFailure(checkpoints, "replay source verification", err.Error())
		}
		provenance = replay.provenance.Sources
		for _, asset := range request.Assets {
			if err = checkpoints.SaveAsset(ctx, asset); err != nil {
				return err
			}
		}
		fmt.Fprintf(out, "Verified %d replay sources; prior run remains unchanged\n", len(request.Assets))
	} else {
		for i, file := range files {
			if err = ctx.Err(); err != nil {
				return err
			}
			id := fmt.Sprintf("source-%03d", i+1)
			key := "sources/" + request.ID + "/" + id + strings.ToLower(filepath.Ext(file))
			if err = checkpoints.append("source-input", map[string]string{"original_path": file, "asset_id": id, "storage_key": key}); err != nil {
				return err
			}
			if err = storage.Save(ctx, file, key, "video/mp4"); err != nil {
				return evaluationFailure(checkpoints, "ingest", "Original source copy failed")
			}
			asset, inspectErr := processor.Inspect(ctx, key)
			if inspectErr != nil {
				return evaluationFailure(checkpoints, "inspect", inspectErr.Error())
			}
			asset.ID, asset.Name, asset.Order, asset.Include = id, filepath.Base(file), i, "auto"
			request.Assets = append(request.Assets, asset)
			provenance = append(provenance, sourceProvenance{OriginalPath: file, AssetID: id, StorageKey: key, SHA256: asset.Hash, Bytes: asset.Size})
			if err = checkpoints.SaveAsset(ctx, asset); err != nil {
				return err
			}
			fmt.Fprintf(out, "Validated source %d/%d\n", i+1, len(files))
		}
	}
	if cfg.narrationFile != "" {
		asset, origin, err := ingestEvaluationNarration(ctx, cfg.narrationFile, request.ID, processor, storage)
		if err != nil {
			return evaluationFailure(checkpoints, "narration inspect", err.Error())
		}
		request.Assets = append(request.Assets, asset)
		provenance = append(provenance, origin)
		if err = checkpoints.SaveAsset(ctx, asset); err != nil {
			return err
		}
		fmt.Fprintf(out, "Validated narration: %.3f seconds\n", asset.Duration)
	}
	manifest := evaluationProvenance{Created: time.Now().UTC(), Input: input, Provider: provider,
		SpeechModel: filepath.Base(processingConfig.StoryWhisperModel), Limits: limits, Sources: provenance,
		AlgorithmVersion: story.AlgorithmVersion, Models: evaluationModels(processingConfig, ai)}
	if replay != nil {
		manifest.Input = replay.provenance.Input
		manifest.Replay = replay.provenanceRecord(request.VersionStart)
	}
	if err = writeJSONExclusive(filepath.Join(runDir, "provenance.json"), manifest); err != nil {
		return err
	}
	if err = writeJSONExclusive(filepath.Join(runDir, "request.json"), request); err != nil {
		return err
	}
	result, runErr := story.New(processor, ai, limits).Run(ctx, request, checkpoints)
	if err = writeJSONExclusive(filepath.Join(runDir, "result.json"), result); err != nil {
		return err
	}
	if runErr != nil {
		return evaluationFailure(checkpoints, "pipeline", runErr.Error())
	}
	if err = writeJSONExclusive(filepath.Join(runDir, "quality-report.json"), result.Best.Report); err != nil {
		return err
	}
	if err = writeJSONExclusive(filepath.Join(runDir, "repair-attempts.json"), result.Attempts); err != nil {
		return err
	}
	if err = writeJSONExclusive(filepath.Join(runDir, "timeline-version.json"), result.Best); err != nil {
		return err
	}
	summary := struct {
		Status         string  `json:"status"`
		Provider       string  `json:"provider"`
		AICalls        int     `json:"provider_calls"`
		Version        int     `json:"best_version"`
		Preview        string  `json:"preview"`
		Thumbnail      string  `json:"thumbnail"`
		HumanReview    string  `json:"human_review"`
		ElapsedSeconds float64 `json:"elapsed_seconds"`
	}{Status: result.Best.Report.Status, Provider: provider, AICalls: checkpoints.calls, Version: result.Best.Number, ElapsedSeconds: time.Since(startedAt).Seconds(), HumanReview: "Required: check permissioned real footage for source meaning, audio, crop, captions and device coverage; automated status alone is not launch approval."}
	if result.Best.Output.Key != "" {
		summary.Preview, err = storage.Path(result.Best.Output.Key)
		if err != nil {
			return err
		}
	}
	if result.Best.Output.ThumbnailKey != "" {
		summary.Thumbnail, err = storage.Path(result.Best.Output.ThumbnailKey)
		if err != nil {
			return err
		}
	}
	if err = writeJSONExclusive(filepath.Join(runDir, "summary.json"), summary); err != nil {
		return err
	}
	fmt.Fprintf(out, "Status: %s; provider calls: %d; best version: %d\n", summary.Status, summary.AICalls, summary.Version)
	if summary.Preview != "" {
		fmt.Fprintln(out, "Preview:", summary.Preview)
	}
	fmt.Fprintln(out, "Reports:", filepath.Join(runDir, "summary.json"))
	return nil
}

func evaluationFailure(checkpoints *fileCheckpoints, stage, detail string) error {
	_ = checkpoints.append("failure", map[string]string{"stage": stage, "error": detail})
	return fmt.Errorf("evaluation failed during %s; inspect the local checkpoint files", stage)
}
