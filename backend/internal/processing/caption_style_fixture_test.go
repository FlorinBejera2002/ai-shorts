package processing

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"sneepcut/backend-go/internal/captions"
)

// ASS fixtures retain typography regression coverage. Production captions are
// submitted as editable Studio layers by studioCaptions.
func (p *Processor) captionFilter(ctx context.Context, dir, user string, s captions.Style, groups [][]Word, w, h int) (string, error) {
	cues := make([]captions.Cue, 0, len(groups))
	for _, group := range groups {
		var words []captions.Word
		for _, word := range group {
			words = append(words, captions.Word{Text: word.Text, Start: word.Start, End: word.End})
		}
		cues = append(cues, captions.Cue{Words: words})
	}
	return p.captionFilterCues(ctx, dir, user, s, cues, w, h)
}
func (p *Processor) captionFilterCues(ctx context.Context, dir, user string, s captions.Style, cues []captions.Cue, w, h int) (string, error) {
	if err := s.Validate(); err != nil {
		return "", err
	}
	fontDir := filepath.Join(dir, "caption-fonts-"+storyDigest([]any{user, s.FontID, s.Weight})[:16])
	if err := os.MkdirAll(fontDir, 0700); err != nil {
		return "", err
	}
	var data []byte
	var err error
	if captions.IsBuiltin(s.FontID) {
		data, err = captions.FontBytes(s.FontID, s.Weight)
	} else {
		var key string
		key, err = captions.PrivateKey(user, s.FontID)
		if err == nil {
			file := filepath.Join(fontDir, "selected.ttf")
			data, err = os.ReadFile(file)
			if os.IsNotExist(err) {
				err = p.materialize(ctx, key, file)
				if err == nil {
					data, err = os.ReadFile(file)
				}
			}
		}
	}
	if err != nil {
		return "", errors.New("Selected caption font is unavailable. Restore the font or choose another font before exporting")
	}
	meta, err := captions.Inspect(data)
	if err != nil {
		return "", err
	}
	if len(meta.Weights) != 1 || meta.Weights[0] != s.Weight {
		return "", errors.New("Selected caption font weight does not match its font asset")
	}
	if err = os.WriteFile(filepath.Join(fontDir, "selected.ttf"), data, 0600); err != nil {
		return "", err
	}
	ass, err := captions.ASSCues(s, data, cues, w, h)
	if err != nil {
		return "", err
	}
	file := filepath.Join(dir, "styled-captions.ass")
	if err = os.WriteFile(file, []byte(ass), 0600); err != nil {
		return "", err
	}
	return fmt.Sprintf("subtitles='%s':fontsdir='%s'", escapeSubtitlePath(file), escapeSubtitlePath(fontDir)), nil
}

func escapeSubtitlePath(path string) string {
	abs, err := filepath.Abs(path)
	if err != nil {
		abs = path
	}
	posix := filepath.ToSlash(abs)
	posix = strings.ReplaceAll(posix, ":", "\\:")
	posix = strings.ReplaceAll(posix, "'", "\\'")
	return posix
}
