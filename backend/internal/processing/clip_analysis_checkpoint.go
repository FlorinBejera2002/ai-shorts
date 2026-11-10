package processing

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
)

// clipAnalysisVersion changes whenever transcription or highlight selection
// changes in a way that invalidates previously saved analysis.
const clipAnalysisVersion = "clip-analysis-1"

// clipAnalysis is the job-scoped checkpoint of the two expensive analysis
// stages: speech recognition and LLM highlight selection. A recovered or
// re-queued job (lease expiry, audio retry) reuses it instead of paying for
// transcription and a new completion again, and keeps the same clip choices.
type clipAnalysis struct {
	Digest     string      `json:"digest"`
	Transcript Transcript  `json:"transcript"`
	Highlights []highlight `json:"highlights"`
}

// clipAnalysisKey is content addressed. Every input that can change the
// transcript or the highlight choice is part of the digest, so a stale
// checkpoint is never matched. It lives under work/<job>/, outside the
// per-attempt namespace that failed attempts delete, and is removed with the
// owner's account data.
func (p *Processor) clipAnalysisKey(in Input, jobID, sourceHash string, duration float64) (key, digest string) {
	digest = storyDigest([]any{clipAnalysisVersion, sourceHash, duration, in.Language, in.RequestedClips, in.Instructions, storyModelSignature(p.cfg.WhisperModel), storyModelSignature(p.storyVADModel(p.cfg.WhisperModel))})
	return "work/" + jobID + "/clip-analysis/" + digest + ".json", digest
}

func (p *Processor) loadClipAnalysis(ctx context.Context, dir, key, digest string) (clipAnalysis, bool) {
	file := filepath.Join(dir, "clip-analysis.json")
	defer os.Remove(file)
	if p.materialize(ctx, key, file) != nil {
		return clipAnalysis{}, false
	}
	data, err := os.ReadFile(file)
	var saved clipAnalysis
	if err != nil || len(data) > 32<<20 || json.Unmarshal(data, &saved) != nil {
		return clipAnalysis{}, false
	}
	if saved.Digest != digest || saved.Transcript.Text == "" || len(saved.Highlights) == 0 {
		return clipAnalysis{}, false
	}
	return saved, true
}

// saveClipAnalysis is best effort: a missing checkpoint only costs a later
// retry the original analysis time, so it never fails the current job.
func (p *Processor) saveClipAnalysis(ctx context.Context, dir, key string, analysis clipAnalysis) {
	data, err := json.Marshal(analysis)
	if err != nil {
		return
	}
	file := filepath.Join(dir, "clip-analysis.json")
	defer os.Remove(file)
	if os.WriteFile(file, data, 0600) != nil {
		return
	}
	_ = p.storySave(ctx, file, key, "application/json")
}
