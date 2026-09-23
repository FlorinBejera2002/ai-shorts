package story

const maxEditorialJSONBytes = 700_000

// Semantic review needs both clocks to link findings to the selected blocks.
// Aligned word arrays remain internal; whole phrase text is carried separately.
type editorialEntry struct {
	BlockID     string    `json:"block_id"`
	CandidateID string    `json:"candidate_id"`
	OutputIn    float64   `json:"output_in"`
	OutputOut   float64   `json:"output_out"`
	Video       Interval  `json:"video"`
	Audio       *Interval `json:"audio,omitempty"`
}

func editorialTimeline(timeline []Entry) []editorialEntry {
	entries := make([]editorialEntry, 0, len(timeline))
	for _, e := range timeline {
		entries = append(entries, editorialEntry{e.BlockID, e.CandidateID, e.OutputIn, e.OutputOut, e.Video, e.Audio})
	}
	return entries
}

// editorialCandidate retains complete phrase meaning and provenance without
// repeating every aligned word's text and timestamps in text-only AI requests.
// Word alignment stays on Candidate for executable timeline/caption validation.
type editorialCandidate struct {
	ID             string   `json:"id"`
	SourceID       string   `json:"source_id"`
	SourceOrder    int      `json:"source_order"`
	SourceInclude  string   `json:"source_include"`
	SourceWarnings []string `json:"source_warnings,omitempty"`
	In             float64  `json:"in"`
	Out            float64  `json:"out"`
	Text           string   `json:"text"`
	Language       string   `json:"language"`
	Speaker        string   `json:"speaker"`
	Role           string   `json:"role"`
	Idea           string   `json:"idea,omitempty"`
	Dependencies   []string `json:"dependencies"`
	TakeGroup      string   `json:"take_group"`
	AudioScore     float64  `json:"audio_score"`
	VisualScore    float64  `json:"visual_score"`
	Confidence     float64  `json:"confidence"`
	Reason         string   `json:"reason"`
}

func editorialCandidates(assets []Asset, includeExcluded bool) []editorialCandidate {
	var summaries []editorialCandidate
	for _, asset := range assets {
		if asset.Include == "excluded" && !includeExcluded {
			continue
		}
		for _, c := range asset.Candidates {
			idea := c.Idea
			if idea == c.Text {
				idea = ""
			}
			summaries = append(summaries, editorialCandidate{ID: c.ID, SourceID: c.SourceID, SourceOrder: asset.Order, SourceInclude: asset.Include, SourceWarnings: asset.Warnings, In: c.In, Out: c.Out, Text: c.Text, Language: c.Language, Speaker: c.Speaker, Role: c.Role, Idea: idea, Dependencies: c.Dependencies, TakeGroup: c.TakeGroup, AudioScore: c.AudioScore, VisualScore: c.VisualScore, Confidence: c.Confidence, Reason: c.Reason})
		}
	}
	return summaries
}
