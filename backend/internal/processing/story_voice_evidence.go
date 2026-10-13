package processing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"sneepcut/backend-go/internal/story"
)

var storyVADArguments = []string{"--vad-threshold", "0.5", "--vad-min-speech-duration-ms", "150", "--vad-min-silence-duration-ms", "200", "--vad-speech-pad-ms", "150", "--vad-samples-overlap", "0.1"}

const storyVoiceClockVersion = "voice-clock-2"
const storyVoiceAlignmentWarning = "Automatic captions withheld because voice timing could not be verified"

type storyVoiceEvidence struct {
	Version    string    `json:"version"`
	SourceHash string    `json:"source_hash"`
	Duration   float64   `json:"duration"`
	Intervals  []Segment `json:"intervals"`
}

func (p *Processor) storyVADExecutable() string {
	file := p.cfg.WhisperVADPath
	if file == "" {
		file = filepath.Join(filepath.Dir(p.cfg.WhisperPath), "whisper-vad-speech-segments"+filepath.Ext(p.cfg.WhisperPath))
	}
	if resolved, err := exec.LookPath(file); err == nil {
		return resolved
	}
	return file
}

func (p *Processor) prepareStorySpeechCatalog(ctx context.Context, dir string, raw story.Asset, options story.Options) (story.Asset, error) {
	return p.prepareStorySpeechCatalogWithAudio(ctx, dir, raw, options, storyPreparedAudio{})
}

func (p *Processor) prepareStorySpeechCatalogWithAudio(ctx context.Context, dir string, raw story.Asset, options story.Options, audio storyPreparedAudio) (story.Asset, error) {
	asset, err := applyStorySpeechPolicy(raw, options)
	if err != nil {
		return asset, err
	}
	model := p.cfg.StoryWhisperModel
	if model == "" {
		model = p.cfg.WhisperModel
	}
	clockVersion := storyDigest([]any{storyVoiceClockVersion, storyVADArguments, storyModelSignature(p.storyVADModel(model)), storyModelSignature(p.storyVADExecutable())})
	asset.AnalysisVersion = storyDigest([]any{asset.AnalysisVersion, clockVersion})
	spoken := false
	for _, candidate := range asset.Candidates {
		spoken = spoken || len(candidate.Words) > 0
	}
	if !spoken {
		return asset, nil
	}
	intervals, err := p.storyVoiceIntervals(ctx, dir, raw, clockVersion, p.storyVADModel(model), audio)
	if ctx.Err() != nil {
		return asset, ctx.Err()
	}
	if err != nil {
		asset, err = boundStorySpeechToVoice(asset, nil, false)
	} else {
		asset, err = boundStorySpeechToVoice(asset, intervals, true)
	}
	if err == nil && asset.Kind != "narration" && !options.Narration {
		warnings := make([]string, 0, len(asset.Warnings))
		for _, warning := range asset.Warnings {
			if warning != storyNoSpeechWarning && warning != storySpeechTimingWarning && warning != storySpeechLanguageWarning {
				warnings = appendStoryWarning(warnings, warning)
			}
		}
		asset.Warnings = warnings
		spoken, otherLanguage := false, false
		for _, candidate := range asset.Candidates {
			if len(candidate.Words) > 0 {
				spoken = true
				otherLanguage = otherLanguage || (candidate.Language != "ro" && candidate.Language != "en")
			}
		}
		if spoken {
			asset.Warnings = appendStoryWarning(asset.Warnings, storySpeechTimingWarning)
			if otherLanguage {
				asset.Warnings = appendStoryWarning(asset.Warnings, storySpeechLanguageWarning)
			}
		} else {
			asset.Warnings = appendStoryWarning(asset.Warnings, storyNoSpeechWarning)
		}
	}
	return asset, err
}

// This sidecar is intentionally separate from ASR analysis. Older expensive
// transcripts can acquire measured voice bounds without another ASR run.
func (p *Processor) storyVoiceIntervals(ctx context.Context, dir string, asset story.Asset, version, model string, audio storyPreparedAudio) ([]Segment, error) {
	key := path.Dir(asset.ProxyKey) + "/voice-intervals-" + version + ".json"
	file := filepath.Join(dir, "voice-intervals.json")
	if p.materialize(ctx, key, file) == nil {
		data, err := os.ReadFile(file)
		var cached storyVoiceEvidence
		if err == nil && len(data) < 1<<20 && json.Unmarshal(data, &cached) == nil && cached.Version == version && cached.SourceHash == asset.Hash && cached.Duration == asset.Duration && validStoryVoiceIntervals(cached.Intervals, asset.Duration) {
			return cached.Intervals, nil
		}
	}
	var intervals []Segment
	var err error
	if audio.matches(asset.ProxyKey, dir) {
		// ASR and independent VAD use the same mono 16 kHz samples. Reusing
		// those samples changes neither detector settings nor source clocks.
		intervals, err = p.detectStoryVoiceAudio(ctx, dir, audio.file, model, asset.Duration)
	} else {
		var proxy string
		proxy, err = p.storyMaterialize(ctx, dir, asset.ProxyKey)
		if err == nil {
			intervals, err = p.detectStoryVoice(ctx, dir, proxy, model, asset.Duration)
		}
	}
	if err != nil {
		return nil, err
	}
	data, err := json.Marshal(storyVoiceEvidence{version, asset.Hash, asset.Duration, intervals})
	if err != nil || os.WriteFile(file, data, 0600) != nil {
		return nil, storyWorkError("voice evidence")
	}
	if err := p.storySave(ctx, file, key, "application/json"); err != nil {
		return nil, err
	}
	return intervals, nil
}

func (audio storyPreparedAudio) matches(proxyKey, dir string) bool {
	if proxyKey == "" || audio.proxyKey != proxyKey || filepath.Dir(audio.file) != filepath.Clean(dir) {
		return false
	}
	info, err := os.Stat(audio.file)
	return err == nil && info.Mode().IsRegular() && info.Size() > 0
}

func (p *Processor) detectStoryVoice(ctx context.Context, dir, source, model string, duration float64) ([]Segment, error) {
	wav := filepath.Join(dir, "voice-evidence.wav")
	if err := p.ffmpeg(ctx, dir, "-i", source, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav); err != nil {
		return nil, err
	}
	return p.detectStoryVoiceAudio(ctx, dir, wav, model, duration)
}

func (p *Processor) detectStoryVoiceAudio(ctx context.Context, dir, wav, model string, duration float64) ([]Segment, error) {
	args := []string{"--vad-model", model, "--file", wav, "--no-prints"}
	args = append(args, storyVADArguments...)
	output, err := run(ctx, dir, p.storyVADExecutable(), args...)
	if err != nil {
		return nil, err
	}
	return parseStoryVoiceIntervals(output, duration)
}

var storyVADHeader = regexp.MustCompile(`^Detected ([0-9]+) speech segments:$`)
var storyVADLine = regexp.MustCompile(`^Speech segment ([0-9]+): start = ([0-9]+(?:\.[0-9]+)?), end = ([0-9]+(?:\.[0-9]+)?)$`)

func parseStoryVoiceIntervals(output []byte, duration float64) ([]Segment, error) {
	intervals := []Segment{}
	expected := -1
	for _, line := range strings.Split(string(output), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if match := storyVADHeader.FindStringSubmatch(line); match != nil && expected == -1 {
			expected, _ = strconv.Atoi(match[1])
			if expected > 10000 {
				return nil, errors.New("invalid voice interval count")
			}
			continue
		}
		match := storyVADLine.FindStringSubmatch(line)
		if match == nil || expected < 0 {
			return nil, errors.New("unrecognized voice detector output")
		}
		index, _ := strconv.Atoi(match[1])
		start, _ := strconv.ParseFloat(match[2], 64)
		end, _ := strconv.ParseFloat(match[3], 64)
		// Both pinned v1.8.3 and native v1.9.3 report centiseconds.
		start, end = start/100, end/100
		if index != len(intervals) || end > duration+.02 {
			return nil, errors.New("invalid voice detector clock")
		}
		intervals = append(intervals, Segment{start, min(end, duration)})
	}
	if expected != len(intervals) || !validStoryVoiceIntervals(intervals, duration) {
		return nil, errors.New("incomplete voice detector output")
	}
	return intervals, nil
}

func validStoryVoiceIntervals(intervals []Segment, duration float64) bool {
	if !finite(duration) || duration <= 0 || len(intervals) > 10000 {
		return false
	}
	end := 0.0
	for _, interval := range intervals {
		if !finite(interval.Start) || !finite(interval.End) || interval.Start < end || interval.End <= interval.Start || interval.End > duration {
			return false
		}
		end = interval.End
	}
	return true
}

func boundStorySpeechToVoice(asset story.Asset, intervals []Segment, available bool) (story.Asset, error) {
	intervals = storyCaptionVoiceRegions(intervals)
	for i := range asset.Candidates {
		candidate := &asset.Candidates[i]
		if len(candidate.Words) == 0 {
			continue
		}
		words := []story.Word{}
		windowIDs := []int{}
		valid := available
		for _, word := range candidate.Words {
			window := -1
			if !finite(word.Start) || !finite(word.End) || word.End <= word.Start {
				valid = false
				break
			}
			for j, interval := range intervals {
				if min(word.End, interval.End) > max(word.Start, interval.Start) {
					if window != -1 {
						valid = false
						break
					}
					window = j
				}
			}
			if !valid || window == -1 {
				valid = false
				break
			}
			word.Start, word.End = max(word.Start, intervals[window].Start), min(word.End, intervals[window].End)
			if word.Start < candidate.In-.001 || word.End > candidate.Out+.001 {
				valid = false
				break
			}
			if len(words) > 0 && word.Start < words[len(words)-1].End-.001 {
				if windowIDs[len(words)-1] != window {
					valid = false
					break
				}
				// Coarsen overlapping fragments only inside the same measured
				// voice interval. Keep every word in source order; no invented
				// sub-word clock or deletion of a weak negation is permitted.
				last := &words[len(words)-1]
				last.Text += " " + word.Text
				last.Start, last.End = min(last.Start, word.Start), max(last.End, word.End)
			} else {
				words = append(words, word)
				windowIDs = append(windowIDs, window)
			}
		}
		if !valid {
			if asset.Kind == "narration" {
				return asset, fmt.Errorf("narration words at %.2f–%.2f seconds need manual timing review; speech could not be uniquely aligned to measured voice intervals", candidate.In, candidate.Out)
			}
			candidate.Text, candidate.Words, candidate.Role = "", nil, "b_roll"
			candidate.Idea, candidate.Dependencies, candidate.TakeGroup = "", nil, ""
			candidate.Reason = "Complete automatic phrase withheld because its words could not be uniquely aligned to measured voice intervals; original audio is unchanged."
			asset.Warnings = appendStoryWarning(asset.Warnings, fmt.Sprintf("%s at %.2f–%.2f seconds. The complete phrase needs manual timing review; original audio is unchanged.", storyVoiceAlignmentWarning, candidate.In, candidate.Out))
			continue
		}
		candidate.Words = words
	}
	return asset, nil
}

// VAD can split a word around a brief unvoiced consonant. Treat only adjacent
// windows within the caption cue's 250ms pause tolerance as one local region.
// The sidecar retains the exact detector intervals; longer pauses are never
// bridged, so a word spanning distant speech bursts remains ambiguous.
func storyCaptionVoiceRegions(intervals []Segment) []Segment {
	regions := make([]Segment, 0, len(intervals))
	for _, interval := range intervals {
		if len(regions) > 0 && interval.Start-regions[len(regions)-1].End <= .25 {
			regions[len(regions)-1].End = max(regions[len(regions)-1].End, interval.End)
		} else {
			regions = append(regions, interval)
		}
	}
	return regions
}
