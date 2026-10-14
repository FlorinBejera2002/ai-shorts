package processing

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sneepcut/backend-go/internal/captions"
	"strings"
)

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
func (p *Processor) burnCaptionStyle(ctx context.Context, dir, video, output string, words []Word, phrases []captions.Cue, brand map[string]any) (bool, error) {
	if !brandBool(brand, "apply_brand") || brand["caption_style"] == nil {
		return false, nil
	}
	style, err := captions.Decode(brand["caption_style"])
	if err != nil {
		return true, err
	}
	info, err := p.probe(ctx, video)
	if err != nil {
		return true, err
	}
	var filter string
	if len(words) > 0 {
		filter, err = p.captionFilter(ctx, dir, brandString(brand, "user_id"), *style, [][]Word{words}, info.Width, info.Height)
	} else {
		filter, err = p.captionFilterCues(ctx, dir, brandString(brand, "user_id"), *style, phrases, info.Width, info.Height)
	}
	if err != nil {
		return true, err
	}
	args := []string{"-i", video, "-vf", filter}
	args = append(args, delivery...)
	args = append(args, output)
	return true, p.ffmpeg(ctx, dir, args...)
}

// RemapCaptionPhrases is a static fallback from measured transcript segments.
// A cut through a phrase cannot safely caption its complete text, so it is withheld.
// Word animation remains disabled: no word-level alignment is synthesized.
func RemapCaptionPhrases(phrases []TranscriptSegment, segments []Segment, transition string, overlap float64) []captions.Cue {
	var cues []captions.Cue
	for _, phrase := range phrases {
		if strings.TrimSpace(phrase.Text) == "" || phrase.End <= phrase.Start || math.IsNaN(phrase.Start) || math.IsNaN(phrase.End) || math.IsInf(phrase.Start, 0) || math.IsInf(phrase.End, 0) {
			continue
		}
		for _, mapped := range RemapWords([]Word{{Text: phrase.Text, Start: phrase.Start, End: phrase.End}}, segments, transition, overlap) {
			if math.Abs((mapped.End-mapped.Start)-(phrase.End-phrase.Start)) > .002 {
				continue
			}
			cues = append(cues, captions.Cue{Text: phrase.Text, Start: mapped.Start, End: mapped.End})
		}
	}
	return cues
}
func writePhraseSRT(file string, phrases []captions.Cue) error {
	var output strings.Builder
	clean := strings.NewReplacer("\r", " ", "\n", " ", "<", "", ">", "")
	for i, cue := range phrases {
		fmt.Fprintf(&output, "%d\n%s --> %s\n%s\n\n", i+1, subtitleTime(cue.Start), subtitleTime(cue.End), clean.Replace(cue.Text))
	}
	return os.WriteFile(file, []byte(output.String()), 0600)
}

// Silence in a selected cut is not an alignment error merely because another
// part of the source has a transcript. Only selected text needs timing recovery.
func captionTimingUnavailable(transcript Transcript, segments []Segment) bool {
	if len(transcript.Segments) == 0 && len(transcript.Words) == 0 {
		return strings.TrimSpace(transcript.Text) != ""
	}
	for _, clip := range segments {
		for _, phrase := range transcript.Segments {
			if strings.TrimSpace(phrase.Text) != "" && phrase.Start < clip.End && phrase.End > clip.Start {
				return true
			}
		}
		for _, word := range transcript.Words {
			if strings.TrimSpace(word.Text) != "" && word.Start >= clip.Start && word.Start < clip.End && word.End <= word.Start {
				return true
			}
		}
	}
	return false
}
