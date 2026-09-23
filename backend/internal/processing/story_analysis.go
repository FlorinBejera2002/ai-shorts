package processing

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"strings"

	"sneepcut/backend-go/internal/story"
)

// Analyze persists immutable, source/settings-addressed artifacts. Retrying an
// editorial operation reuses the transcript and proxy without another ASR run.
func (p *Processor) Analyze(ctx context.Context, project string, asset story.Asset, options story.Options) (story.Asset, error) {
	if asset.Kind == "narration" {
		return p.analyzeNarration(ctx, project, asset, options)
	}
	if !storyNamespace(project) || !storyNamespace(asset.ID) || len(asset.Hash) != 64 || !finite(asset.Duration) || asset.Duration <= 0 {
		return asset, errors.New("invalid story source")
	}
	dir, err := os.MkdirTemp(p.cfg.TempDir, "story-analysis-")
	if err != nil {
		return asset, storyWorkError("analysis")
	}
	defer os.RemoveAll(dir)
	model := p.cfg.StoryWhisperModel
	if model == "" {
		model = p.cfg.WhisperModel
	}
	digest := storyDigest([]any{story.AlgorithmVersion, asset.Hash, options.Language, storyModelSignature(model), options.Narration, "source-analysis-6"})
	prefix := "work/" + project + "/analysis/" + asset.ID + "/" + digest
	cacheKey := prefix + "/analysis.json"
	cacheFile := filepath.Join(dir, "analysis.json")
	if p.materialize(ctx, cacheKey, cacheFile) == nil {
		data, e := os.ReadFile(cacheFile)
		var cached story.Asset
		if e == nil && len(data) < 8<<20 && json.Unmarshal(data, &cached) == nil && cached.Hash == asset.Hash && cached.ID == asset.ID && cached.AnalysisVersion == digest {
			if exists, e := p.storage.Exists(ctx, cached.ProxyKey); e == nil && exists {
				// User overrides are not analysis inputs and must survive cache reuse.
				cached.Order, cached.Role, cached.Include, cached.Name = asset.Order, asset.Role, asset.Include, asset.Name
				// Semantic annotations live in the run checkpoint rather than the
				// immutable local-ASR cache. Retain only their permitted fields when
				// they still refer to the exact same local analysis and intervals.
				if asset.AnalysisVersion == digest && asset.SemanticAnalysisVersion != "" {
					previous := map[string]story.Candidate{}
					for _, c := range asset.Candidates {
						previous[c.ID] = c
					}
					valid := len(previous) == len(cached.Candidates)
					for _, c := range cached.Candidates {
						old, ok := previous[c.ID]
						valid = valid && ok && old.SourceID == c.SourceID && old.In == c.In && old.Out == c.Out && old.Text == c.Text
					}
					if valid {
						cached.SemanticAnalysisVersion = asset.SemanticAnalysisVersion
						for i := range cached.Candidates {
							c := &cached.Candidates[i]
							old := previous[c.ID]
							c.Role, c.Idea, c.Reason = old.Role, old.Idea, old.Reason
							c.Dependencies = append([]string(nil), old.Dependencies...)
						}
						for _, warning := range asset.Warnings {
							cached.Warnings = appendStoryWarning(cached.Warnings, warning)
						}
					}
				}
				return cached, nil
			}
		}
	}
	source, err := p.storyMaterialize(ctx, dir, asset.Key)
	proxy := filepath.Join(dir, "proxy.mp4")
	if err != nil {
		return asset, errors.New("source is no longer available")
	}
	// The demuxer rebases the common presentation clock; async resampling fills
	// real audio gaps. No speed changes or frame-index arithmetic are applied.
	args := []string{"-i", source, "-map", "0:v:0", "-vf", "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30:start_time=0,setsar=1"}
	if options.Narration {
		args = append(args, "-an")
	} else {
		args = append(args, "-map", "0:a:0?", "-af", "aresample=48000:async=1:first_pts=0")
	}
	args = append(args, delivery...)
	args = append(args, "-t", seconds(asset.Duration), "-map_metadata", "-1", proxy)
	if p.ffmpeg(ctx, dir, args...) != nil {
		return asset, storyWorkError("source normalization")
	}
	info, err := p.probe(ctx, proxy)
	if err != nil || math.Abs(info.Duration-asset.Duration) > .12 {
		return asset, errors.New("source timestamps could not be normalized reliably")
	}
	asset.ProxyKey = prefix + "/proxy.mp4"
	asset.Mapping.NormalizedStart, asset.Mapping.Rate = 0, 1
	asset.Mapping.Duration = min(info.Duration, asset.Duration)
	asset.AnalysisVersion = digest
	asset.SemanticAnalysisVersion = ""
	if err = p.storySave(ctx, proxy, asset.ProxyKey, "video/mp4"); err != nil {
		return asset, err
	}
	thumb := filepath.Join(dir, "thumbnail.jpg")
	if p.ffmpeg(ctx, dir, "-i", proxy, "-ss", seconds(min(.25, asset.Duration/2)), "-frames:v", "1", "-vf", "scale=320:-2", "-q:v", "3", thumb) == nil {
		asset.ThumbnailKey = prefix + "/thumbnail.jpg"
		if err = p.storySave(ctx, thumb, asset.ThumbnailKey, "image/jpeg"); err != nil {
			return asset, err
		}
	}
	audio, visual, err := p.storyQuality(ctx, dir, proxy, info)
	if err != nil {
		return asset, err
	}
	var transcript Transcript
	if !options.Narration && info.Audio && audio > .01 {
		transcript, err = p.transcribeModel(ctx, proxy, dir, options.Language, asset.Duration, model)
		if err != nil && !strings.Contains(err.Error(), "no speech detected") {
			return asset, errors.New("aligned transcription is unavailable; retry after the speech engine is ready")
		}
	}
	asset.Candidates = storyCandidates(asset, transcript, audio, visual)
	if options.Narration {
		asset.Candidates = narrationVisualWindows(asset, visual)
	}
	if stat, e := os.Stat(filepath.Join(dir, "transcript.json")); e == nil && stat.Size() < 8<<20 {
		if raw, e := os.ReadFile(filepath.Join(dir, "transcript.json")); e == nil {
			storyTranscriptConfidence(raw, asset.Candidates)
		}
	}
	if pcm, e := os.Open(filepath.Join(dir, "quality.pcm")); e == nil {
		for i := range asset.Candidates {
			candidate := &asset.Candidates[i]
			candidate.AudioScore = storyIntervalAudio(pcm, candidate.In, candidate.Out)
		}
		_ = pcm.Close()
	}
	if options.Narration {
		asset.Warnings = appendStoryWarning(asset.Warnings, "Narration mode: original video audio is muted; visual windows require source-backed matching to the narration.")
	} else if len(transcript.Words) == 0 {
		asset.Warnings = append(asset.Warnings, "No confident speech transcript. This source remains available as a supporting visual; audio needs human review.")
	} else {
		asset.Warnings = append(asset.Warnings, "Speech timestamps are estimates; the rendered audio is reviewed before the story is marked Ready.")
		if transcript.Language != "ro" && transcript.Language != "en" {
			asset.Warnings = append(asset.Warnings, "Detected language is outside the Romanian/English evaluation set; review language and transcription.")
		}
	}
	data, err := json.Marshal(asset)
	if err != nil || os.WriteFile(cacheFile, data, 0600) != nil {
		return asset, storyWorkError("analysis checkpoint")
	}
	if err = p.storySave(ctx, cacheFile, cacheKey, "application/json"); err != nil {
		return asset, err
	}
	return asset, nil
}

// Scores describe measured signal quality, not a claim of factual or semantic
// correctness. The planner keeps them separate and the media reviewer listens.
func (p *Processor) storyQuality(ctx context.Context, dir, file string, info probeInfo) (float64, float64, error) {
	audio := 0.0
	if info.Audio {
		pcm := filepath.Join(dir, "quality.pcm")
		if p.ffmpeg(ctx, dir, "-i", file, "-vn", "-ac", "1", "-ar", "8000", "-c:a", "pcm_s16le", "-f", "s16le", pcm) != nil {
			return 0, 0, storyWorkError("audio analysis")
		}
		f, err := os.Open(pcm)
		if err != nil {
			return 0, 0, storyWorkError("audio analysis")
		}
		buffer := make([]byte, 16000)
		var energy, clipped, count float64
		for {
			n, e := f.Read(buffer)
			for i := 0; i+1 < n; i += 2 {
				v := float64(int16(binary.LittleEndian.Uint16(buffer[i:i+2]))) / 32768
				energy += v * v
				count++
				if math.Abs(v) > .99 {
					clipped++
				}
			}
			if e != nil {
				break
			}
			if ctx.Err() != nil {
				_ = f.Close()
				return 0, 0, ctx.Err()
			}
		}
		_ = f.Close()
		if count > 0 {
			rms := math.Sqrt(energy / count)
			if rms > .001 {
				audio = max(.05, min(1, rms/.08)) * (1 - min(.8, clipped/count*20))
			}
		}
	}
	raw := filepath.Join(dir, "quality.gray")
	// Round the final sampling interval upward so valid subsecond reaction and
	// B-roll sources still provide one actual frame instead of an empty stream.
	if p.ffmpeg(ctx, dir, "-i", file, "-an", "-vf", "fps=1:round=up,scale=48:28", "-pix_fmt", "gray", "-f", "rawvideo", raw) != nil {
		return 0, 0, storyWorkError("image analysis")
	}
	f, err := os.Open(raw)
	if err != nil {
		return 0, 0, storyWorkError("image analysis")
	}
	defer f.Close()
	frame := make([]byte, 48*28)
	frames, score := 0, 0.0
	for {
		_, err = io.ReadFull(f, frame)
		if err == io.EOF {
			break
		}
		if err != nil {
			return 0, 0, storyWorkError("image analysis")
		}
		var mean, contrast float64
		for _, v := range frame {
			mean += float64(v) / float64(len(frame))
		}
		for _, v := range frame {
			contrast += math.Abs(float64(v)-mean) / float64(len(frame))
		}
		exposure := max(0, 1-math.Abs(mean-127)/127)
		score += .55*exposure + .45*min(1, contrast/40)
		frames++
	}
	if frames == 0 {
		return 0, 0, storyWorkError("image analysis")
	}
	return audio, score / float64(frames), nil
}

func storyCandidates(asset story.Asset, transcript Transcript, audio, visual float64) []story.Candidate {
	var groups [][]story.Word
	var current []story.Word
	for _, word := range transcript.Words {
		if strings.TrimSpace(word.Text) == "" {
			continue
		}
		if !finite(word.Start) || !finite(word.End) || word.Start < 0 || word.End <= word.Start || word.End > asset.Duration+.04 {
			continue
		}
		if len(current) > 0 && word.Start-current[len(current)-1].End > .75 {
			groups = append(groups, current)
			current = nil
		}
		current = append(current, story.Word{Text: word.Text, Start: word.Start, End: min(asset.Duration, word.End)})
		if strings.ContainsAny(strings.TrimSpace(word.Text[len(word.Text)-1:]), ".!?") {
			groups = append(groups, current)
			current = nil
		}
	}
	if len(current) > 0 {
		groups = append(groups, current)
	}
	result := make([]story.Candidate, 0, len(groups))
	for i, words := range groups {
		texts := make([]string, len(words))
		for j, word := range words {
			texts[j] = word.Text
		}
		start, end := max(0, words[0].Start-.12), min(asset.Duration, words[len(words)-1].End+.18)
		if i > 0 {
			start = max(start, groups[i-1][len(groups[i-1])-1].End)
		}
		if i+1 < len(groups) {
			end = min(end, groups[i+1][0].Start)
		}
		result = append(result, story.Candidate{ID: fmt.Sprintf("%s-s%d", asset.ID, i+1), SourceID: asset.ID, In: start, Out: end, Text: strings.Join(texts, " "), Words: words, Language: transcript.Language, Speaker: "unknown", Role: "a_roll", AudioScore: audio, VisualScore: visual, Confidence: 0, Reason: "Aligned source phrase with measured phrase audio level/clipping and source image exposure/contrast; ASR confidence is unavailable until token evidence is read, and speaker/meaning require actual media review."})
	}
	if len(result) == 0 {
		for start := 0.0; start < asset.Duration; start += 8 {
			result = append(result, story.Candidate{ID: fmt.Sprintf("%s-v%d", asset.ID, len(result)+1), SourceID: asset.ID, In: start, Out: min(asset.Duration, start+8), Words: []story.Word{}, Role: "b_roll", AudioScore: audio, VisualScore: visual, Confidence: .5, Reason: "Source has no reliable speech transcript; retain as a supporting visual pending relevance review."})
		}
	}
	return result
}

// Token confidence is evidence supplied by whisper.cpp, not a fabricated
// global confidence score. A weak negation or number remains visible through
// the minimum lexical-token probability; this is not a factual truth score.
func storyTranscriptConfidence(raw []byte, candidates []story.Candidate) {
	var doc struct {
		Transcription []struct {
			Tokens []struct {
				Text        string
				Probability *float64 `json:"p"`
				Offsets     *struct{ From, To float64 }
			}
		}
	}
	if json.Unmarshal(raw, &doc) != nil {
		return
	}
	for i := range candidates {
		candidate := &candidates[i]
		if len(candidate.Words) == 0 {
			continue
		}
		minimum, count := 1.0, 0
		for _, segment := range doc.Transcription {
			for _, token := range segment.Tokens {
				if token.Offsets == nil || token.Probability == nil || strings.HasPrefix(token.Text, "[_") || strings.TrimSpace(token.Text) == "" {
					continue
				}
				probability := *token.Probability
				if !finite(probability) || probability < 0 || probability > 1 || token.Offsets.From/1000 < candidate.In || token.Offsets.To/1000 > candidate.Out {
					continue
				}
				minimum = min(minimum, probability)
				count++
			}
		}
		if count > 0 {
			candidate.Confidence = minimum
			candidate.Reason = fmt.Sprintf("Complete aligned phrase; lowest lexical-token ASR probability %.3f. Audio score measures this phrase's level/clipping; visual score measures source exposure/contrast. Meaning and speaker require actual media review.", minimum)
		}
	}
}

func storyIntervalAudio(file *os.File, start, end float64) float64 {
	reader := io.NewSectionReader(file, int64(start*8000)*2, int64((end-start)*8000)*2)
	buffer := make([]byte, 8000)
	var energy, clipped, count float64
	for {
		n, err := reader.Read(buffer)
		for i := 0; i+1 < n; i += 2 {
			v := float64(int16(binary.LittleEndian.Uint16(buffer[i:i+2]))) / 32768
			energy += v * v
			count++
			if math.Abs(v) > .99 {
				clipped++
			}
		}
		if err != nil {
			break
		}
	}
	if count == 0 {
		return 0
	}
	rms := math.Sqrt(energy / count)
	if rms <= .001 {
		return 0
	}
	return max(.05, min(1, rms/.08)) * (1 - min(.8, clipped/count*20))
}
