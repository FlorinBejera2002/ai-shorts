package processing

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"strings"
)

func (p *Processor) render(ctx context.Context, in RenderInput) (Clip, error) {
	clip := Clip{Metadata: map[string]any{}, Segments: in.Segments, Transition: in.Transition, TransitionDuration: in.TransitionDuration}
	if len(in.Segments) == 0 {
		return clip, fmt.Errorf("render requires at least one segment")
	}
	clip.Start = in.Segments[0].Start
	clip.End = in.Segments[len(in.Segments)-1].End

	dir, err := os.MkdirTemp(p.cfg.TempDir, "sneep-render-")
	if err != nil {
		return clip, err
	}
	defer os.RemoveAll(dir)

	source := filepath.Join(dir, "source.mp4")
	if err = p.materialize(ctx, in.SourceKey, source); err != nil {
		return clip, err
	}
	info, err := p.probe(ctx, source)
	if err != nil {
		return clip, err
	}

	if in.NaturalTransitions {
		recipe := in
		recipe.Reuse, recipe.PreviousDecisions = nil, nil
		var decisions []BoundaryDecision
		in.Segments, decisions, err = p.analyzeNaturalCuts(ctx, source, in, info)
		if err != nil {
			return clip, err
		}
		in.Transition, in.TransitionDuration = "cut", 0
		clip.Segments, clip.Transition, clip.TransitionDuration = in.Segments, "cut", 0
		clip.Start, clip.End = in.Segments[0].Start, in.Segments[len(in.Segments)-1].End
		clip.Metadata["transition_decisions"] = decisions
		clip.Metadata["transition_state"] = TransitionState{Recipe: recipe, Decisions: decisions}
		if in.Reuse != nil && reflect.DeepEqual(in.Segments, in.Reuse.Segments) && reflect.DeepEqual(decisions, in.PreviousDecisions) {
			previous := *in.Reuse
			previous.Metadata = clip.Metadata
			return previous, nil
		}
	}

	// Extract/concat segments into a single clip.
	extracted := filepath.Join(dir, "extracted.mp4")
	if err = p.extractClip(ctx, dir, source, extracted, in.Segments, in.Transition, in.TransitionDuration, info.Audio); err != nil {
		return clip, err
	}

	current := extracted
	clip.Duration = clipDuration(in.Segments, in.Transition, in.TransitionDuration)

	// Smart crop (face-tracking vertical reframe).
	if in.SmartCrop && !in.PreserveGeometry && in.AspectRatio == "9:16" {
		cropped := filepath.Join(dir, "cropped.mp4")
		var boundaries []float64
		if in.NaturalTransitions {
			elapsed := 0.0
			for _, segment := range in.Segments[:len(in.Segments)-1] {
				elapsed += segment.End - segment.Start
				boundaries = append(boundaries, elapsed)
			}
		}
		if err = p.smartCrop(ctx, dir, current, cropped, info, boundaries...); err == nil {
			current = cropped
			clip.Metadata["transition_reframing"] = len(boundaries) > 0
			if decisions, ok := clip.Metadata["transition_decisions"].([]BoundaryDecision); ok {
				for i, at := range boundaries {
					frames, sampleErr := p.boundaryFrames(ctx, current, at)
					if sampleErr != nil {
						continue
					}
					similarity := 1 - frameDifference(frames[0], frames[len(frames)-1])
					if similarity > decisions[i].VisualSimilarity+.04 {
						decisions[i].Strategy = "crop_adjustment"
						decisions[i].Reason = "Subject tracking improved continuity across the sequence boundary"
						decisions[i].VisualSimilarity = similarity
						decisions[i].Score = max(decisions[i].Score, similarity)
					}
				}
			}
		} else if ctx.Err() != nil {
			return clip, ctx.Err()
		} else {
			clip.Metadata["transition_reframing"] = false
		}
	}
	if decisions, ok := clip.Metadata["transition_decisions"].([]BoundaryDecision); ok {
		current, err = p.applyNaturalBridges(ctx, dir, current, in, decisions)
		if err != nil {
			return clip, err
		}
	}

	// Determine output dimensions.
	var outW, outH int
	if in.PreserveGeometry {
		outW, outH = info.Width, info.Height
	} else {
		outW, outH, err = dimensions(info.Width, info.Height, in.AspectRatio)
		if err != nil {
			return clip, err
		}
	}
	clip.Resolution = fmt.Sprintf("%dx%d", outW, outH)
	tiktokW, tiktokH := outW, outH
	if min(tiktokW, tiktokH) < 360 {
		scale := 360 / float64(min(tiktokW, tiktokH))
		tiktokW = int(math.Ceil(float64(tiktokW)*scale/2)) * 2
		tiktokH = int(math.Ceil(float64(tiktokH)*scale/2)) * 2
	}

	// Pre-brand intermediate for TikTok variant.
	preBrand := current

	// Framing and brand overlay.
	if !in.PreserveGeometry {
		framed := filepath.Join(dir, "framed.mp4")
		if err = p.frameAndBrand(ctx, dir, current, framed, outW, outH, in.Brand, in.HookText); err != nil {
			return clip, err
		}
		current = framed
	}

	containsBadge := !in.PreserveGeometry && in.Brand != nil && !brandBool(in.Brand, "hide_platform_badge")
	clip.ContainsPlatformBadge = containsBadge

	// TikTok variant without platform badge.
	var tiktokCurrent string
	if !in.PreserveGeometry && (containsBadge || tiktokW != outW || tiktokH != outH) {
		tiktokBrand := copyBrand(in.Brand)
		tiktokBrand["hide_platform_badge"] = true
		tiktokFramed := filepath.Join(dir, "tiktok-framed.mp4")
		if err = p.frameAndBrand(ctx, dir, preBrand, tiktokFramed, tiktokW, tiktokH, tiktokBrand, in.HookText); err != nil {
			return clip, err
		}
		tiktokCurrent = tiktokFramed
	}

	// Burn subtitles.
	if in.BurnSubtitles && in.SubtitleStyle != "none" {
		srtFile := filepath.Join(dir, "subtitles.srt")
		words := RemapWords(in.Transcript.Words, in.Segments, in.Transition, in.TransitionDuration)
		if len(words) > 0 {
			if err = writeSRT(srtFile, words); err != nil {
				return clip, err
			}
			subtitled := filepath.Join(dir, "subtitled.mp4")
			style := in.SubtitleStyle
			if style == "" || style == "default" {
				style = "clean"
			}
			if err = p.burnSubtitles(ctx, dir, current, srtFile, subtitled, style, in.Brand); err != nil {
				return clip, err
			}
			current = subtitled
			clip.HasSubtitles = true

			if tiktokCurrent != "" {
				tiktokSubtitled := filepath.Join(dir, "tiktok-subtitled.mp4")
				if err = p.burnSubtitles(ctx, dir, tiktokCurrent, srtFile, tiktokSubtitled, style, in.Brand); err != nil {
					return clip, err
				}
				tiktokCurrent = tiktokSubtitled
			}
		}
	}

	// Generate thumbnail.
	thumbnailFile := filepath.Join(dir, "thumbnail.jpg")
	_ = p.ffmpeg(ctx, dir, "-i", current, "-ss", "0.25", "-frames:v", "1", "-q:v", "2", thumbnailFile)

	// Probe final file size.
	if st, err := os.Stat(current); err == nil {
		clip.FileSize = st.Size()
	}

	// Upload to storage.
	clipKey := fmt.Sprintf("clips/%s/clip.mp4", in.Namespace)
	if err = p.storage.Save(ctx, current, clipKey, "video/mp4"); err != nil {
		return clip, err
	}
	clip.StorageKey = clipKey

	if tiktokCurrent != "" {
		tiktokKey := fmt.Sprintf("clips/%s/tiktok/clip.mp4", in.Namespace)
		if err = p.storage.Save(ctx, tiktokCurrent, tiktokKey, "video/mp4"); err != nil {
			return clip, err
		}
		clip.TikTokStorageKey = tiktokKey
	}

	if _, err := os.Stat(thumbnailFile); err == nil {
		thumbKey := fmt.Sprintf("clips/%s/thumbnail.jpg", in.Namespace)
		if err = p.storage.Save(ctx, thumbnailFile, thumbKey, "image/jpeg"); err == nil {
			clip.ThumbnailKey = thumbKey
		}
	}

	return clip, nil
}

// extractClip extracts and joins segments from the source video.
func (p *Processor) extractClip(ctx context.Context, dir, source, output string, segments []Segment, transition string, transitionDur float64, hasAudio bool) error {
	if len(segments) > 1 && transition != "" && transition != "cut" {
		return p.renderTransitions(ctx, dir, source, output, segments, transition, transitionDur, hasAudio)
	}
	if len(segments) == 1 {
		s := segments[0]
		args := []string{"-ss", seconds(s.Start), "-to", seconds(s.End), "-i", source}
		args = append(args, delivery...)
		if !hasAudio {
			args = filterOut(args, "-c:a", "-b:a")
			args = append(args, "-an")
		}
		args = append(args, output)
		return p.ffmpeg(ctx, dir, args...)
	}
	// Multi-segment hard cut: extract each then concat.
	var files []string
	for i, s := range segments {
		seg := filepath.Join(dir, fmt.Sprintf("seg%d.mp4", i))
		args := []string{"-ss", seconds(s.Start), "-to", seconds(s.End), "-i", source}
		args = append(args, delivery...)
		if !hasAudio {
			args = filterOut(args, "-c:a", "-b:a")
			args = append(args, "-an")
		}
		args = append(args, seg)
		if err := p.ffmpeg(ctx, dir, args...); err != nil {
			return err
		}
		files = append(files, seg)
	}
	listFile := filepath.Join(dir, "concat.txt")
	var b strings.Builder
	for _, f := range files {
		fmt.Fprintf(&b, "file '%s'\n", f)
	}
	if err := os.WriteFile(listFile, []byte(b.String()), 0600); err != nil {
		return err
	}
	return p.ffmpeg(ctx, dir, "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", output)
}

// renderTransitions builds an xfade/acrossfade filter graph for fade/dissolve transitions.
func (p *Processor) renderTransitions(ctx context.Context, dir, source, output string, segments []Segment, style string, duration float64, hasAudio bool) error {
	overlaps := transitionOverlaps(segments, duration)
	args := []string{}
	var filters []string
	for i, s := range segments {
		args = append(args, "-ss", seconds(s.Start), "-t", seconds(s.End-s.Start), "-i", source)
		filters = append(filters, fmt.Sprintf("[%d:v]setpts=PTS-STARTPTS,fps=30,format=yuv420p[v%d]", i, i))
		if hasAudio {
			filters = append(filters, fmt.Sprintf("[%d:a]aresample=48000,asetpts=PTS-STARTPTS[a%d]", i, i))
		}
	}
	video, audio := "v0", "a0"
	elapsed := segments[0].End - segments[0].Start
	for i, overlap := range overlaps {
		offset := elapsed - overlap
		filters = append(filters, fmt.Sprintf("[%s][v%d]xfade=transition=%s:duration=%f:offset=%f[vx%d]", video, i+1, style, overlap, offset, i+1))
		video = fmt.Sprintf("vx%d", i+1)
		if hasAudio {
			filters = append(filters, fmt.Sprintf("[%s][a%d]acrossfade=d=%f:c1=tri:c2=tri[ax%d]", audio, i+1, overlap, i+1))
			audio = fmt.Sprintf("ax%d", i+1)
		}
		elapsed += segments[i+1].End - segments[i+1].Start - overlap
	}
	args = append(args, "-filter_complex", strings.Join(filters, ";"), "-map", fmt.Sprintf("[%s]", video))
	args = append(args, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "veryfast")
	if hasAudio {
		args = append(args, "-map", fmt.Sprintf("[%s]", audio), "-c:a", "aac")
	} else {
		args = append(args, "-an")
	}
	args = append(args, "-t", seconds(elapsed), "-movflags", "+faststart", output)
	return p.ffmpeg(ctx, dir, args...)
}

// smartCrop applies face-tracking vertical reframe.
func (p *Processor) smartCrop(ctx context.Context, dir, source, output string, info probeInfo, boundaries ...float64) error {
	// Track and crop in source pixels; output scaling happens during framing.
	h := info.Height / 2 * 2
	w := min(info.Width/2*2, int(float64(h)*9/16)/2*2)
	h = min(h, int(float64(w)*16/9)/2*2)
	if w < 2 || h < 2 {
		return fmt.Errorf("source too small for tracking")
	}
	filter, err := p.cropFilter(ctx, dir, source, info, w, h, boundaries...)
	if err != nil {
		return err
	}
	args := []string{"-i", source, "-vf", filter, "-map", "0:v:0", "-map", "0:a?"}
	args = append(args, delivery...)
	args = append(args, output)
	return p.ffmpeg(ctx, dir, args...)
}

// frameAndBrand applies aspect ratio crop and brand overlay (logo + badge + hook text).
func (p *Processor) frameAndBrand(ctx context.Context, dir, source, output string, w, h int, brand map[string]any, hookText string) error {
	applyLogo := brandBool(brand, "apply_brand") && brandString(brand, "logo_key") != ""
	drawBadge := brand != nil && !brandBool(brand, "hide_platform_badge")
	applyHook := brandBool(brand, "apply_brand") && brandBool(brand, "apply_brand_colors") && hookText != "" && brandString(brand, "primary_color") != "" && brandString(brand, "secondary_color") != ""

	// Check if the source already matches and no overlay is needed.
	info, _ := p.probe(ctx, source)
	if info.Width == w && info.Height == h && !applyLogo && !drawBadge && !applyHook {
		return copyFile(source, output)
	}

	crop := fmt.Sprintf("crop=%d:%d:(iw-%d)/2:(ih-%d)/2,setsar=1", w, h, w, h)
	if info.Width < w || info.Height < h {
		crop = fmt.Sprintf("scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d:(iw-%d)/2:(ih-%d)/2,setsar=1", w, h, w, h, w, h)
	}

	if !applyLogo && !drawBadge && !applyHook {
		args := []string{"-i", source, "-vf", crop, "-map", "0:v:0", "-map", "0:a?"}
		args = append(args, delivery...)
		args = append(args, output)
		return p.ffmpeg(ctx, dir, args...)
	}

	// Build overlay PNG using ffmpeg drawtext (no Pillow in Go).
	overlay := filepath.Join(dir, filepath.Base(output)+"-overlay.png")
	if err := p.buildOverlay(ctx, dir, overlay, w, h, brand, hookText, applyLogo, drawBadge, applyHook); err != nil {
		return err
	}

	filterComplex := fmt.Sprintf("[0:v]%s[base];[base][1:v]overlay=0:0:eof_action=repeat:format=auto[v]", crop)
	args := []string{"-i", source, "-i", overlay, "-filter_complex", filterComplex, "-map", "[v]", "-map", "0:a?"}
	args = append(args, delivery...)
	args = append(args, output)
	return p.ffmpeg(ctx, dir, args...)
}

// buildOverlay creates a transparent PNG overlay with badge text and optional brand elements.
func (p *Processor) buildOverlay(ctx context.Context, dir, output string, w, h int, brand map[string]any, hookText string, applyLogo, drawBadge, applyHook bool) error {
	// Create a transparent canvas with ffmpeg lavfi, then composite elements.
	filters := []string{fmt.Sprintf("color=black@0:s=%dx%d:d=1,format=rgba", w, h)}

	if drawBadge {
		margin := max(4, int(math.Round(float64(min(w, h))*0.025)))
		fontSize := max(10, int(math.Round(float64(w)*0.025)))
		position := brandString(brand, "watermark_position")
		y := fmt.Sprintf("h-%d-%d", margin, fontSize)
		if strings.HasPrefix(position, "bottom") || position == "" {
			y = fmt.Sprintf("%d", margin)
		}
		filters = append(filters, fmt.Sprintf("drawtext=text='sneepcut':fontsize=%d:fontcolor=white@0.82:borderw=1:bordercolor=black@0.59:x=%d:y=%s", fontSize, margin, y))
	}

	if applyHook {
		primary := brandString(brand, "primary_color")
		fontSize := max(10, int(math.Round(float64(w)*0.04)))
		boxX := int(math.Round(float64(w) * 0.08))
		yPos := int(math.Round(float64(h) * 0.25))
		text := sanitizeDrawtext(hookText)
		if len(text) > 200 {
			text = text[:200]
		}
		filters = append(filters, fmt.Sprintf("drawtext=text='%s':fontsize=%d:fontcolor=white:box=1:boxcolor=%s@0.9:boxborderw=8:x=%d:y=%d",
			text, fontSize, primary, boxX, yPos))
	}

	if applyLogo {
		logoKey := brandString(brand, "logo_key")
		userID := brandString(brand, "user_id")
		if !strings.HasPrefix(logoKey, "brand/"+userID+"/") || strings.Contains(logoKey, "..") {
			return fmt.Errorf("logo must belong to the job owner")
		}
		logoFile := filepath.Join(dir, "logo-source.png")
		if err := p.materialize(ctx, logoKey, logoFile); err != nil {
			return err
		}
		maxLogoW := max(1, int(math.Round(float64(w)*0.18)))
		maxLogoH := max(1, int(math.Round(float64(h)*0.18)))
		margin := max(4, int(math.Round(float64(min(w, h))*0.025)))
		position := brandString(brand, "watermark_position")
		if position == "" {
			position = "bottom-right"
		}
		x := fmt.Sprintf("%d", margin)
		if strings.HasSuffix(position, "right") {
			x = fmt.Sprintf("W-w-%d", margin)
		}
		y := fmt.Sprintf("%d", margin)
		if strings.HasPrefix(position, "bottom") {
			y = fmt.Sprintf("H-h-%d", margin)
		}
		opacity := 0.8
		if v, ok := brand["watermark_opacity"].(float64); ok && v >= 0 && v <= 1 {
			opacity = v
		}
		// We overlay the logo onto the canvas as a second input in a separate pass.
		logoOverlay := filepath.Join(dir, "canvas-with-logo.png")
		canvasFilter := strings.Join(filters, ",")
		err := p.ffmpeg(ctx, dir,
			"-f", "lavfi", "-i", canvasFilter,
			"-i", logoFile,
			"-filter_complex", fmt.Sprintf("[1:v]scale='min(%d,iw)':'min(%d,ih)':force_original_aspect_ratio=decrease,format=rgba,colorchannelmixer=aa=%f[logo];[0:v][logo]overlay=%s:%s", maxLogoW, maxLogoH, opacity, x, y),
			"-frames:v", "1", logoOverlay)
		if err != nil {
			return err
		}
		// Now we have the full overlay; just copy it.
		return copyFile(logoOverlay, output)
	}

	// No logo — render canvas directly.
	canvasFilter := strings.Join(filters, ",")
	return p.ffmpeg(ctx, dir, "-f", "lavfi", "-i", canvasFilter, "-frames:v", "1", output)
}

// burnSubtitles burns an SRT file into the video using the FFmpeg subtitles filter.
func (p *Processor) burnSubtitles(ctx context.Context, dir, video, srt, output, style string, brand map[string]any) error {
	preset := subtitlePreset(style)
	applyBrand(preset, brand)

	borderStyle := 1
	if preset["bg_opacity"].(float64) > 0 {
		borderStyle = 3
	}
	styleStr := fmt.Sprintf("Alignment=%d,Fontname=%s,Fontsize=%d,PrimaryColour=%s,OutlineColour=%s,BackColour=%s,BorderStyle=%d,Outline=%d,Shadow=0,MarginV=80,Bold=1",
		preset["alignment"], preset["font_name"], preset["fontsize"],
		hexToASSColor(preset["font_color"].(string), 1.0),
		hexToASSColor(preset["border_color"].(string), 1.0),
		hexToASSColor(preset["bg_color"].(string), preset["bg_opacity"].(float64)),
		borderStyle, preset["border_width"])

	escaped := escapeSubtitlePath(srt)
	vf := fmt.Sprintf("subtitles='%s':force_style='%s'", escaped, styleStr)
	args := []string{"-i", video, "-vf", vf}
	args = append(args, delivery...)
	args = append(args, output)
	return p.ffmpeg(ctx, dir, args...)
}

func subtitlePreset(style string) map[string]any {
	presets := map[string]map[string]any{
		"clean":       {"alignment": 2, "fontsize": 18, "font_name": "Arial", "font_color": "#FFFFFF", "border_color": "#000000", "border_width": 2, "bg_color": "#000000", "bg_opacity": 0.0},
		"bold":        {"alignment": 2, "fontsize": 22, "font_name": "Arial", "font_color": "#FFFFFF", "border_color": "#000000", "border_width": 4, "bg_color": "#000000", "bg_opacity": 0.0},
		"caption-box": {"alignment": 2, "fontsize": 18, "font_name": "Arial", "font_color": "#FFFFFF", "border_color": "#111111", "border_width": 1, "bg_color": "#111111", "bg_opacity": 0.75},
	}
	if p, ok := presets[style]; ok {
		c := make(map[string]any, len(p))
		for k, v := range p {
			c[k] = v
		}
		return c
	}
	return subtitlePreset("clean")
}

func applyBrand(preset map[string]any, brand map[string]any) {
	if brand == nil || !brandBool(brand, "apply_brand") {
		return
	}
	if v := brandString(brand, "subtitle_font"); v != "" {
		preset["font_name"] = v
	}
	if v := brandString(brand, "subtitle_color"); v != "" {
		preset["font_color"] = v
	}
	if v := brandString(brand, "subtitle_bg_color"); v != "" {
		preset["bg_color"] = v
	}
	if v, ok := brand["subtitle_bg_opacity"].(float64); ok {
		preset["bg_opacity"] = v
	}
	if v := brandString(brand, "subtitle_position"); v != "" {
		switch v {
		case "bottom":
			preset["alignment"] = 2
		case "middle":
			preset["alignment"] = 5
		case "top":
			preset["alignment"] = 8
		}
	}
}

func hexToASSColor(hex string, opacity float64) string {
	hex = strings.TrimPrefix(hex, "#")
	if len(hex) != 6 {
		hex = "FFFFFF"
	}
	r := hexByte(hex[0:2])
	g := hexByte(hex[2:4])
	b := hexByte(hex[4:6])
	alpha := int(math.Round((1.0 - opacity) * 255))
	return fmt.Sprintf("&H%02X%02X%02X%02X", alpha, b, g, r)
}

func hexByte(s string) int {
	v := 0
	for _, c := range s {
		v *= 16
		if c >= '0' && c <= '9' {
			v += int(c - '0')
		} else if c >= 'a' && c <= 'f' {
			v += int(c-'a') + 10
		} else if c >= 'A' && c <= 'F' {
			v += int(c-'A') + 10
		}
	}
	return v
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

func transitionOverlaps(segments []Segment, duration float64) []float64 {
	overlaps := make([]float64, 0, len(segments)-1)
	for i := 0; i < len(segments)-1; i++ {
		left := segments[i].End - segments[i].Start
		right := segments[i+1].End - segments[i+1].Start
		o := math.Min(duration, math.Min(left/2, right/2))
		overlaps = append(overlaps, o)
	}
	return overlaps
}

func clipDuration(segments []Segment, transition string, transitionDur float64) float64 {
	total := 0.0
	for _, s := range segments {
		total += s.End - s.Start
	}
	if transition != "" && transition != "cut" {
		overlaps := transitionOverlaps(segments, transitionDur)
		for _, o := range overlaps {
			total -= o
		}
	}
	return math.Round(total*1000) / 1000
}

func brandBool(brand map[string]any, key string) bool {
	if brand == nil {
		return false
	}
	v, _ := brand[key].(bool)
	return v
}

func brandString(brand map[string]any, key string) string {
	if brand == nil {
		return ""
	}
	v, _ := brand[key].(string)
	return v
}

func copyBrand(brand map[string]any) map[string]any {
	c := make(map[string]any, len(brand))
	for k, v := range brand {
		c[k] = v
	}
	return c
}

func sanitizeDrawtext(s string) string {
	s = strings.Join(strings.Fields(s), " ")
	s = strings.ReplaceAll(s, "'", "'\\''")
	s = strings.ReplaceAll(s, ":", "\\:")
	s = strings.ReplaceAll(s, "\\", "\\\\")
	return s
}

func filterOut(args []string, keys ...string) []string {
	result := make([]string, 0, len(args))
	skip := false
	for _, a := range args {
		if skip {
			skip = false
			continue
		}
		found := false
		for _, k := range keys {
			if a == k {
				found = true
				break
			}
		}
		if found {
			skip = true
			continue
		}
		result = append(result, a)
	}
	return result
}

func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0600)
}
