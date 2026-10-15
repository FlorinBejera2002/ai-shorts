package processing

import (
	"context"
	"encoding/binary"
	"errors"
	"math"
	"path/filepath"

	"sneepcut/backend-go/internal/story"
)

// Music normalization is an asset preparation step. The voice, music and their
// gain automation remain separate editable tracks in the Studio composition.
func (p *Processor) studioMusic(ctx context.Context, dir string, request story.Request, plan *studioPlan) error {
	source, err := p.storyMaterialize(ctx, dir, request.Music.Key)
	if err != nil {
		return err
	}
	key := "work/" + request.ID + "/studio-music/" + storyDigest([]any{request.Music.Key, "normalized-18-2-11-v1"}) + ".flac"
	exists, err := p.storage.Exists(ctx, key)
	if err != nil {
		return err
	}
	if !exists {
		normalized := filepath.Join(dir, "studio-music.flac")
		if err = p.ffmpeg(ctx, dir, "-i", source, "-map", "0:a:0", "-vn", "-af", "loudnorm=I=-18:TP=-2:LRA=11,aresample=48000", "-ac", "2", "-c:a", "flac", normalized); err != nil {
			return err
		}
		if err = p.storySave(ctx, normalized, key, "audio/flac"); err != nil {
			return err
		}
	}
	assetID, err := p.studioAsset(ctx, plan, key, "audio")
	if err != nil {
		return err
	}
	trackDuration := request.Music.Track.DurationSeconds
	if !finite(trackDuration) || trackDuration <= 0 {
		trackDuration, err = p.storyMusicDuration(ctx, source)
		if err != nil {
			return err
		}
	}
	for i := range plan.Assets {
		if plan.Assets[i].ID == assetID {
			plan.Assets[i].Duration = trackDuration
			plan.Assets[i].HasAudio = true
		}
	}
	voices := append([]studioAudio(nil), plan.Audio...)
	levels, err := p.studioVoiceLevels(ctx, dir, *plan, voices)
	if err != nil {
		return err
	}
	envelope := studioDuckEnvelope(levels, plan.Duration, request.Options.Music.Volume)
	for at, part := 0.0, 0; at < plan.Duration-.000001; part++ {
		duration := min(trackDuration, plan.Duration-at)
		plan.Audio = append(plan.Audio, studioAudio{ID: "music-" + storyDigest(part)[:8], AssetID: assetID, Start: at, Duration: duration, SourceIn: 0, Volume: request.Options.Music.Volume, Envelope: studioEnvelopeWindow(envelope, at, duration)})
		at += duration
	}
	studioMusicCreditOverlay(request, plan)
	return nil
}

func (p *Processor) studioVoiceLevels(ctx context.Context, dir string, plan studioPlan, audio []studioAudio) ([]float64, error) {
	const rate = 1000
	samples := make([]float64, int(math.Ceil(plan.Duration*rate)))
	for _, track := range audio {
		var key string
		for _, asset := range plan.Assets {
			if asset.ID == track.AssetID {
				key = asset.Key
				break
			}
		}
		if key == "" {
			return nil, errors.New("Studio voice analysis requires a project media reference")
		}
		file, err := p.storyMaterialize(ctx, dir, key)
		if err != nil {
			return nil, err
		}
		raw, err := run(ctx, dir, p.cfg.FFmpegPath, "-nostdin", "-v", "error", "-ss", seconds(track.SourceIn), "-i", file, "-t", seconds(track.Duration), "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "1000", "-f", "f32le", "pipe:1")
		if err != nil {
			return nil, err
		}
		start := int(math.Round(track.Start * rate))
		for i := 0; i+4 <= len(raw); i += 4 {
			index := start + i/4
			if index >= len(samples) {
				break
			}
			value := float64(math.Float32frombits(binary.LittleEndian.Uint32(raw[i : i+4])))
			if !finite(value) {
				return nil, errors.New("invalid source audio sample")
			}
			samples[index] += value * track.Volume
		}
	}
	levels := make([]float64, (len(samples)+19)/20)
	for i := range levels {
		sum := 0.0
		last := min(len(samples), (i+1)*20)
		for _, v := range samples[i*20 : last] {
			sum += v * v
		}
		levels[i] = math.Sqrt(sum / float64(last-i*20))
	}
	return levels, nil
}

func studioDuckEnvelope(levels []float64, duration, volume float64) []studioPoint {
	fade := min(.8, duration/4)
	gain := 1.0
	points := []studioPoint{{0, 0}}
	for i, level := range levels {
		t := min(duration, float64(i)*.02)
		target := 1.0
		if level > .025 {
			target = math.Pow(.025/level, 1-1.0/8)
		}
		constant := .3
		if target < gain {
			constant = .015
		}
		gain += (target - gain) * (1 - math.Exp(-.02/constant))
		fader := min(1, min(t/fade, (duration-t)/fade))
		points = append(points, studioPoint{studioRound(t), studioRound(volume * gain * max(0, fader))})
	}
	points = append(points, studioPoint{duration, 0})
	// Piecewise linear automation is bounded for browser scheduling. Increase
	// tolerance only when unusually long material exceeds the keypoint budget.
	for tolerance := .002; ; tolerance *= 1.5 {
		simple := studioSimplifyEnvelope(points, tolerance)
		if len(simple) <= 512 {
			return simple
		}
	}
}

func studioSimplifyEnvelope(points []studioPoint, tolerance float64) []studioPoint {
	if len(points) <= 2 {
		return points
	}
	first, last := points[0], points[len(points)-1]
	distance, index := 0.0, 0
	for i := 1; i < len(points)-1; i++ {
		expected := first.Value
		if last.Time > first.Time {
			expected += (last.Value - first.Value) * (points[i].Time - first.Time) / (last.Time - first.Time)
		}
		if difference := math.Abs(points[i].Value - expected); difference > distance {
			distance, index = difference, i
		}
	}
	if distance <= tolerance {
		return []studioPoint{first, last}
	}
	left := studioSimplifyEnvelope(points[:index+1], tolerance)
	right := studioSimplifyEnvelope(points[index:], tolerance)
	return append(left[:len(left)-1], right...)
}

func studioEnvelopeWindow(points []studioPoint, start, duration float64) []studioPoint {
	valueAt := func(t float64) float64 {
		for i := 1; i < len(points); i++ {
			if points[i].Time >= t {
				a, b := points[i-1], points[i]
				if b.Time == a.Time {
					return b.Value
				}
				return a.Value + (b.Value-a.Value)*(t-a.Time)/(b.Time-a.Time)
			}
		}
		return points[len(points)-1].Value
	}
	result := []studioPoint{{0, valueAt(start)}}
	for _, p := range points {
		if p.Time > start && p.Time < start+duration {
			result = append(result, studioPoint{p.Time - start, p.Value})
		}
	}
	return append(result, studioPoint{duration, valueAt(start + duration)})
}
