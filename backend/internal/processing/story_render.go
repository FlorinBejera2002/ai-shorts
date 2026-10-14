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

const storyRenderVersion = "render-10-continuous-music"

func (p *Processor) RenderStory(ctx context.Context, request story.Request, version story.Version) (story.Output, error) {
	validated, err := validateStoryRender(request, version)
	if err != nil {
		return story.Output{}, err
	}
	bound, err := p.withNativeModels(ctx)
	if err != nil {
		return story.Output{}, err
	}
	p = bound
	faceModelSignature := storyModelSignature(p.cfg.FaceModel)
	dir, err := os.MkdirTemp(p.cfg.TempDir, "story-render-")
	if err != nil {
		return story.Output{}, storyWorkError("render preparation")
	}
	defer os.RemoveAll(dir)
	w, h := validated.width, validated.height
	var parts []string
	elapsed := validated.duration
	captionSelection, err := p.storyCaptions(ctx, dir, request, version)
	if err != nil {
		return story.Output{}, err
	}
	for i, entry := range version.Timeline {
		if validated.narration != nil {
			// Visual cache segments never carry source-video audio or voice slices.
			entry.Audio = nil
		}
		video := validated.assets[entry.Video.SourceID]
		var audio story.Asset
		if entry.Audio != nil {
			audio = validated.assets[entry.Audio.SourceID]
		}
		// Output positions/words are excluded: moving an unchanged source excerpt
		// does not invalidate its expensive crop/encode cache.
		key := "work/" + request.ID + "/segments/" + storyDigest([]any{story.AlgorithmVersion, storyRenderVersion, entry.Video, entry.Audio, entry.Crop, video.Hash, audio.Hash, w, h, faceModelSignature}) + ".mp4"
		part := filepath.Join(dir, fmt.Sprintf("part-%03d.mp4", i))
		if p.materialize(ctx, key, part) != nil {
			if err = p.renderStoryEntry(ctx, dir, part, entry, video, audio, w, h); err != nil {
				return story.Output{}, err
			}
			if err = p.storySave(ctx, part, key, "video/mp4"); err != nil {
				return story.Output{}, err
			}
		}
		parts = append(parts, part)
	}
	// Audio is concatenated independently on the exact sample clock. Video
	// boundaries round on the GLOBAL frame clock, never once per duration:
	// summing rounded clip lengths accumulates drift at natural phrase cuts.
	var args, filters []string
	var videoInputs, audioInputs strings.Builder
	videoCount := 0
	for i, file := range parts {
		args = append(args, "-threads", "1", "-i", file)
		entry := version.Timeline[i]
		duration := entry.OutputOut - entry.OutputIn
		firstFrame, lastFrame := int(math.Round(entry.OutputIn*30)), int(math.Round(entry.OutputOut*30))
		if i == len(parts)-1 {
			lastFrame = max(1, lastFrame)
		}
		if frames := lastFrame - firstFrame; frames > 0 {
			// A single boundary frame may be held/dropped to hit the global
			// clock. All other source frames keep 1x playback; no time stretch.
			filters = append(filters, fmt.Sprintf("[%d:v]tpad=stop_mode=clone:stop_duration=0.034,trim=end_frame=%d,setpts=PTS-STARTPTS[v%d]", i, frames, i))
			fmt.Fprintf(&videoInputs, "[v%d]", i)
			videoCount++
		}
		if validated.narration == nil {
			filters = append(filters, fmt.Sprintf("[%d:a]atrim=duration=%s,asetpts=PTS-STARTPTS[a%d]", i, seconds(duration), i))
			fmt.Fprintf(&audioInputs, "[a%d]", i)
		}
	}
	captions := len(captionSelection.Groups) > 0
	videoLabel := "v"
	if captions || request.LogoKey != "" || request.Music != nil {
		videoLabel = "joined"
	}
	filters = append(filters, fmt.Sprintf("%sconcat=n=%d:v=1:a=0[%s]", videoInputs.String(), videoCount, videoLabel))
	nextInput := len(parts)
	if validated.narration != nil {
		voice, err := p.storyMaterialize(ctx, dir, validated.narration.Key)
		if err != nil {
			return story.Output{}, errors.New("original narration is unavailable")
		}
		args = append(args, "-i", voice)
		// Encode the complete original voice exactly once. Visual boundaries
		// cannot cut/repeat syllables or accumulate per-segment AAC padding.
		filters = append(filters, fmt.Sprintf("[%d:a]aresample=48000:async=1:first_pts=0,atrim=duration=%s,asetpts=PTS-STARTPTS[a]", nextInput, seconds(elapsed)))
		nextInput++
	} else {
		filters = append(filters, fmt.Sprintf("%sconcat=n=%d:v=0:a=1[a]", audioInputs.String(), len(parts)))
	}
	audioLabel := "a"
	if request.Music != nil {
		musicFile, err := p.storyMaterialize(ctx, dir, request.Music.Key)
		if err != nil {
			return story.Output{}, errors.New("selected music is unavailable for rendering")
		}
		args = append(args, "-stream_loop", "-1", "-i", musicFile)
		filters = append(filters, storyMusicMixFilters(nextInput, elapsed, request.Options.Music.Volume)...)
		nextInput++
		audioLabel = "mixed"
	}
	if captions {
		srt := filepath.Join(dir, "captions.srt")
		if writeStorySRT(srt, captionSelection.Groups, elapsed) != nil {
			return story.Output{}, storyWorkError("captions")
		}
		preset := subtitlePreset("clean")
		if request.Options.SubtitleColor != "" {
			preset["font_color"] = request.Options.SubtitleColor
		}
		if request.Options.SubtitleFont != "" {
			preset["font_name"] = request.Options.SubtitleFont
		}
		if request.Options.SubtitleSize != 0 {
			preset["fontsize"] = request.Options.SubtitleSize
		}
		switch request.Options.SubtitlePosition {
		case "top":
			preset["alignment"] = 8
		case "center":
			preset["alignment"] = 5
		case "bottom":
			preset["alignment"] = 2
		}
		// SRT otherwise inherits libass's landscape 384x288 script canvas:
		// portrait video scales its font and 80-unit margin into the middle of
		// the picture. Use the output canvas and a short-edge font scale.
		fontSize := int(math.Round(float64(preset["fontsize"].(int)) * float64(min(w, h)) / 360))
		outline := max(1, preset["border_width"].(int)*min(w, h)/720)
		style := fmt.Sprintf("PlayResX=%d,PlayResY=%d,Alignment=%d,Fontname=%s,Fontsize=%d,PrimaryColour=%s,OutlineColour=%s,BorderStyle=1,Outline=%d,Shadow=0,MarginL=%d,MarginR=%d,MarginV=%d,Bold=1", w, h, preset["alignment"], preset["font_name"], fontSize, hexToASSColor(preset["font_color"].(string), 1), hexToASSColor(preset["border_color"].(string), 1), outline, w*6/100, w*6/100, h*6/100)
		videoLabel = "v"
		if request.LogoKey != "" || request.Music != nil {
			videoLabel = "captioned"
		}
		filters = append(filters, fmt.Sprintf("[joined]subtitles='%s':force_style='%s'[%s]", escapeSubtitlePath(srt), style, videoLabel))
	}
	if request.LogoKey != "" {
		overlay := filepath.Join(dir, "brand-overlay.png")
		brand := map[string]any{"logo_key": request.LogoKey, "user_id": request.UserID, "watermark_position": request.Options.LogoPosition}
		if request.Options.LogoOpacity != nil {
			brand["watermark_opacity"] = *request.Options.LogoOpacity
		}
		if err = p.buildOverlay(ctx, dir, overlay, w, h, brand, "", true, false, false); err != nil {
			return story.Output{}, storyWorkError("logo overlay")
		}
		args = append(args, "-i", overlay)
		logoLabel := "v"
		if request.Music != nil {
			logoLabel = "branded"
		}
		filters = append(filters, fmt.Sprintf("[%s][%d:v]overlay=0:0:eof_action=repeat:format=auto[%s]", videoLabel, nextInput, logoLabel))
		videoLabel = logoLabel
	}
	if request.Music != nil {
		credit := filepath.Join(dir, "music-credit.ass")
		if err := writeStoryMusicCredit(credit, request, w, h, elapsed); err != nil {
			return story.Output{}, storyWorkError("music attribution")
		}
		filters = append(filters, fmt.Sprintf("[%s]subtitles='%s'[v]", videoLabel, escapeSubtitlePath(credit)))
	}
	output := filepath.Join(dir, "story.mp4")
	args = append(args, "-filter_complex", strings.Join(filters, ";"), "-map", "[v]", "-map", "["+audioLabel+"]")
	args = append(args, delivery...)
	if request.Music != nil {
		args = append(args, "-metadata", "copyright="+request.Music.Track.Attribution, "-metadata", "comment="+request.Music.Track.Attribution+" Music trimmed, looped and mixed with original source audio.")
	}
	args = append(args, "-t", seconds(elapsed), output)
	if p.ffmpeg(ctx, dir, args...) != nil {
		return story.Output{}, storyWorkError("assembly")
	}
	info, err := p.probe(ctx, output)
	if err != nil || math.Abs(info.Duration-elapsed) > .12 {
		return story.Output{}, errors.New("rendered story duration does not match its timeline")
	}
	stat, err := os.Stat(output)
	if err != nil {
		return story.Output{}, storyWorkError("output verification")
	}
	prefix := "clips/" + request.ID + "/story/" + storyDigest([]any{story.AlgorithmVersion, "output-7", storyRenderVersion, version.Timeline, request.Options, request.LogoKey, version.Number, captionSelection.IDs, captionSelection.Warnings, faceModelSignature})
	result := story.Output{Key: prefix + "/story.mp4", Duration: info.Duration, Size: stat.Size(), Resolution: fmt.Sprintf("%dx%d", info.Width, info.Height), Captions: captions,
		CaptionMode: story.EffectiveCaptionMode(request.Options), CaptionWarnings: captionSelection.Warnings, CaptionedCandidateIDs: captionSelection.IDs}
	result.Music = storyMusicCredit(request, version)
	if err = p.storySave(ctx, output, result.Key, "video/mp4"); err != nil {
		return story.Output{}, err
	}
	thumb := filepath.Join(dir, "thumbnail.jpg")
	if p.ffmpeg(ctx, dir, "-i", output, "-ss", seconds(min(.25, elapsed/2)), "-frames:v", "1", "-vf", "scale=320:-2", "-q:v", "2", thumb) == nil {
		result.ThumbnailKey = prefix + "/thumbnail.jpg"
		if err = p.storySave(ctx, thumb, result.ThumbnailKey, "image/jpeg"); err != nil {
			return story.Output{}, err
		}
	}
	return result, nil
}

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
	if !storyNamespace(request.ID) || len(version.Timeline) == 0 || len(version.Timeline) > 100 {
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

func (p *Processor) renderStoryEntry(ctx context.Context, dir, output string, entry story.Entry, video, audio story.Asset, w, h int) error {
	videoFile, err := p.storyMaterialize(ctx, dir, video.Key)
	// The original is the rendering source; proxies are analysis previews only.
	if err != nil {
		return errors.New("story video source is unavailable")
	}
	duration := entry.OutputOut - entry.OutputIn
	args := []string{"-ss", seconds(entry.Video.In), "-i", videoFile}
	if entry.Audio != nil {
		audioFile, err := p.storyMaterialize(ctx, dir, audio.Key)
		if err != nil {
			return errors.New("story audio source is unavailable")
		}
		args = append(args, "-ss", seconds(entry.Audio.In), "-i", audioFile)
	} else {
		args = append(args, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo")
	}
	crop := ""
	if entry.Crop == "track" {
		crop = p.storyStableCrop(ctx, dir, videoFile, entry.Video, video, w, h)
	}
	fit := storyFramingFilter(w, h, crop)
	// Retain the original dynamics. Independently loudness-normalizing every
	// phrase boosted quiet ambience and changed expressive pauses at each cut.
	// Resampling only aligns technical timestamps; it does not change speed.
	filter := fmt.Sprintf("[0:v]fps=30:start_time=0,trim=duration=%s,setpts=PTS-STARTPTS,%s,format=yuv420p[v];[1:a]aresample=48000:async=1:first_pts=0,atrim=duration=%s,asetpts=PTS-STARTPTS,apad,atrim=duration=%s[a]", seconds(duration), fit, seconds(duration), seconds(duration))
	args = append(args, "-filter_complex", filter, "-map", "[v]", "-map", "[a]")
	args = append(args, delivery...)
	args = append(args, "-ac", "2", "-t", seconds(duration), output)
	if p.ffmpeg(ctx, dir, args...) != nil {
		return storyWorkError("segment render")
	}
	return nil
}

func storyFramingFilter(w, h int, stableCrop string) string {
	// Scale both small and large originals to the output bounds. Fit retains
	// the whole image; an already verified stable crop fills the canvas. The
	// final crop only removes even-pixel rounding at the target aspect ratio.
	if stableCrop != "" {
		return fmt.Sprintf("%s,scale=w=%d:h=%d:force_original_aspect_ratio=increase:force_divisible_by=2,crop=%d:%d,setsar=1", stableCrop, w, h, w, h)
	}
	// Convert the display aspect to square pixels before fitting. Merely using
	// setsar=1 after fitting by encoded dimensions stretches anamorphic footage.
	return fmt.Sprintf("%s,scale=w=%d:h=%d:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=%d:%d:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1", storySquarePixelsFilter, w, h, w, h)
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
