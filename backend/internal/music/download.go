package music

import (
	"bufio"
	"context"
	"errors"
	"io"
	"mime"
	"os"
	"path/filepath"
)

// Download resolves a known catalogue ID before fetching anything. It writes an
// atomic, size-bounded file and removes partial files after errors/cancellation.
func (c *Catalog) Download(ctx context.Context, id, destination string) (Track, error) {
	track, err := c.Get(ctx, id)
	if err != nil {
		return Track{}, err
	}
	response, err := c.request(ctx, track.PreviewURL)
	if err != nil {
		return Track{}, err
	}
	defer response.Body.Close()
	if response.ContentLength > c.audioLimit {
		return Track{}, errors.New("music audio exceeds size limit")
	}
	mediaType, _, _ := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if mediaType != "audio/mpeg" && mediaType != "audio/mp3" && mediaType != "application/octet-stream" {
		return Track{}, errors.New("music provider returned unsupported audio content")
	}
	reader := bufio.NewReader(io.LimitReader(response.Body, c.audioLimit+1))
	header, err := reader.Peek(3)
	if err != nil || (string(header) != "ID3" && !(header[0] == 0xff && header[1]&0xe0 == 0xe0)) {
		return Track{}, errors.New("music provider returned invalid MP3 audio")
	}
	file, err := os.CreateTemp(filepath.Dir(destination), ".music-*.part")
	if err != nil {
		return Track{}, err
	}
	defer os.Remove(file.Name())
	written, copyErr := io.Copy(file, reader)
	closeErr := file.Close()
	if copyErr != nil {
		return Track{}, copyErr
	}
	if closeErr != nil {
		return Track{}, closeErr
	}
	if written > c.audioLimit {
		return Track{}, errors.New("music audio exceeds size limit")
	}
	if err := ctx.Err(); err != nil {
		return Track{}, err
	}
	if err := os.Rename(file.Name(), destination); err != nil {
		return Track{}, err
	}
	return track, nil
}
