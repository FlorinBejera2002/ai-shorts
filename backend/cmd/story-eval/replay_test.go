package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/story"
)

func replayFixture(t *testing.T) (string, story.Request) {
	t.Helper()
	dir := t.TempDir()
	data := []byte("original media fixture")
	hash := sha256.Sum256(data)
	asset := story.Asset{ID: "source-001", Key: "sources/original-run/source-001.mp4", Hash: hex.EncodeToString(hash[:]), Name: "one.mp4", Size: int64(len(data)), Duration: 12, Width: 1920, Height: 1080, HasAudio: true, Include: "auto", Mapping: story.TimeMap{Rate: 1, Duration: 12}}
	request := story.Request{ID: "original-run", UserID: "local-evaluation", Options: story.DefaultOptions(), Assets: []story.Asset{asset}, VersionStart: 1}
	request.Options.Language, request.Options.TargetSeconds = "ro", 60
	request.Base = &story.Version{Number: 2}
	request.Action = "improve_flow"
	request.PreviousAttempts = []story.Attempt{{Version: 3}}
	if err := writeJSONExclusive(filepath.Join(dir, "request.json"), request); err != nil {
		t.Fatal(err)
	}
	provenance := evaluationProvenance{Input: "no-longer-mounted-original-input", Provider: "gemini", SpeechModel: "previous-model.bin", Sources: []sourceProvenance{{AssetID: asset.ID, StorageKey: asset.Key, SHA256: asset.Hash, Bytes: asset.Size, OriginalPath: "attribution-only/not-read.mp4"}}}
	if err := writeJSONExclusive(filepath.Join(dir, "provenance.json"), provenance); err != nil {
		t.Fatal(err)
	}
	storage, err := media.NewLocalStorage(filepath.Join(dir, "media"))
	if err != nil {
		t.Fatal(err)
	}
	if err = storage.Close(); err != nil {
		t.Fatal(err)
	}
	writeFixtureFile(t, filepath.Join(dir, "media", filepath.FromSlash(asset.Key)), data)
	checkpoints, err := newFileCheckpoints(dir, io.Discard, 12)
	if err != nil {
		t.Fatal(err)
	}
	if err = checkpoints.SaveAsset(context.Background(), asset); err != nil {
		t.Fatal(err)
	}
	asset.AnalysisVersion = "cached-analysis"
	asset.SemanticAnalysisVersion = "cached-semantics"
	asset.ProxyKey = "work/original-run/analysis/source-001/cached-analysis/proxy.mp4"
	asset.Candidates = []story.Candidate{{ID: "source-001-phrase-1", SourceID: asset.ID, In: 1, Out: 9, Text: "Original words."}}
	writeFixtureFile(t, filepath.Join(dir, "media", filepath.FromSlash(asset.ProxyKey)), []byte("normalized proxy"))
	if err = checkpoints.SaveAsset(context.Background(), asset); err != nil {
		t.Fatal(err)
	}
	if err = checkpoints.SaveVersion(context.Background(), story.Version{Number: 5}); err != nil {
		t.Fatal(err)
	}
	if err = checkpoints.SaveAttempt(context.Background(), story.Attempt{Version: 8}); err != nil {
		t.Fatal(err)
	}
	return dir, request
}

func writeFixtureFile(t *testing.T, file string, data []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(file), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, data, 0600); err != nil {
		t.Fatal(err)
	}
}

type fixtureInspector struct {
	expected story.Asset
	root     string
	calls    int
	change   func(*story.Asset)
}

func (i *fixtureInspector) Inspect(ctx context.Context, key string) (story.Asset, error) {
	i.calls++
	if err := ctx.Err(); err != nil {
		return story.Asset{}, err
	}
	data, err := os.ReadFile(filepath.Join(i.root, filepath.FromSlash(key)))
	if err != nil {
		return story.Asset{}, err
	}
	fresh := i.expected
	hash := sha256.Sum256(data)
	fresh.Hash, fresh.Size = hex.EncodeToString(hash[:]), int64(len(data))
	if i.change != nil {
		i.change(&fresh)
	}
	return fresh, nil
}

func TestReplayOptionsAndSourceVerificationUseLatestCheckpoint(t *testing.T) {
	dir, old := replayFixture(t)
	r, err := loadReplay(dir)
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := parseFlags([]string{"-replay", dir, "-output", t.TempDir(), "-target", "30"}, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	inspector := &fixtureInspector{root: filepath.Join(dir, "media"), expected: old.Assets[0]}
	req, err := r.verifiedRequest(context.Background(), inspector, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if inspector.calls != 1 || req.ID != old.ID || req.Base != nil || req.Action != "" || req.PreviousAttempts != nil || req.VersionStart != 9 {
		t.Fatalf("replay execution identity %#v", req)
	}
	if req.Options.Language != "ro" || req.Options.TargetSeconds != 30 || cfg.provider != "offline" {
		t.Fatal("replay did not preserve implicit options or offline default")
	}
	if req.Assets[0].AnalysisVersion != "cached-analysis" || req.Assets[0].SemanticAnalysisVersion != "cached-semantics" || len(req.Assets[0].Candidates) != 1 {
		t.Fatal("latest complete source analysis was not reused")
	}
	if r.provenanceRecord(req.VersionStart).PreviousRequestHash == "" || r.provenanceRecord(req.VersionStart).PreviousProvider != "gemini" {
		t.Fatal("missing replay provenance")
	}
}

func TestReplayRejectsMissingInvalidOrInconsistentMetadata(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*testing.T, string, story.Request)
	}{
		{"missing request", func(t *testing.T, d string, _ story.Request) {
			if err := os.Remove(filepath.Join(d, "request.json")); err != nil {
				t.Fatal(err)
			}
		}},
		{"invalid request", func(t *testing.T, d string, _ story.Request) {
			writeFixtureFile(t, filepath.Join(d, "request.json"), []byte(`{"id":`))
		}},
		{"null request", func(t *testing.T, d string, _ story.Request) {
			writeFixtureFile(t, filepath.Join(d, "request.json"), []byte(`null`))
		}},
		{"invalid checkpoint", func(t *testing.T, d string, _ story.Request) {
			writeFixtureFile(t, filepath.Join(d, "checkpoints", "000002-asset.json"), []byte(`null`))
		}},
		{"changed hash", func(t *testing.T, d string, r story.Request) {
			a := r.Assets[0]
			a.Hash = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
			raw, _ := json.Marshal(map[string]any{"data": a})
			writeFixtureFile(t, filepath.Join(d, "checkpoints", "000002-asset.json"), raw)
		}},
		{"changed source key", func(t *testing.T, d string, r story.Request) {
			a := r.Assets[0]
			a.Key = "sources/other/source.mp4"
			raw, _ := json.Marshal(map[string]any{"data": a})
			writeFixtureFile(t, filepath.Join(d, "checkpoints", "000002-asset.json"), raw)
		}},
		{"unknown source", func(t *testing.T, d string, r story.Request) {
			a := r.Assets[0]
			a.ID = "different"
			raw, _ := json.Marshal(map[string]any{"data": a})
			writeFixtureFile(t, filepath.Join(d, "checkpoints", "000002-asset.json"), raw)
		}},
		{"missing provenance", func(t *testing.T, d string, _ story.Request) {
			if err := os.Remove(filepath.Join(d, "provenance.json")); err != nil {
				t.Fatal(err)
			}
		}},
		{"invalid version", func(t *testing.T, d string, _ story.Request) {
			writeFixtureFile(t, filepath.Join(d, "checkpoints", "000003-version.json"), []byte(`{"data":{"number":-1}}`))
		}},
		{"ambiguous sequence", func(t *testing.T, d string, _ story.Request) {
			writeFixtureFile(t, filepath.Join(d, "checkpoints", "000003-repair.json"), []byte(`{"data":{"version":2}}`))
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir, r := replayFixture(t)
			tt.mutate(t, dir, r)
			if _, err := loadReplay(dir); err == nil {
				t.Fatal("invalid replay metadata accepted")
			}
		})
	}
}

func TestReplayRejectsMissingChangedOrMisdescribedOriginalMedia(t *testing.T) {
	for _, name := range []string{"missing", "hash mismatch", "duration mismatch", "stream mismatch"} {
		t.Run(name, func(t *testing.T) {
			dir, old := replayFixture(t)
			r, err := loadReplay(dir)
			if err != nil {
				t.Fatal(err)
			}
			inspector := &fixtureInspector{root: filepath.Join(dir, "media"), expected: old.Assets[0]}
			file := filepath.Join(inspector.root, filepath.FromSlash(old.Assets[0].Key))
			switch name {
			case "missing":
				if err = os.Remove(file); err != nil {
					t.Fatal(err)
				}
			case "hash mismatch":
				writeFixtureFile(t, file, []byte("changed original"))
			case "duration mismatch":
				inspector.change = func(a *story.Asset) { a.Duration++ }
			case "stream mismatch":
				inspector.change = func(a *story.Asset) { a.HasAudio = false }
			}
			if _, err = r.verifiedRequest(context.Background(), inspector, evalFlags{}); err == nil {
				t.Fatal("unverified original accepted")
			}
		})
	}
}

type fileSnapshot struct {
	Bytes    []byte
	Modified time.Time
}

func snapshotFiles(t *testing.T, dir string) map[string]fileSnapshot {
	t.Helper()
	result := map[string]fileSnapshot{}
	err := filepath.WalkDir(dir, func(file string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		data, err := os.ReadFile(file)
		if err != nil {
			return err
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		relative, err := filepath.Rel(dir, file)
		if err != nil {
			return err
		}
		result[relative] = fileSnapshot{data, info.ModTime()}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func TestReplayHydratesConfinedAppendOnlyCachesWithoutChangingPriorRun(t *testing.T) {
	dir, old := replayFixture(t)
	before := snapshotFiles(t, dir)
	r, err := loadReplay(dir)
	if err != nil {
		t.Fatal(err)
	}
	destination, err := media.NewLocalStorage(filepath.Join(t.TempDir(), "media"))
	if err != nil {
		t.Fatal(err)
	}
	defer destination.Close()
	if err = r.hydrate(context.Background(), destination); err != nil {
		t.Fatal(err)
	}
	if r.linked+r.copied != 2 {
		t.Fatal("original and proxy were not hydrated", r.linked, r.copied)
	}
	key := old.Assets[0].Key
	copy, err := destination.Path(key)
	if err != nil {
		t.Fatal(err)
	}
	staged := filepath.Join(t.TempDir(), "new.mp4")
	writeFixtureFile(t, staged, []byte("new output"))
	if err = destination.Save(context.Background(), staged, key, "video/mp4"); err == nil {
		t.Fatal("hydrated original overwritten")
	}
	if err = destination.Save(context.Background(), staged, "clips/original-run/story/new-version/clip.mp4", "video/mp4"); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(copy)
	if err != nil || !bytes.Equal(data, before[filepath.Join("media", filepath.FromSlash(key))].Bytes) {
		t.Fatal("original copy changed")
	}
	if after := snapshotFiles(t, dir); !reflect.DeepEqual(before, after) {
		t.Fatal("replay changed a prior report, source, cache or timestamp")
	}
}

func TestReplayRejectsSymbolicLinkCacheEscape(t *testing.T) {
	dir, _ := replayFixture(t)
	outside := filepath.Join(t.TempDir(), "private.json")
	writeFixtureFile(t, outside, []byte("outside cache"))
	link := filepath.Join(dir, "media", "work", "original-run", "escape.json")
	if err := os.Symlink(outside, link); err != nil {
		t.Skip("host cannot create symbolic links")
	}
	r, err := loadReplay(dir)
	if err != nil {
		t.Fatal(err)
	}
	destination, err := media.NewLocalStorage(filepath.Join(t.TempDir(), "media"))
	if err != nil {
		t.Fatal(err)
	}
	defer destination.Close()
	if err = r.hydrate(context.Background(), destination); err == nil {
		t.Fatal("cache symlink escaped its source run")
	}
}

func TestReplayFlagsRequireExactlyOneSourceAndSeparateOutput(t *testing.T) {
	for _, args := range [][]string{{"-output", "out"}, {"-input", "in", "-replay", "old", "-output", "out"}, {"-replay", "old"}} {
		if _, err := parseFlags(args, io.Discard); err == nil {
			t.Fatal("ambiguous evaluation sources accepted", args)
		}
	}
	dir, _ := replayFixture(t)
	if _, _, _, _, err := prepareEvaluation(evalFlags{replay: dir, output: filepath.Join(dir, "nested")}); err == nil {
		t.Fatal("replay wrote inside prior run")
	}
	r, err := loadReplay(dir)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err = r.verifiedRequest(ctx, &fixtureInspector{}, evalFlags{}); !errors.Is(err, context.Canceled) {
		t.Fatal("cancelled verification continued", err)
	}
}
