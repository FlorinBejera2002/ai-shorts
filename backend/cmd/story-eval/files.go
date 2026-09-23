package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"sneepcut/backend-go/internal/story"
)

type sourceProvenance struct {
	OriginalPath string `json:"original_path"`
	AssetID      string `json:"asset_id"`
	StorageKey   string `json:"storage_key"`
	SHA256       string `json:"sha256"`
	Bytes        int64  `json:"bytes"`
}

func within(parent, child string) bool {
	relative, err := filepath.Rel(parent, child)
	return err == nil && (relative == "." || relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)))
}

func evaluationPaths(input, output string) (string, string, []string, error) {
	input, err := filepath.Abs(input)
	if err != nil {
		return "", "", nil, errors.New("invalid input directory")
	}
	input, err = filepath.EvalSymlinks(input)
	if err != nil {
		return "", "", nil, errors.New("input directory does not exist")
	}
	entries, err := os.ReadDir(input)
	if err != nil {
		return "", "", nil, errors.New("input must be a readable directory")
	}
	output, err = filepath.Abs(output)
	if err != nil {
		return "", "", nil, errors.New("invalid output directory")
	}
	if within(input, output) {
		return "", "", nil, errors.New("evaluation output must be outside the input directory")
	}
	var files []string
	var total int64
	limits := story.DefaultLimits()
	for _, entry := range entries {
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if ext != ".mp4" && ext != ".mov" {
			continue
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return "", "", nil, errors.New("source videos must be regular files, not symbolic links")
		}
		info, err := entry.Info()
		if err != nil || !info.Mode().IsRegular() {
			return "", "", nil, errors.New("source videos must be readable regular files")
		}
		if info.Size() <= 0 || info.Size() > limits.MaxFileBytes {
			return "", "", nil, errors.New("a source file is empty or exceeds the evaluation size limit")
		}
		total += info.Size()
		files = append(files, filepath.Join(input, entry.Name()))
	}
	if len(files) == 0 || len(files) > limits.MaxFiles || total > limits.MaxTotalBytes {
		return "", "", nil, errors.New("input must contain 1..20 MP4/MOV files within the story upload limits")
	}
	sort.Strings(files)
	manifestPath := filepath.Join(input, "manifest.json")
	if info, err := os.Lstat(manifestPath); err == nil {
		if !info.Mode().IsRegular() || info.Size() > 1<<20 {
			return "", "", nil, errors.New("dataset manifest must be a regular JSON file under 1 MiB")
		}
		raw, err := os.ReadFile(manifestPath)
		if err != nil {
			return "", "", nil, errors.New("dataset manifest could not be read")
		}
		var manifest struct {
			UploadOrder []string `json:"upload_order"`
		}
		if json.Unmarshal(raw, &manifest) != nil {
			return "", "", nil, errors.New("dataset manifest is not valid JSON")
		}
		if manifest.UploadOrder != nil {
			if len(manifest.UploadOrder) != len(files) {
				return "", "", nil, errors.New("manifest upload_order must contain every source exactly once")
			}
			allowed := map[string]string{}
			for _, file := range files {
				allowed[filepath.Base(file)] = file
			}
			ordered := make([]string, 0, len(files))
			for _, name := range manifest.UploadOrder {
				file, ok := allowed[name]
				if !ok || name != filepath.Base(name) || strings.ContainsAny(name, "/\\:") {
					return "", "", nil, errors.New("manifest upload_order contains an invalid or repeated source filename")
				}
				ordered = append(ordered, file)
				delete(allowed, name)
			}
			files = ordered
		}
	} else if !os.IsNotExist(err) {
		return "", "", nil, errors.New("dataset manifest could not be inspected")
	}
	return input, output, files, nil
}

// Every checkpoint is a new file. Repeated versions and interrupted runs retain
// the entire local audit trail; no command overwrites or deletes prior output.
type fileCheckpoints struct {
	directory       string
	out             io.Writer
	mu              sync.Mutex
	sequence        int
	lastPhase       string
	budgetMu        sync.Mutex
	calls, maxCalls int
}

func newFileCheckpoints(runDir string, out io.Writer, maxCalls int) (*fileCheckpoints, error) {
	directory := filepath.Join(runDir, "checkpoints")
	if err := os.Mkdir(directory, 0700); err != nil {
		return nil, errors.New("checkpoint directory could not be created")
	}
	return &fileCheckpoints{directory: directory, out: out, maxCalls: maxCalls}, nil
}

func (c *fileCheckpoints) append(kind string, value any) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.sequence++
	file := filepath.Join(c.directory, fmt.Sprintf("%06d-%s.json", c.sequence, kind))
	return writeJSONExclusive(file, struct {
		At   time.Time `json:"at"`
		Data any       `json:"data"`
	}{time.Now().UTC(), value})
}

func (c *fileCheckpoints) Progress(ctx context.Context, phase, message string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := c.append("progress", map[string]string{"phase": phase, "message": message}); err != nil {
		return err
	}
	if phase != c.lastPhase {
		fmt.Fprintln(c.out, "Phase:", phase)
		c.lastPhase = phase
	}
	return nil
}
func (c *fileCheckpoints) SaveAsset(ctx context.Context, asset story.Asset) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return c.append("asset", asset)
}
func (c *fileCheckpoints) SaveVersion(ctx context.Context, version story.Version) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return c.append("version", version)
}
func (c *fileCheckpoints) SaveAttempt(ctx context.Context, attempt story.Attempt) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return c.append("repair", attempt)
}
func (c *fileCheckpoints) reserveAI(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	c.budgetMu.Lock()
	defer c.budgetMu.Unlock()
	if c.calls >= c.maxCalls {
		return story.ErrBudget
	}
	if err := c.append("ai-reservation", map[string]int{"call": c.calls + 1, "limit": c.maxCalls}); err != nil {
		return err
	}
	c.calls++
	return nil
}

func writeJSONExclusive(file string, value any) error {
	out, err := os.OpenFile(file, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return errors.New("evaluation checkpoint could not be created exclusively")
	}
	defer out.Close()
	encoder := json.NewEncoder(out)
	encoder.SetIndent("", "  ")
	if err = encoder.Encode(value); err != nil {
		return errors.New("evaluation checkpoint could not be encoded")
	}
	if err = out.Sync(); err != nil {
		return errors.New("evaluation checkpoint could not be persisted")
	}
	return out.Close()
}
