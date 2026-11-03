package processing

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const maximumSourceBytes int64 = 5 << 30

// youtubeFormat prefers H.264/M4A up to 1080p (cheap to decode while
// rendering) and falls back to any merged or combined stream.
const youtubeFormat = "bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b"

func copyBounded(source io.Reader, dest string) error {
	f, e := os.OpenFile(dest, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if e != nil {
		return e
	}
	n, e := io.Copy(f, io.LimitReader(source, maximumSourceBytes+1))
	closeErr := f.Close()
	if e != nil {
		return e
	}
	if n > maximumSourceBytes {
		return fmt.Errorf("source exceeds 5 GiB limit")
	}
	return closeErr
}

func (p *Processor) materialize(ctx context.Context, key, dest string) error {
	if local, ok := p.storage.(interface{ Path(string) (string, error) }); ok {
		path, e := local.Path(key)
		if e != nil {
			return e
		}
		f, e := os.Open(path)
		if e != nil {
			return e
		}
		defer f.Close()
		return copyBounded(f, dest)
	}
	address, e := p.storage.SignedURL(ctx, key, time.Hour)
	if e != nil {
		return e
	}
	req, e := http.NewRequestWithContext(ctx, "GET", address, nil)
	if e != nil {
		return e
	}
	client := http.Client{Timeout: time.Hour}
	response, e := client.Do(req)
	if e != nil {
		return e
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return fmt.Errorf("storage download status %d", response.StatusCode)
	}
	return copyBounded(response.Body, dest)
}

func youtubeURL(raw string) bool {
	u, e := url.Parse(raw)
	if e != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" {
		return false
	}
	switch strings.ToLower(u.Hostname()) {
	case "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be":
		return true
	}
	return false
}

// download fetches a YouTube source with yt-dlp, which keeps up with YouTube's
// player changes; dest's directory is the job's private temp directory.
func (p *Processor) download(ctx context.Context, address, dest string) error {
	if !youtubeURL(address) {
		return fmt.Errorf("only HTTPS YouTube source URLs are supported")
	}
	dir := filepath.Dir(dest)
	args := []string{
		"--ignore-config", "--no-playlist", "--no-cache-dir", "--no-progress", "--quiet", "--no-warnings",
		"--max-filesize", "5G", "--format", youtubeFormat, "--merge-output-format", "mp4", "--remux-video", "mp4",
		"--paths", "temp:" + dir, "--output", dest,
	}
	if p.cfg.YouTubeCookiesFile != "" {
		// yt-dlp rewrites its cookie jar, so give it a private copy.
		cookies := filepath.Join(dir, "youtube-cookies.txt")
		source, e := os.Open(p.cfg.YouTubeCookiesFile)
		if e != nil {
			return fmt.Errorf("YouTube cookies: %w", e)
		}
		e = copyBounded(source, cookies)
		source.Close()
		if e != nil {
			return fmt.Errorf("YouTube cookies: %w", e)
		}
		args = append(args, "--cookies", cookies)
	}
	if p.cfg.YouTubeProxy != "" {
		args = append(args, "--proxy", p.cfg.YouTubeProxy)
	}
	args = append(args, "--", address)
	if _, e := run(ctx, dir, p.cfg.YtDlpPath, args...); e != nil {
		return fmt.Errorf("YouTube download: %w", e)
	}
	info, e := os.Stat(dest)
	if e != nil {
		return fmt.Errorf("YouTube download produced no video: %w", e)
	}
	if info.Size() > maximumSourceBytes {
		return fmt.Errorf("source exceeds 5 GiB limit")
	}
	return nil
}
