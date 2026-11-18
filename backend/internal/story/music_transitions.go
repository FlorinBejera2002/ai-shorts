package story

import "math"

// applyMusicTransitions chooses visual treatment on the saved output clock.
// Existing versions and locks retain their approved treatment. Hosted timing
// evidence is editorial guidance, never a certificate of frame-accurate beats.
func applyMusicTransitions(req Request, plan Plan, timeline []Entry) {
	if req.Base != nil || req.Options.Music == nil || !req.Options.Music.Sync || req.Options.Music.Volume <= 0 || req.Music == nil || req.Music.Analysis == nil || req.Music.Analysis.Model == "" {
		return
	}
	locked := make(map[string]bool, len(plan.Blocks))
	for _, block := range plan.Blocks {
		locked[block.ID] = block.Locked
	}
	candidates := indexCandidates(req.Assets)
	measured := len(measuredMusicEvents(req.Music)) > 0
	events := musicEvidenceOnOutput(req, timelineDuration(timeline))
	for i := 1; i < len(timeline); i++ {
		left, right := &timeline[i-1], &timeline[i]
		if locked[left.BlockID] || locked[right.BlockID] {
			continue
		}
		// A clean cut is explicit: the renderer must not turn it into the
		// legacy automatic blend, including where music has no clear rhythm.
		right.Transition, right.TransitionSeconds = "cut", 0
		at := right.OutputIn
		// A measured attack gets a crisp frame boundary. A dissolve would hide
		// that perceptual alignment even though the saved clock is unchanged.
		if measured && len(eventsBetween(events, musicCutFrame(at)-1.0/30, musicCutFrame(at)+1.0/30)) > 0 {
			continue
		}
		section := musicTransitionSection(req, at)
		if section == nil || section.Confidence < .7 || section.Transition != "dissolve" || section.Energy > .55 || (section.Pace != "slow" && section.Pace != "hold") {
			continue
		}
		// Protect meaningful visible motion. Hosted beat timestamps are not
		// trusted for either timing or treatment decisions.
		if musicTransitionTouchesAction(*left, candidates[left.CandidateID]) || musicTransitionTouchesAction(*right, candidates[right.CandidateID]) {
			continue
		}
		// No overlap is added to the timeline: this is a visual blend centered
		// on the cut, bounded by available footage on both sides.
		duration := min(.5, (left.OutputOut-left.OutputIn)/2, (right.OutputOut-right.OutputIn)/2)
		if duration >= .1 {
			right.Transition, right.TransitionSeconds = "crossfade", math.Round(duration*30)/30
		}
	}
}

// Narrated edits keep their usual transition treatment except where a verified
// attack explicitly calls for a crisp cut. Saved/manual versions stay intact.
func applyMeasuredMusicCuts(req Request, plan Plan, timeline []Entry) {
	if req.Base != nil || req.Options.Music == nil || !req.Options.Music.Sync || req.Options.Music.Volume <= 0 || len(measuredMusicEvents(req.Music)) == 0 {
		return
	}
	locked := make(map[string]bool, len(plan.Blocks))
	for _, block := range plan.Blocks {
		locked[block.ID] = block.Locked
	}
	events := musicEvidenceOnOutput(req, timelineDuration(timeline))
	for i := 1; i < len(timeline); i++ {
		if locked[timeline[i-1].BlockID] || locked[timeline[i].BlockID] {
			continue
		}
		at := musicCutFrame(timeline[i].OutputIn)
		if len(eventsBetween(events, at-1.0/30, at+1.0/30)) > 0 {
			timeline[i].Transition, timeline[i].TransitionSeconds = "cut", 0
		}
	}
}

func musicTransitionSection(req Request, outputTime float64) *MusicSection {
	period := req.Music.Track.DurationSeconds
	if !finite(period) || period <= 0 || outputTime < 0 {
		return nil
	}
	if outputTime >= period && !req.Options.Music.Repeats() {
		return nil
	}
	at := math.Mod(outputTime, period)
	for i := range req.Music.Analysis.Sections {
		section := &req.Music.Analysis.Sections[i]
		if finite(section.Start) && finite(section.End) && finite(section.Energy) && finite(section.Confidence) && section.Start <= at && section.End > at {
			return section
		}
	}
	return nil
}

func musicTransitionTouchesAction(entry Entry, candidate Candidate) bool {
	if candidate.SourceID != entry.Video.SourceID || !validVisualMoment(candidate) {
		// Missing motion evidence (including a B-roll replacement) is not
		// evidence of idle handles. Retain the crisp cut in that case.
		return true
	}
	// Protect the whole verified action, not just an optional peak. Dissolves
	// are permitted only in idle handles outside the action envelope.
	return candidate.Moment.In < entry.Video.In+.3 || candidate.Moment.Out > entry.Video.Out-.3
}
