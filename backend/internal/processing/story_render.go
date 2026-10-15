package processing

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"

	"sneepcut/backend-go/internal/story"
)

type storyRenderValidation struct {
	assets        map[string]story.Asset
	words         []Word
	duration      float64
	width, height int
	narration     *story.Asset
}

// Validate the complete EDL before workspace creation, source/cache reads or
// native processing. A malformed later entry must never render earlier entries.
func validateStoryRender(request story.Request, version story.Version) (storyRenderValidation, error) {
	result := storyRenderValidation{assets: make(map[string]story.Asset, len(request.Assets))}
	if request.Options.DynamicRange != "" && request.Options.DynamicRange != "sdr" && request.Options.DynamicRange != "hdr" {
		return result, errors.New("unsupported story dynamic range")
	}
	if request.Options.Music != nil && (request.Music == nil || request.Options.Music.TrackID != request.Music.Track.ID) {
		return result, errors.New("selected music must be prepared before rendering")
	}
	if request.Music != nil && (request.Options.Music == nil || !finite(request.Options.Music.Volume) || request.Options.Music.Volume < 0 || request.Options.Music.Volume > 1 || !strings.HasPrefix(request.Music.Key, "music/incompetech/") || strings.Contains(request.Music.Key, "..") || strings.ContainsAny(request.Music.Key, "\\\x00")) {
		return result, errors.New("invalid prepared music")
	}
	if err := story.ValidateBrandOptions(request.Options); err != nil {
		return result, err
	}
	switch story.EffectiveCaptionMode(request.Options) {
	case "all", "selective", "off":
	default:
		return result, errors.New("unsupported story caption mode")
	}
	if request.Options.LogoResourceID != "" && request.LogoKey == "" {
		return result, errors.New("story logo resource is unresolved")
	}
	if request.LogoKey != "" && (request.UserID == "" || !strings.HasPrefix(request.LogoKey, "brand/"+request.UserID+"/") || strings.Contains(request.LogoKey, "..") || strings.ContainsAny(request.LogoKey, "\\\x00")) {
		return result, errors.New("story logo must belong to its owner")
	}
	if !storyNamespace(request.ID) || len(version.Timeline) == 0 {
		return result, errors.New("invalid story timeline")
	}
	var err error
	result.width, result.height, err = dimensions(1080, 1920, request.Options.AspectRatio)
	if err != nil {
		return result, errors.New("unsupported story aspect ratio")
	}
	for _, asset := range request.Assets {
		if _, duplicate := result.assets[asset.ID]; duplicate || !storyNamespace(asset.ID) {
			return result, errors.New("story source identity is invalid or duplicated")
		}
		result.assets[asset.ID] = asset
		if asset.Kind == "narration" {
			if !request.Options.Narration || result.narration != nil || !asset.HasAudio || !finite(asset.Duration) || asset.Duration <= 0 || asset.Duration > story.MaxNarrationSeconds {
				return result, errors.New("story requires one valid continuous narration source")
			}
			voice := asset
			result.narration = &voice
		}
	}
	if request.Options.Narration && result.narration == nil {
		return result, errors.New("story narration source is missing")
	}
	for _, entry := range version.Timeline {
		duration := entry.OutputOut - entry.OutputIn
		if !finite(entry.OutputIn) || !finite(entry.OutputOut) || entry.OutputIn < 0 || !finite(duration) || duration <= 0 || math.Abs(entry.OutputIn-result.duration) > .002 {
			return result, errors.New("story timeline contains a gap or invalid duration")
		}
		if entry.OutputOut > 600 {
			return result, errors.New("story exceeds the supported output duration")
		}
		video, ok := result.assets[entry.Video.SourceID]
		if !ok || video.Kind == "narration" || !storyIntervalValid(entry.Video, video, duration) {
			return result, errors.New("story video interval is outside its source")
		}
		if entry.Audio != nil {
			audio, ok := result.assets[entry.Audio.SourceID]
			if !ok || !audio.HasAudio || !storyIntervalValid(*entry.Audio, audio, duration) {
				return result, errors.New("story audio interval is outside its source")
			}
		}
		if result.narration != nil && (entry.Audio == nil || entry.Audio.SourceID != result.narration.ID || math.Abs(entry.Audio.In-entry.OutputIn) > .002 || math.Abs(entry.Audio.Out-entry.OutputOut) > .002) {
			return result, errors.New("narration must remain continuous with its original clock")
		}
		for _, word := range entry.Words {
			last := entry.OutputOut
			if result.narration != nil {
				last = result.narration.Duration
			}
			if !finite(word.Start) || !finite(word.End) || word.Start < entry.OutputIn-.002 || word.Start >= entry.OutputOut+.002 || word.End > last+.002 || word.End <= word.Start || entry.Audio == nil {
				return result, errors.New("story captions do not match the audio timeline")
			}
			result.words = append(result.words, Word{Text: word.Text, Start: word.Start, End: word.End})
		}
		result.duration = entry.OutputOut
	}
	if result.narration != nil {
		if math.Abs(result.duration-result.narration.Duration) > .002 {
			return result, errors.New("story must retain the full original narration duration")
		}
		var expected []story.Word
		for _, candidate := range result.narration.Candidates {
			expected = append(expected, candidate.Words...)
		}
		if len(expected) != len(result.words) {
			return result, errors.New("narration captions must retain all original aligned words")
		}
		for i, word := range expected {
			if word.Text != result.words[i].Text || math.Abs(word.Start-result.words[i].Start) > .002 || math.Abs(word.End-result.words[i].End) > .002 {
				return result, errors.New("narration captions must retain the original words and clock")
			}
		}
	}
	return result, nil
}

func storyIntervalValid(interval story.Interval, asset story.Asset, duration float64) bool {
	return finite(asset.Duration) && asset.Duration > 0 && finite(interval.In) && finite(interval.Out) && interval.In >= 0 && interval.Out > interval.In && interval.Out <= asset.Duration+.002 && math.Abs(interval.Out-interval.In-duration) < .002
}

const storySquarePixelsFilter = "scale=w='max(2,trunc(iw*sar/2)*2)':h=ih,setsar=1"

func storyModelSignature(file string) string {
	info, err := os.Stat(file)
	if err != nil {
		return "unavailable"
	}
	return fmt.Sprintf("%s:%d:%d", file, info.Size(), info.ModTime().UnixNano())
}

func (p *Processor) storyMaterialize(ctx context.Context, dir, key string) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if local, ok := p.storage.(interface{ Path(string) (string, error) }); ok {
		file, err := local.Path(key)
		if err != nil {
			return "", err
		}
		info, err := os.Stat(file)
		if err != nil || !info.Mode().IsRegular() {
			return "", errors.New("source is not a regular media file")
		}
		return file, nil
	}
	file := filepath.Join(dir, "source-"+storyDigest(key))
	if _, err := os.Stat(file); err == nil {
		return file, nil
	}
	if err := p.materialize(ctx, key, file); err != nil {
		_ = os.Remove(file)
		return "", err
	}
	return file, nil
}
