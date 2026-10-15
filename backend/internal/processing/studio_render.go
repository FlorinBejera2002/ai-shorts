package processing

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"

	"sneepcut/backend-go/internal/audiocleanup"
	"sneepcut/backend-go/internal/captions"
	"sneepcut/backend-go/internal/story"
	"sneepcut/backend-go/internal/studiocomposition"
)

func (p *Processor) render(ctx context.Context, in RenderInput) (Clip, error) {
	ctx, cancel := context.WithTimeout(ctx, p.cfg.Timeout)
	defer cancel()
	clip := Clip{Metadata: map[string]any{}, Segments: in.Segments, Transition: in.Transition, TransitionDuration: in.TransitionDuration}
	if len(in.Segments) == 0 {
		return clip, errors.New("render requires at least one segment")
	}
	bound, err := p.withNativeModels(ctx)
	if err != nil {
		return clip, err
	}
	p = bound
	if !namespacePattern.MatchString(in.Namespace) {
		return clip, errors.New("invalid rendering namespace")
	}
	client, err := p.studioClient(in.UserID)
	if err != nil {
		return clip, err
	}
	dir, err := os.MkdirTemp(p.cfg.TempDir, "clip-studio-")
	if err != nil {
		return clip, err
	}
	defer os.RemoveAll(dir)
	if in.StudioTrim && in.StudioArtifactID != "" {
		return p.studioTrim(ctx, dir, in, client)
	}
	source, err := p.storyMaterialize(ctx, dir, in.SourceKey)
	if err != nil {
		return clip, err
	}
	info, err := p.probe(ctx, source)
	if err != nil {
		return clip, err
	}
	for _, s := range in.Segments {
		if !finite(s.Start) || !finite(s.End) || s.Start < 0 || s.End <= s.Start || s.End > info.Duration+.002 {
			return clip, errors.New("clip interval is outside its original source")
		}
	}
	audioKey := in.SourceKey
	if audiocleanup.Enabled(in.AudioCleanup) && info.Audio {
		_, prepared, e := p.prepareRenderAudio(ctx, dir, source, in, info.Duration)
		if e != nil {
			return clip, e
		}
		in.PreparedAudio = prepared
		audioKey = prepared.Key
		clip.Metadata["audio_cleanup"] = prepared
	}
	faceSignature := ""
	var decisions []BoundaryDecision
	if in.SmartCrop && !in.PreserveGeometry && in.AspectRatio == "9:16" {
		faceSignature = storyModelSignature(p.cfg.FaceModel)
		clip.Metadata["face_model_signature"] = faceSignature
	}
	if in.NaturalTransitions {
		recipe := in
		recipe.Reuse, recipe.PreviousDecisions = nil, nil
		in.Segments, decisions, err = p.analyzeNaturalCuts(ctx, source, in, info)
		if err != nil {
			return clip, err
		}
		in.Transition, in.TransitionDuration = "cut", 0
		clip.Transition, clip.TransitionDuration = "cut", 0
		clip.Metadata["transition_decisions"] = decisions
		clip.Metadata["transition_state"] = TransitionState{Recipe: recipe, Decisions: decisions, FaceModelSignature: faceSignature}
		if in.StudioArtifactID == "" && in.Reuse != nil && in.Reuse.StudioArtifactID != "" && canReuseNaturalClip(in, decisions, faceSignature) {
			previous := *in.Reuse
			previous.Metadata = clip.Metadata
			return previous, nil
		}
	}
	clip.Segments = in.Segments
	clip.Start = in.Segments[0].Start
	clip.End = in.Segments[len(in.Segments)-1].End
	w, h := info.Width, info.Height
	if !in.PreserveGeometry {
		w, h, err = dimensions(info.Width, info.Height, in.AspectRatio)
		if err != nil {
			return clip, err
		}
	}
	plan := studioPlan{SchemaVersion: 1, Title: "Clip", Width: w, Height: h, Duration: clipDuration(in.Segments, in.Transition, in.TransitionDuration), DynamicRange: "sdr", Assets: []studioAsset{}, Scenes: []studioScene{}, Audio: []studioAudio{}}
	videoID, err := p.studioAsset(ctx, &plan, in.SourceKey, "video")
	if err != nil {
		return clip, err
	}
	plan.Assets[0].Duration, plan.Assets[0].Width, plan.Assets[0].Height, plan.Assets[0].HasAudio = info.Duration, info.Width, info.Height, info.Audio
	if details, e := p.probeStory(ctx, source); e == nil && studioNeedsPreview(details.VideoCodec, details.AudioCodec, details.ColorTransfer, details.Audio) {
		previewAsset := story.Asset{ID: "source", Key: in.SourceKey, Hash: storyDigest(in.SourceKey), Duration: info.Duration, Width: info.Width, Height: info.Height, ColorTransfer: details.ColorTransfer}
		if _, e = p.prepareStoryProxy(ctx, dir, strings.Split(in.Namespace, "/")[0], &previewAsset, story.Options{}); e != nil {
			return clip, e
		}
		plan.Assets[0].PreviewURL, e = p.studioURL(ctx, previewAsset.ProxyKey)
		if e != nil {
			return clip, e
		}
	}
	audioID := ""
	if info.Audio {
		kind := "audio"
		if audioKey == in.SourceKey {
			kind = "video"
		}
		audioID, err = p.studioAsset(ctx, &plan, audioKey, kind)
		if err != nil {
			return clip, err
		}
		studioAudioMetadata(&plan, audioID, info.Duration)
	}
	var cropFrames []studioCropFrame
	if in.SmartCrop && !in.PreserveGeometry && in.AspectRatio == "9:16" {
		cropFrames, err = p.studioTracking(ctx, dir, source, info)
		if err != nil && ctx.Err() != nil {
			return clip, ctx.Err()
		}
		clip.Metadata["transition_reframing"] = err == nil
	}
	overlaps := make([]float64, max(0, len(in.Segments)-1))
	if in.Transition != "" && in.Transition != "cut" {
		if in.Transition != "fade" && in.Transition != "dissolve" {
			return clip, errors.New("unsupported Studio transition")
		}
		overlaps = transitionOverlaps(in.Segments, in.TransitionDuration)
	}
	elapsed := 0.0
	for i, s := range in.Segments {
		duration := s.End - s.Start
		scene := studioScene{ID: fmt.Sprintf("scene-%d", i+1), AssetID: videoID, Start: studioRound(elapsed), Duration: duration, SourceIn: s.Start, Fit: "cover"}
		if in.PreserveGeometry {
			scene.Fit = "contain"
		}
		if len(cropFrames) > 0 {
			scene.Crop, scene.CropKeyframes = studioWindowCrop(cropFrames, s)
		}
		if i > 0 && overlaps[i-1] > 0 {
			scene.FadeIn = overlaps[i-1]
		}
		plan.Scenes = append(plan.Scenes, scene)
		if audioID != "" {
			audio := studioAudio{ID: fmt.Sprintf("audio-%d", i+1), AssetID: audioID, Start: scene.Start, Duration: duration, SourceIn: s.Start, Volume: 1, SceneID: scene.ID}
			if i > 0 && overlaps[i-1] > 0 {
				audio.Envelope = append(audio.Envelope, studioPoint{0, 0}, studioPoint{overlaps[i-1], 1})
			}
			if i < len(overlaps) && overlaps[i] > 0 {
				audio.Envelope = append(audio.Envelope, studioPoint{duration - overlaps[i], 1}, studioPoint{duration, 0})
			}
			audio.Envelope = studioUniquePoints(audio.Envelope)
			plan.Audio = append(plan.Audio, audio)
		}
		elapsed += duration
		if i < len(overlaps) {
			elapsed -= overlaps[i]
		}
	}
	if in.NaturalTransitions {
		if err = p.studioNaturalBridges(ctx, dir, source, in, &plan, decisions); err != nil {
			return clip, err
		}
	}
	if in.BurnSubtitles && in.SubtitleStyle != "none" {
		words := RemapWords(in.Transcript.Words, in.Segments, in.Transition, in.TransitionDuration)
		groups := [][]Word{}
		if len(words) > 0 {
			groups = append(groups, words)
		} else {
			for _, cue := range RemapCaptionPhrases(in.Transcript.Segments, in.Segments, in.Transition, in.TransitionDuration) {
				groups = append(groups, []Word{{Text: cue.Text, Start: cue.Start, End: cue.End}})
			}
			if len(groups) > 0 {
				clip.Metadata["caption_timing"] = "phrase_fallback"
			}
		}
		if len(groups) == 0 && captionTimingUnavailable(in.Transcript, in.Segments) {
			return clip, errors.New("Caption timing is unavailable for the selected footage. Retry transcription or turn off captions")
		}
		style := studioLegacyStyle(nil, in.SubtitleStyle)
		if brandBool(in.Brand, "apply_brand") {
			style = studioLegacyStyle(in.Brand, in.SubtitleStyle)
			if in.Brand["caption_style"] != nil {
				selected, e := captions.Decode(in.Brand["caption_style"])
				if e != nil {
					return clip, e
				}
				style = *selected
			}
		}
		if err = p.studioCaptions(ctx, dir, in.UserID, in.Namespace, &plan, groups, style); err != nil {
			return clip, err
		}
		clip.HasSubtitles = len(groups) > 0
	}
	if !in.PreserveGeometry {
		if brandBool(in.Brand, "apply_brand") && brandString(in.Brand, "logo_key") != "" && in.Brand["watermark_enabled"] != false {
			if err = p.studioLogo(ctx, dir, &plan, brandString(in.Brand, "logo_key"), in.Brand); err != nil {
				return clip, err
			}
		}
		if brandBool(in.Brand, "apply_brand") && brandBool(in.Brand, "apply_brand_colors") && in.HookText != "" && brandString(in.Brand, "primary_color") != "" && brandString(in.Brand, "secondary_color") != "" {
			plan.Overlays = append(plan.Overlays, studioOverlay{ID: "brand-hook", Text: in.HookText, Duration: plan.Duration, X: float64(w) * .08, Y: float64(h) * .25, Width: float64(w) * .84, Height: float64(h) * .18, Opacity: 1, FontSize: float64(w) * .04, Color: "#FFFFFF", Background: brandString(in.Brand, "primary_color"), Align: "left"})
		}
		clip.ContainsPlatformBadge = in.Brand != nil && !brandBool(in.Brand, "hide_platform_badge")
		if clip.ContainsPlatformBadge {
			margin := float64(min(w, h)) * .025
			plan.Overlays = append(plan.Overlays, studioOverlay{ID: "platform-badge", Text: "sneepcut", Duration: plan.Duration, X: margin, Y: margin, Width: float64(w) * .3, Height: float64(h) * .05, Opacity: .82, FontSize: max(10, float64(w)*.025), Color: "#FFFFFF", Align: "left"})
		}
	}
	id := studioPlanIdentity(in.UserID, in.Namespace+"/operation/"+in.StudioOperationID+"/base/"+in.StudioArtifactID, plan)
	input := map[string]any{"plan": plan, "scope_id": studiocomposition.Scope(in.UserID, strings.Split(in.Namespace, "/")[0])}
	studioLineage(input, in.UserID, in.Namespace, in.StudioProjectID, in.StudioArtifactID)
	if in.StudioSourceClipID != "" {
		input["source_clip_id"] = in.StudioSourceClipID
	}
	result, err := client.Render(ctx, in.UserID, id, input)
	if err != nil {
		return clip, err
	}
	prefix := "clips/" + in.Namespace
	_, output, size, _, thumb, err := p.saveStudioOutput(ctx, dir, in.UserID, id, prefix, client, result, false)
	if err != nil {
		return clip, err
	}
	clip.StudioArtifactID, clip.StorageKey, clip.ThumbnailKey = id, prefix+"/clip.mp4", thumb
	clip.Duration, clip.FileSize, clip.Resolution = output.Duration, size, fmt.Sprintf("%dx%d", output.Width, output.Height)
	if clip.ContainsPlatformBadge || !in.PreserveGeometry && min(w, h) < 360 {
		clean := studioClonePlan(plan)
		clean.Overlays = nil
		for _, o := range plan.Overlays {
			if o.ID != "platform-badge" {
				clean.Overlays = append(clean.Overlays, o)
			}
		}
		if min(w, h) < 360 {
			scale := 360 / float64(min(w, h))
			clean.Width = int(math.Ceil(float64(w)*scale/2)) * 2
			clean.Height = int(math.Ceil(float64(h)*scale/2)) * 2
			for i := range clean.Overlays {
				o := &clean.Overlays[i]
				o.X *= scale
				o.Y *= scale
				o.Width *= scale
				o.Height *= scale
				o.FontSize *= scale
			}
		}
		variantID := studioPlanIdentity(in.UserID, id+"/tiktok", clean)
		variant, e := client.Render(ctx, in.UserID, variantID, map[string]any{"plan": clean, "base_artifact_id": id, "export_only": true, "scope_id": studiocomposition.Scope(in.UserID, strings.Split(in.Namespace, "/")[0])})
		if e != nil {
			return Clip{}, e
		}
		_, _, _, _, _, e = p.saveStudioOutput(ctx, dir, in.UserID, variantID, prefix+"/tiktok", client, variant, false)
		if e != nil {
			return Clip{}, e
		}
		clip.TikTokStorageKey = prefix + "/tiktok/clip.mp4"
		clip.TikTokStudioArtifactID = variantID
	}
	if _, ok := clip.Metadata["transition_state"]; !ok {
		recipe := in
		recipe.Reuse = nil
		recipe.PreviousDecisions = nil
		clip.Metadata["transition_state"] = TransitionState{Recipe: recipe, FaceModelSignature: faceSignature}
	}
	return clip, nil
}

func (p *Processor) studioTrim(ctx context.Context, dir string, in RenderInput, client *studiocomposition.Client) (Clip, error) {
	if len(in.Segments) != 1 || !finite(in.Segments[0].Start) || !finite(in.Segments[0].End) || in.Segments[0].Start < 0 || in.Segments[0].End <= in.Segments[0].Start {
		return Clip{}, errors.New("invalid Studio trim interval")
	}
	s := in.Segments[0]
	input := map[string]any{"base_artifact_id": in.StudioArtifactID, "trim": map[string]float64{"start": s.Start, "end": s.End}}
	if in.StudioExpectedDuration > 0 && !in.StudioExportOnly {
		input["expected_duration"] = in.StudioExpectedDuration
	}
	if in.StudioExportOnly {
		input["export_only"] = true
	}
	if in.StudioRemovePlatformBadge {
		input["remove_platform_badge"] = true
	}
	id := studiocomposition.Identity(in.UserID, in.Namespace+"/operation/"+in.StudioOperationID, input)
	result, err := client.Run(ctx, in.UserID, id, "composition.derive", input)
	if err != nil {
		return Clip{}, err
	}
	prefix := "clips/" + in.Namespace
	_, info, size, preview, thumb, err := p.saveStudioOutput(ctx, dir, in.UserID, id, prefix, client, result, result.PreviewAvailable)
	if err != nil {
		return Clip{}, err
	}
	return Clip{StudioArtifactID: id, StorageKey: prefix + "/clip.mp4", PreviewStorageKey: preview, ThumbnailKey: thumb, Duration: info.Duration, FileSize: size, Resolution: fmt.Sprintf("%dx%d", info.Width, info.Height), Segments: in.Segments, Start: s.Start, End: s.End, Metadata: map[string]any{}}, nil
}

func (p *Processor) studioTracking(ctx context.Context, dir, source string, info probeInfo) ([]studioCropFrame, error) {
	h := info.Height / 2 * 2
	w := min(info.Width/2*2, int(float64(h)*9/16)/2*2)
	h = min(h, int(float64(w)*16/9)/2*2)
	if _, err := p.cropFilter(ctx, dir, source, info, w, h); err != nil {
		return nil, err
	}
	raw, err := os.ReadFile(filepath.Join(dir, "crop.cmd"))
	if err != nil {
		return nil, err
	}
	frames := []studioCropFrame{}
	for _, line := range strings.Split(string(raw), "\n") {
		var at float64
		var x int
		if _, err := fmt.Sscanf(line, "%f crop x %d;", &at, &x); err == nil {
			frames = append(frames, studioCropFrame{Time: at, studioCrop: studioCrop{X: float64(x), Y: float64(info.Height-h) / 2, Width: float64(w), Height: float64(h)}})
		}
	}
	return frames, nil
}

func studioWindowCrop(frames []studioCropFrame, segment Segment) (*studioCrop, []studioCropFrame) {
	if len(frames) == 0 {
		return nil, nil
	}
	first := frames[0].studioCrop
	var out []studioCropFrame
	for _, frame := range frames {
		if frame.Time <= segment.Start {
			first = frame.studioCrop
		}
		if frame.Time > segment.Start && frame.Time < segment.End {
			frame.Time -= segment.Start
			out = append(out, frame)
		}
	}
	out = append([]studioCropFrame{{Time: 0, studioCrop: first}}, out...)
	return &first, out
}
