package processing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"

	"sneepcut/backend-go/internal/music"
	"sneepcut/backend-go/internal/story"
)

const storyMusicAnalysisSeconds = 600

// PrepareStoryMusic downloads only the chosen track. Shared lossless audio is
// reused across projects; temporary downloads and analysis PCM are removed.
func (p *Processor) PrepareStoryMusic(ctx context.Context, selection story.MusicSelection) (*story.PreparedMusic, error) {
	catalog := p.musicCatalog
	if catalog == nil {
		// Package fixtures may construct Processor directly. Normal workers
		// initialize one concurrency-safe metadata cache for their lifetime.
		catalog = music.NewCatalog()
	}
	track, err := catalog.Get(ctx, selection.TrackID)
	if err != nil {
		return nil, fmt.Errorf("selected music is unavailable: %w", err)
	}
	dir, err := os.MkdirTemp(p.cfg.TempDir, "story-music-")
	if err != nil {
		return nil, storyWorkError("music preparation")
	}
	defer os.RemoveAll(dir)
	key := "music/incompetech/" + storyDigest([]any{"audio-1", track.ID, track.PreviewURL}) + ".flac"
	file := filepath.Join(dir, "selected.flac")
	if p.materialize(ctx, key, file) != nil {
		_ = os.Remove(file) // A failed cache read may have left a partial file.
		source := filepath.Join(dir, "download.mp3")
		if _, err = catalog.Download(ctx, selection.TrackID, source); err != nil {
			return nil, fmt.Errorf("selected music could not be downloaded: %w", err)
		}
		if _, err = p.storyMusicDuration(ctx, source); err != nil {
			return nil, err
		}
		// Gapless PCM timing avoids MP3 encoder padding changing each repeat's
		// phase. FLAC retains the decoded audio without another lossy encode.
		if err = p.ffmpeg(ctx, dir, "-i", source, "-map", "0:a:0", "-vn", "-t", "1800", "-ar", "48000", "-ac", "2", "-c:a", "flac", file); err != nil {
			return nil, errors.New("selected music could not be decoded")
		}
		if err = p.storySave(ctx, file, key, "audio/flac"); err != nil {
			return nil, err
		}
	}
	return p.prepareStoryMusicFile(ctx, dir, track, key, file)
}

func (p *Processor) storyMusicDuration(ctx context.Context, file string) (float64, error) {
	data, err := run(ctx, "", p.cfg.FFprobePath, "-v", "error", "-select_streams", "a:0", "-show_entries", "format=duration:stream=codec_type", "-of", "json", file)
	var probe struct {
		Format  struct{ Duration string }
		Streams []struct {
			CodecType string `json:"codec_type"`
		}
	}
	if err != nil || json.Unmarshal(data, &probe) != nil || len(probe.Streams) != 1 || probe.Streams[0].CodecType != "audio" {
		return 0, errors.New("selected music is not readable audio")
	}
	duration, err := strconv.ParseFloat(probe.Format.Duration, 64)
	if err != nil || !finite(duration) || duration < 1 || duration > 1800 {
		return 0, errors.New("selected music duration is outside the supported limit")
	}
	return duration, nil
}

func (p *Processor) prepareStoryMusicFile(ctx context.Context, dir string, track music.Track, key, file string) (*story.PreparedMusic, error) {
	duration, err := p.storyMusicDuration(ctx, file)
	if err != nil {
		return nil, err
	}
	track.DurationSeconds = duration
	pcm := filepath.Join(dir, "music-analysis.s16")
	if err = p.ffmpeg(ctx, dir, "-i", file, "-map", "0:a:0", "-vn", "-t", strconv.Itoa(storyMusicAnalysisSeconds), "-ac", "1", "-ar", "8000", "-f", "s16le", pcm); err != nil {
		return nil, errors.New("selected music analysis could not be decoded")
	}
	stat, err := os.Stat(pcm)
	if err != nil || stat.Size() < 16000 || stat.Size() > storyMusicAnalysisSeconds*16000 {
		return nil, errors.New("selected music analysis exceeds the supported limit")
	}
	raw, err := os.ReadFile(pcm)
	if err != nil {
		return nil, storyWorkError("music analysis")
	}
	beats, bpm, confidence := detectStoryMusicBeats(raw)
	return &story.PreparedMusic{Track: track, Key: key, Beats: beats, BPM: bpm, Confidence: confidence}, nil
}

// The music runs continuously on the output sample clock; visual cuts never
// restart it. Only music is ducked. The source/voice is neither stretched nor
// normalized, and the limiter compensates its lookahead delay explicitly.
func storyMusicMixFilters(input int, duration, volume float64) []string {
	fade := min(.8, duration/4)
	return []string{
		"[a]aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[voice][duck]",
		fmt.Sprintf("[%d:a]atrim=duration=%s,asetpts=PTS-STARTPTS,loudnorm=I=-18:TP=-2:LRA=11,aresample=48000,aformat=channel_layouts=stereo,volume=%s,afade=t=in:d=%s,afade=t=out:st=%s:d=%s[music]", input, seconds(duration), seconds(volume), seconds(fade), seconds(max(0, duration-fade)), seconds(fade)),
		"[music][duck]sidechaincompress=threshold=0.025:ratio=8:attack=15:release=300:makeup=1[bed]",
		fmt.Sprintf("[voice][bed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95:level=false:latency=true,apad,atrim=duration=%s,asetpts=PTS-STARTPTS[mixed]", seconds(duration)),
	}
}

func storyMusicCredit(request story.Request, version story.Version) *story.MusicCredit {
	if request.Music == nil {
		return nil
	}
	track := request.Music.Track
	credit := &story.MusicCredit{TrackID: track.ID, Title: track.Title, Artist: track.Artist, License: track.License, LicenseURL: track.LicenseURL, SourceURL: track.SourceURL, Attribution: track.Attribution, BPM: request.Music.BPM, SyncStatus: "off"}
	if version.MusicSync != nil {
		credit.SyncStatus, credit.AdjustedCuts = version.MusicSync.Status, version.MusicSync.AdjustedCuts
	}
	return credit
}
