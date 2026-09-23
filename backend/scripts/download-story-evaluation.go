// Download only the two explicitly licensed creator publications used by the
// local evaluation harness. It uses the same public stream client as ingestion.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	youtube "github.com/kkdai/youtube/v2"
)

func main() {
	if err := download(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func download() error {
	if len(os.Args) != 3 {
		return fmt.Errorf("usage: go run ./scripts/download-story-evaluation.go source-id destination (from backend directory)")
	}
	publications := map[string]string{"ro-raluca": "https://www.youtube.com/watch?v=6TiSKGRjYLs", "en-jane-goodall": "https://www.youtube.com/watch?v=AOHoAi6qN14"}
	address, ok := publications[os.Args[1]]
	if !ok {
		return fmt.Errorf("unsupported evaluation source")
	}
	backend, err := os.Getwd()
	if err != nil {
		return err
	}
	root := filepath.Join(filepath.Dir(backend), ".cache", "story-evaluation", "originals")
	destination, err := filepath.Abs(os.Args[2])
	if err != nil {
		return err
	}
	if !strings.HasPrefix(destination, root+string(filepath.Separator)) {
		return fmt.Errorf("destination must remain under repository .cache/story-evaluation/originals")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	client := youtube.Client{HTTPClient: &http.Client{Timeout: 3 * time.Minute}}
	video, err := client.GetVideoContext(ctx, address)
	if err != nil {
		return fmt.Errorf("public creator recording metadata unavailable: %w", err)
	}
	for _, format := range video.Formats.WithAudioChannels() {
		if format.Width == 0 || format.Height > 720 || !strings.Contains(format.MimeType, "video/mp4") {
			continue
		}
		stream, _, err := client.GetStreamContext(ctx, video, &format)
		if err != nil {
			return fmt.Errorf("public creator stream unavailable: %w", err)
		}
		defer stream.Close()
		file, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			return err
		}
		const maximumBytes = 100 << 20
		n, copyErr := io.Copy(file, io.LimitReader(stream, maximumBytes+1))
		closeErr := file.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
		if n > maximumBytes {
			return fmt.Errorf("creator recording exceeds 100 MiB")
		}
		return json.NewEncoder(os.Stdout).Encode(map[string]any{"source_id": os.Args[1], "source_url": address, "bytes": n, "itag": format.ItagNo, "reused": false})
	}
	return fmt.Errorf("creator recording has no public combined MP4 format within 720p")
}
