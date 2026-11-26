package youtubedownload

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct{ Executable, FFmpeg, Node string }

const format = "bv[height<=2160]+ba/b[height<=2160]"

// Download intentionally does not call the upload scanner. Only a canonical
// YouTube job reaches this path; upload and channel-export scanning is unchanged.
func Download(parent context.Context, cfg Config, raw, dest string) (err error) {
	canonical, err := CanonicalURL(raw)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(parent, time.Hour)
	defer cancel()
	dir, err := os.MkdirTemp(filepath.Dir(dest), "youtube-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)
	proxy, stop, err := startProxy(ctx)
	if err != nil {
		return err
	}
	defer stop()
	if cfg.Executable == "" {
		cfg.Executable = "yt-dlp"
	}
	if cfg.FFmpeg == "" {
		cfg.FFmpeg = "ffmpeg"
	}
	if binary, e := exec.LookPath(cfg.FFmpeg); e == nil {
		cfg.FFmpeg = binary
	}
	if cfg.Node == "" {
		cfg.Node = "node"
	}
	if node, e := exec.LookPath(cfg.Node); e == nil {
		cfg.Node = node
	}
	args := []string{"--ignore-config", "--no-plugin-dirs", "--no-cache-dir", "--no-remote-components", "--no-js-runtimes", "--js-runtimes", "node:" + cfg.Node, "--proxy", proxy, "--no-playlist", "--no-wait-for-video", "--socket-timeout", "30", "--retries", "2", "--fragment-retries", "2", "--concurrent-fragments", "1", "--no-progress", "--no-warnings", "--ffmpeg-location", cfg.FFmpeg, "--format", format, "--max-filesize", strconv.FormatInt(MaxBytes, 10), "--match-filter", "!is_live & !is_upcoming & duration > 0"}
	metadata, err := run(ctx, cfg.Executable, append(append([]string{}, args...), "--dump-single-json", "--skip-download", "--", canonical), dir, false)
	if err != nil {
		return downloadError(ctx, err)
	}
	var info struct {
		ID         string  `json:"id"`
		Duration   float64 `json:"duration"`
		Live       bool    `json:"is_live"`
		LiveStatus string  `json:"live_status"`
		Height     int     `json:"height"`
		Filesize   int64   `json:"filesize"`
		Formats    []struct {
			Size int64 `json:"filesize"`
		} `json:"requested_formats"`
	}
	if json.Unmarshal(metadata, &info) != nil || !strings.HasSuffix(canonical, "v="+info.ID) || info.Duration <= 0 || math.IsInf(info.Duration, 0) || info.Live || info.LiveStatus == "is_upcoming" || info.LiveStatus == "is_live" || info.Height > MaxHeight {
		return errors.New("YouTube video is unavailable or is a live stream")
	}
	size := info.Filesize
	if len(info.Formats) > 0 {
		size = 0
		for _, f := range info.Formats {
			if f.Size > MaxBytes {
				return errors.New("YouTube video exceeds the 10 GB limit")
			}
			size += f.Size
		}
	}
	if size > MaxBytes {
		return errors.New("YouTube video exceeds the 10 GB limit")
	}
	_, err = run(ctx, cfg.Executable, append(args, "--merge-output-format", "mp4", "--remux-video", "mp4", "--output", filepath.Join(dir, "source.%(ext)s"), "--", canonical), dir, true)
	if err != nil {
		return downloadError(ctx, err)
	}
	path := filepath.Join(dir, "source.mp4")
	stat, err := os.Lstat(path)
	if err != nil || !stat.Mode().IsRegular() || stat.Size() <= 0 {
		return errors.New("YouTube did not return a video file")
	}
	if stat.Size() > MaxBytes {
		return errors.New("YouTube video exceeds the 10 GB limit")
	}
	// Never replace an existing file, even if this function is reused elsewhere.
	if _, err = os.Lstat(dest); !errors.Is(err, os.ErrNotExist) {
		return errors.New("download destination already exists")
	}
	return os.Rename(path, dest)
}

type cappedBuffer struct {
	bytes.Buffer
	limit int
}

func (b *cappedBuffer) Write(p []byte) (int, error) {
	n := len(p)
	if b.Len() < b.limit {
		_, _ = b.Buffer.Write(p[:min(n, b.limit-b.Len())])
	}
	return n, nil
}

func run(ctx context.Context, executable string, args []string, dir string, watch bool) ([]byte, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	cmd := exec.CommandContext(ctx, executable, args...)
	cmd.Dir = dir
	cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + dir, "XDG_CACHE_HOME=" + dir, "LANG=C.UTF-8", "SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt"}
	cmd.WaitDelay = 3 * time.Second
	containProcess(cmd)
	out := &cappedBuffer{limit: 8 << 20}
	errout := &cappedBuffer{limit: 8192}
	cmd.Stdout, cmd.Stderr = out, errout
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	var limitErr error
	for {
		select {
		case err := <-done:
			if limitErr != nil {
				return nil, limitErr
			}
			if err != nil {
				return nil, fmt.Errorf("%w: %s", err, errout.String())
			}
			if watch {
				if err = checkFiles(dir, MaxBytes); err != nil {
					return nil, err
				}
			}
			return out.Bytes(), nil
		case <-ticker.C:
			if watch && limitErr == nil {
				if err := checkFiles(dir, MaxBytes); err != nil {
					limitErr = err
					cancel()
				}
			}
		}
	}
}

func checkFiles(dir string, limit int64) error {
	var raw, merged, metadata int64
	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return nil
			}
			return err
		}
		if d.IsDir() {
			return nil
		}
		stat, err := d.Info()
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return nil
			}
			return err
		}
		if !stat.Mode().IsRegular() {
			return errors.New("unexpected YouTube download file")
		}
		name := d.Name()
		if strings.HasSuffix(name, ".ytdlp") {
			metadata += stat.Size()
		} else if name == "source.mp4" || name == "source.temp.mp4" {
			merged += stat.Size()
		} else {
			raw += stat.Size()
		}
		if merged > limit || raw > limit || metadata > 1<<20 {
			return errors.New("YouTube video exceeds the 10 GB limit")
		}
		return nil
	})
	return err
}

func downloadError(ctx context.Context, err error) error {
	if ctx.Err() != nil {
		return fmt.Errorf("YouTube download stopped: %w", ctx.Err())
	}
	if strings.Contains(err.Error(), "10 GB") {
		return errors.New("YouTube video exceeds the 10 GB limit")
	}
	// Do not return remote diagnostics, URLs, subprocess paths or request headers.
	return errors.New("YouTube download failed. Use a public, available video or upload the original file")
}
