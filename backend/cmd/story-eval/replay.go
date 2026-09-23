package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"sneepcut/backend-go/internal/story"
)

const maxReplayJSON = 32 << 20

var checkpointName = regexp.MustCompile(`^([0-9]{6})-([a-z-]+)\.json$`)
var replayNamespace = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,100}$`)
var replayHash = regexp.MustCompile(`^[0-9a-f]{64}$`)

type replayRun struct {
	directory      string
	request        story.Request
	requestHash    string
	provenance     evaluationProvenance
	highestVersion int
	linked, copied int
}

func prepareEvaluation(cfg evalFlags) (string, string, []string, *replayRun, error) {
	if cfg.replay == "" {
		input, output, files, err := evaluationPaths(cfg.input, cfg.output)
		return input, output, files, nil, err
	}
	replay, err := loadReplay(cfg.replay)
	if err != nil {
		return "", "", nil, nil, err
	}
	output, err := filepath.Abs(cfg.output)
	if err != nil || within(replay.directory, output) {
		return "", "", nil, nil, errors.New("replay output must be outside the previous run directory")
	}
	return replay.directory, output, nil, replay, nil
}

// Prior metadata is local input, not authority to select arbitrary filesystem
// paths. The only executable source/cache references stay under run/media.
func loadReplay(directory string) (*replayRun, error) {
	directory, err := filepath.Abs(directory)
	if err == nil {
		directory, err = filepath.EvalSymlinks(directory)
	}
	if err != nil {
		return nil, errors.New("replay run directory is unavailable")
	}
	for _, path := range []string{directory, filepath.Join(directory, "checkpoints"), filepath.Join(directory, "media")} {
		info, err := os.Lstat(path)
		if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return nil, errors.New("replay run, media and checkpoints must be existing regular directories")
		}
	}
	r := &replayRun{directory: directory}
	raw, err := readReplayJSON(filepath.Join(directory, "request.json"), &r.request)
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256(raw)
	r.requestHash = hex.EncodeToString(digest[:])
	if _, err = readReplayJSON(filepath.Join(directory, "provenance.json"), &r.provenance); err != nil {
		return nil, err
	}
	if !replayNamespace.MatchString(r.request.ID) || r.request.UserID != "local-evaluation" {
		return nil, errors.New("replay request is not a local evaluation request")
	}
	if _, err = story.NormalizeOptions(r.request.Options); err != nil {
		return nil, fmt.Errorf("invalid replay options: %w", err)
	}
	if err = story.ValidateAssets(r.request.Assets, story.DefaultLimits()); err != nil {
		return nil, fmt.Errorf("invalid replay source metadata: %w", err)
	}
	if err = r.noteVersion(r.request.VersionStart-1, false); err != nil {
		return nil, err
	}
	if r.request.Base != nil {
		if err = r.noteVersion(r.request.Base.Number, true); err != nil {
			return nil, err
		}
	}
	for _, attempt := range r.request.PreviousAttempts {
		if err = r.noteVersion(attempt.Version, true); err != nil {
			return nil, err
		}
	}
	indexes := map[string]int{}
	keys := map[string]bool{}
	for i, asset := range r.request.Assets {
		if !replayNamespace.MatchString(asset.ID) || !replayHash.MatchString(asset.Hash) || !strings.HasPrefix(asset.Key, "sources/"+r.request.ID+"/") || keys[asset.Key] {
			return nil, errors.New("invalid replay source identity or checksum")
		}
		indexes[asset.ID], keys[asset.Key] = i, true
	}
	if len(r.provenance.Sources) != len(indexes) {
		return nil, errors.New("replay provenance does not cover the confirmed source set")
	}
	seen := map[string]bool{}
	for _, source := range r.provenance.Sources {
		i, ok := indexes[source.AssetID]
		if !ok || seen[source.AssetID] {
			return nil, errors.New("replay provenance repeats or references an unknown source")
		}
		asset := r.request.Assets[i]
		if source.StorageKey != asset.Key || source.SHA256 != asset.Hash || source.Bytes != asset.Size {
			return nil, errors.New("replay request and source provenance disagree")
		}
		seen[source.AssetID] = true
	}
	entries, err := os.ReadDir(filepath.Join(directory, "checkpoints"))
	if err != nil || len(entries) == 0 || len(entries) > 10000 {
		return nil, errors.New("replay checkpoints are missing or exceed the supported count")
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	sequences := map[int]bool{}
	for _, entry := range entries {
		match := checkpointName.FindStringSubmatch(entry.Name())
		if match == nil {
			continue
		}
		sequence, _ := strconv.Atoi(match[1])
		if sequence == 0 || sequences[sequence] {
			return nil, errors.New("replay checkpoint sequence is ambiguous")
		}
		sequences[sequence] = true
		file := filepath.Join(directory, "checkpoints", entry.Name())
		switch match[2] {
		case "asset":
			var checkpoint struct {
				Data story.Asset `json:"data"`
			}
			if _, err = readReplayJSON(file, &checkpoint); err != nil {
				return nil, err
			}
			i, ok := indexes[checkpoint.Data.ID]
			if !ok || !sameSourceIdentity(r.request.Assets[i], checkpoint.Data) {
				return nil, errors.New("replay asset checkpoint changed an original source identity")
			}
			r.request.Assets[i] = checkpoint.Data
		case "version":
			var checkpoint struct {
				Data story.Version `json:"data"`
			}
			if _, err = readReplayJSON(file, &checkpoint); err != nil {
				return nil, err
			}
			if err = r.noteVersion(checkpoint.Data.Number, true); err != nil {
				return nil, err
			}
		case "repair":
			var checkpoint struct {
				Data story.Attempt `json:"data"`
			}
			if _, err = readReplayJSON(file, &checkpoint); err != nil {
				return nil, err
			}
			if err = r.noteVersion(checkpoint.Data.Version, true); err != nil {
				return nil, err
			}
		}
	}
	if err = r.readSavedVersions(); err != nil {
		return nil, err
	}
	return r, nil
}

func sameSourceIdentity(a, b story.Asset) bool {
	return a.ID == b.ID && a.Kind == b.Kind && a.Key == b.Key && a.Hash == b.Hash && a.Size == b.Size &&
		a.Duration == b.Duration && a.Width == b.Width && a.Height == b.Height && a.HasAudio == b.HasAudio &&
		a.Mapping.OriginalStart == b.Mapping.OriginalStart
}

func (r *replayRun) noteVersion(number int, required bool) error {
	if number < 0 || required && number == 0 || number >= 1000000 {
		return errors.New("replay version numbering is invalid")
	}
	r.highestVersion = max(r.highestVersion, number)
	return nil
}

func (r *replayRun) readSavedVersions() error {
	for _, name := range []string{"result.json", "timeline-version.json", "repair-attempts.json"} {
		file := filepath.Join(r.directory, name)
		if _, err := os.Lstat(file); os.IsNotExist(err) {
			continue
		}
		switch name {
		case "result.json":
			var result story.Result
			if _, err := readReplayJSON(file, &result); err != nil {
				return err
			}
			if err := r.noteVersion(result.Best.Number, false); err != nil {
				return err
			}
			for _, attempt := range result.Attempts {
				if err := r.noteVersion(attempt.Version, true); err != nil {
					return err
				}
			}
		case "timeline-version.json":
			var version story.Version
			if _, err := readReplayJSON(file, &version); err != nil {
				return err
			}
			if err := r.noteVersion(version.Number, true); err != nil {
				return err
			}
		case "repair-attempts.json":
			var attempts []story.Attempt
			if _, err := readReplayJSON(file, &attempts); err != nil {
				return err
			}
			for _, attempt := range attempts {
				if err := r.noteVersion(attempt.Version, true); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func readReplayJSON(file string, value any) ([]byte, error) {
	info, err := os.Lstat(file)
	if err != nil || !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > maxReplayJSON {
		return nil, fmt.Errorf("replay metadata %s is missing, nonregular or oversized", filepath.Base(file))
	}
	raw, err := os.ReadFile(file)
	// Older successful runs encoded an empty repair-attempt slice as null.
	// Required object metadata must still be present and non-null.
	_, emptyAttemptArray := value.(*[]story.Attempt)
	if err != nil || len(raw) > maxReplayJSON || json.Unmarshal(raw, value) != nil || strings.TrimSpace(string(raw)) == "null" && !emptyAttemptArray {
		return nil, fmt.Errorf("replay metadata %s is invalid JSON", filepath.Base(file))
	}
	return raw, nil
}

func replayOptions(previous story.Options, cfg evalFlags) story.Options {
	if cfg.explicit["brief-file"] {
		previous.Brief = cfg.options.Brief
	}
	if cfg.explicit["language"] {
		previous.Language = cfg.options.Language
	}
	if cfg.explicit["aspect"] {
		previous.AspectRatio = cfg.options.AspectRatio
	}
	if cfg.explicit["mode"] {
		previous.Mode = cfg.options.Mode
	}
	if cfg.explicit["target"] {
		previous.TargetSeconds = cfg.options.TargetSeconds
	}
	if cfg.explicit["captions"] {
		previous.Captions = cfg.options.Captions
	}
	if cfg.explicit["preserve-order"] {
		previous.PreserveOrder = cfg.options.PreserveOrder
	}
	return previous
}
