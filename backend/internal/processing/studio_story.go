package processing

import (
	"context"
	"fmt"
	"math"
	"os"
	"strings"

	"sneepcut/backend-go/internal/captions"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/story"
	"sneepcut/backend-go/internal/studiocomposition"
)

func (p *Processor) RenderStory(ctx context.Context, request story.Request, version story.Version) (story.Output, error) {
	ctx, cancel := context.WithTimeout(ctx, p.cfg.Timeout)
	defer cancel()
	validated, err := validateStoryRender(request, version)
	if err != nil {
		return story.Output{}, err
	}
	bound, err := p.withNativeModels(ctx)
	if err != nil {
		return story.Output{}, err
	}
	p = bound
	client, err := p.studioClient(request.UserID)
	if err != nil {
		return story.Output{}, err
	}
	dir, err := os.MkdirTemp(p.cfg.TempDir, "story-studio-")
	if err != nil {
		return story.Output{}, err
	}
	defer os.RemoveAll(dir)
	selection, err := p.storyCaptions(ctx, dir, request, version)
	if err != nil {
		return story.Output{}, err
	}
	plan := studioPlan{SchemaVersion: 1, Title: version.Plan.Title, Width: validated.width, Height: validated.height, Duration: validated.duration, DynamicRange: "sdr", Assets: []studioAsset{}, Scenes: []studioScene{}, Audio: []studioAudio{}}
	if plan.Title == "" {
		plan.Title = "Story"
	}
	if request.Options.DynamicRange == "hdr" {
		plan.DynamicRange = "hdr"
	}
	occurrences := map[string]int{}
	for i, entry := range version.Timeline {
		source := validated.assets[entry.Video.SourceID]
		asset, err := p.studioAsset(ctx, &plan, source.Key, "video")
		if err != nil {
			return story.Output{}, err
		}
		for ai := range plan.Assets {
			a := &plan.Assets[ai]
			if a.ID == asset {
				a.Duration, a.Width, a.Height, a.HasAudio = source.Duration, source.Width, source.Height, source.HasAudio
			}
		}
		if err = p.studioSourcePreview(ctx, dir, request.ID, &plan, asset, source, request.Options); err != nil {
			return story.Output{}, err
		}
		anchor := entry.BlockID
		if anchor == "" {
			anchor = fmt.Sprintf("entry-%d", i+1)
		}
		occurrences[anchor]++
		sceneID := fmt.Sprintf("scene-%s-%d", storyDigest(anchor)[:16], occurrences[anchor])
		scene := studioScene{ID: sceneID, AssetID: asset, Start: entry.OutputIn, Duration: entry.OutputOut - entry.OutputIn, SourceIn: entry.Video.In, Fit: "contain"}
		if entry.Crop == "track" {
			file, e := p.storyMaterialize(ctx, dir, source.Key)
			if e != nil {
				return story.Output{}, e
			}
			crop := p.storyStableCrop(ctx, dir, file, entry.Video, source, plan.Width, plan.Height)
			if crop != "" {
				var w, h, x, y int
				if _, e = fmt.Sscanf(crop, "crop=%d:%d:%d:%d", &w, &h, &x, &y); e != nil {
					return story.Output{}, e
				}
				scene.Crop = &studioCrop{float64(x), float64(y), float64(w), float64(h)}
				scene.Fit = "cover"
			}
		}
		if entry.Transition == "fade" && i > 0 {
			scene.FadeIn = storyFadeSeconds
			plan.Scenes[i-1].FadeOut = storyFadeSeconds
		}
		plan.Scenes = append(plan.Scenes, scene)
		if entry.Audio != nil && validated.narration == nil {
			audio := validated.assets[entry.Audio.SourceID]
			key, e := effectiveStoryAudioKey(request.ID, audio, request.Options.AudioCleanup)
			if e != nil {
				return story.Output{}, e
			}
			kind := "audio"
			if key == source.Key {
				kind = "video"
			}
			aid, e := p.studioAsset(ctx, &plan, key, kind)
			if e != nil {
				return story.Output{}, e
			}
			studioAudioMetadata(&plan, aid, audio.Duration)
			if key == audio.Key {
				if err = p.studioSourcePreview(ctx, dir, request.ID, &plan, aid, audio, request.Options); err != nil {
					return story.Output{}, err
				}
			}
			plan.Audio = append(plan.Audio, studioAudio{ID: "audio-" + sceneID, AssetID: aid, Start: entry.OutputIn, Duration: scene.Duration, SourceIn: entry.Audio.In, Volume: 1, SceneID: scene.ID})
		}
	}
	transitions := make([]string, len(version.Timeline))
	for i, entry := range version.Timeline {
		transitions[i] = entry.Transition
	}
	studioApplyNativeTransitions(&plan, transitions)
	if validated.narration != nil {
		key, e := effectiveStoryAudioKey(request.ID, *validated.narration, request.Options.AudioCleanup)
		if e != nil {
			return story.Output{}, e
		}
		id, e := p.studioAsset(ctx, &plan, key, "audio")
		if e != nil {
			return story.Output{}, e
		}
		studioAudioMetadata(&plan, id, validated.narration.Duration)
		if key == validated.narration.Key {
			if err = p.studioSourcePreview(ctx, dir, request.ID, &plan, id, *validated.narration, request.Options); err != nil {
				return story.Output{}, err
			}
		}
		plan.Audio = append(plan.Audio, studioAudio{ID: "narration", AssetID: id, Duration: plan.Duration, Volume: 1})
	}
	if len(selection.Groups) > 0 {
		style := captions.Default()
		legacyFontSize := 0.0
		if request.Options.CaptionStyle != nil {
			style = *request.Options.CaptionStyle
		} else {
			legacy := map[string]any{}
			if request.Options.SubtitleFont != "" {
				legacy["subtitle_font"] = request.Options.SubtitleFont
			}
			legacy["subtitle_color"], legacy["subtitle_position"] = request.Options.SubtitleColor, request.Options.SubtitlePosition
			style = studioLegacyStyle(legacy, "clean")
			if request.Options.SubtitleSize > 0 {
				// Legacy sizes are short-edge pixels on a 360-unit canvas and
				// can exceed the modern slider's range. Preserve exact geometry
				// with a canonical pixel override while keeping its style valid.
				style.Size = min(.16, float64(request.Options.SubtitleSize)/360)
				legacyFontSize = math.Round(float64(request.Options.SubtitleSize) * float64(min(plan.Width, plan.Height)) / 360)
			}
		}
		if err = p.studioCaptions(ctx, dir, request.UserID, request.ID, &plan, selection.Groups, style); err != nil {
			return story.Output{}, err
		}
		plan.Captions.FontSizePX = legacyFontSize
	}
	if request.LogoKey != "" {
		brand := copyBrand(request.BrandSnapshot)
		brand["user_id"], brand["watermark_position"] = request.UserID, request.Options.LogoPosition
		if request.Options.LogoOpacity != nil {
			brand["watermark_opacity"] = *request.Options.LogoOpacity
		}
		if err = p.studioLogo(ctx, dir, &plan, request.LogoKey, brand); err != nil {
			return story.Output{}, err
		}
	}
	if request.Music != nil {
		if err = p.studioMusic(ctx, dir, request, &plan); err != nil {
			return story.Output{}, err
		}
	}
	id := studioPlanIdentity(request.UserID, fmt.Sprintf("story/%s/operation/%s/base/%s/version/%d", request.ID, request.StudioOperationID, request.StudioBaseArtifactID, version.Number), plan)
	project := request.ID
	if !data.ValidUUID(project) {
		project = studiocomposition.Identity(request.UserID, "story-project/"+request.ID, nil)
	}
	input := map[string]any{"plan": plan, "scope_id": studiocomposition.Scope(request.UserID, request.ID)}
	studioLineage(input, request.UserID, request.ID, project, request.StudioBaseArtifactID)
	if request.StudioSourceClipID != "" {
		input["source_clip_id"] = request.StudioSourceClipID
		if request.Base != nil {
			input["legacy_story_version"] = request.Base.Number
		}
	}
	result, err := client.Render(ctx, request.UserID, id, input)
	if err != nil {
		return story.Output{}, err
	}
	prefix := "clips/" + request.ID + "/story/" + id
	_, info, size, preview, thumb, err := p.saveStudioOutput(ctx, dir, request.UserID, id, prefix, client, result, plan.DynamicRange == "hdr")
	if err != nil {
		return story.Output{}, err
	}
	manual, timeline := studioStoryTimeline(result.EffectiveTimeline, request, version, plan)
	return story.Output{NativeTransitionVersion: studioNativeTransitionVersion, StudioManualEdits: manual, StudioTimeline: timeline, StudioArtifactID: id, Key: prefix + "/clip.mp4", PreviewKey: preview, ThumbnailKey: thumb, Duration: info.Duration, Size: size, Resolution: fmt.Sprintf("%dx%d", info.Width, info.Height), Captions: len(selection.Groups) > 0, CaptionMode: story.EffectiveCaptionMode(request.Options), CaptionWarnings: selection.Warnings, CaptionedCandidateIDs: selection.IDs, Music: storyMusicCredit(request, version)}, nil
}

// Audio may come from a source that never appears as a visual. Its preview must
// still be browser-decodable without replacing the immutable export source.
func (p *Processor) studioSourcePreview(ctx context.Context, dir, project string, plan *studioPlan, id string, source story.Asset, options story.Options) error {
	for i := range plan.Assets {
		asset := &plan.Assets[i]
		if asset.ID != id || asset.PreviewURL != "" {
			continue
		}
		if source.Kind == "narration" {
			if source.ProxyKey == "" {
				return nil
			}
		} else {
			if !studioNeedsPreview(source.VideoCodec, source.AudioCodec, source.ColorTransfer, source.HasAudio) {
				return nil
			}
			if source.ProxyKey == "" {
				if _, err := p.prepareStoryProxy(ctx, dir, project, &source, options); err != nil {
					return err
				}
			}
		}
		preview, err := p.studioURL(ctx, source.ProxyKey)
		if err != nil {
			return err
		}
		asset.PreviewURL = preview
		return nil
	}
	return nil
}

func studioMusicCreditOverlay(request story.Request, plan *studioPlan) {
	track := request.Music.Track
	text := "Music: " + storyMusicCreditText(track.Title, 65) + "\n" + storyMusicCreditText(track.Artist, 40) + " · incompetech.com\nCC BY 4.0 · creativecommons.org/licenses/by/4.0/\nTrimmed / looped / mixed"
	y := float64(plan.Height) * .04
	if strings.EqualFold(request.Options.SubtitlePosition, "top") {
		y = float64(plan.Height) * .8
	}
	plan.Overlays = append(plan.Overlays, studioOverlay{ID: "music-credit", Text: text, Start: max(0, plan.Duration-4), Duration: min(4, plan.Duration), X: float64(plan.Width) * .04, Y: y, Width: float64(plan.Width) * .92, Height: float64(plan.Height) * .16, Opacity: 1, FontSize: float64(max(16, min(plan.Width, plan.Height)/45)), Color: "#FFFFFF", Background: "#00000080", Align: "left"})
}
