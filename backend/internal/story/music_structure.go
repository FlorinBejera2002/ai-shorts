package story

import "math"

func musicPacingSection(sections []MusicSection, at float64) *MusicSection {
	for i := range sections {
		if at >= sections[i].Start && at < sections[i].End {
			return &sections[i]
		}
	}
	return nil
}

// These alternatives shorten only verified idle handles. Their clocks come
// from source action evidence and the requested duration, never song events.
func musicStructureWindowChoices(block Block, candidate Candidate, source Asset, section *MusicSection, share float64) []Interval {
	base, err := blockSourceInterval(block, candidate, source)
	if err != nil {
		return nil
	}
	choices := []Interval{base}
	if section == nil || section.Confidence < .7 || !validVisualMoment(candidate) || block.Visual != nil || block.Pace != nil || block.BRollID != "" || (!block.MuteSourceAudio && (source.HasAudio || candidate.Text != "" || len(candidate.Words) > 0)) {
		return choices
	}
	retained := musicPacingHandleFraction(section.Pace)
	if retained >= 1 {
		return choices
	}
	core := candidate.Moment.Out - candidate.Moment.In
	handles := candidate.Out - candidate.In - core
	if handles <= .001 {
		return choices
	}
	durations := []float64{core + handles*retained}
	if section.Pace == "fast" || section.Pace == "moderate" {
		durations = append(durations, share)
	}
	for _, duration := range durations {
		if !finite(duration) || duration < max(.5, core) || duration >= base.Out-base.In-.001 {
			continue
		}
		// Keep the same fraction of each observed idle handle. This preserves
		// action preparation/completion and avoids inventing a highlight clock.
		fraction := (duration - core) / handles
		in := candidate.Moment.In - (candidate.Moment.In-candidate.In)*fraction
		out := candidate.Moment.Out + (candidate.Out-candidate.Moment.Out)*fraction
		window := Interval{SourceID: candidate.SourceID, In: in, Out: out}
		if window.In <= candidate.Moment.In && window.Out >= candidate.Moment.Out {
			choices = append(choices, window)
		}
	}
	return choices
}

func musicPacingHandleFraction(pace string) float64 {
	switch pace {
	case "fast":
		return .35
	case "moderate":
		return .65
	case "slow":
		return .9
	default:
		return 1
	}
}

func musicStructureWindowScore(section *MusicSection, interval Interval, candidate Candidate) float64 {
	if section == nil || section.Confidence < .7 || !validVisualMoment(candidate) {
		return 0
	}
	core := candidate.Moment.Out - candidate.Moment.In
	handles := candidate.Out - candidate.In - core
	if handles <= .001 {
		return 0
	}
	retained := (interval.Out - interval.In - core) / handles
	return -1.2 * section.Confidence * math.Abs(retained-musicPacingHandleFraction(section.Pace))
}

// Map section evidence to the same excerpt/repeat clock used by the renderer.
// Missing or low-confidence passages remain undescribed, never extrapolated.
func musicSectionsOnOutput(req Request, duration float64) []MusicSection {
	if req.Music == nil || req.Music.Analysis == nil || req.Options.Music == nil || !finite(duration) || duration <= 0 {
		return nil
	}
	period := req.Music.Track.DurationSeconds
	if !finite(period) || period <= 0 {
		return nil
	}
	var sections []MusicSection
	for offset := 0.0; offset < min(duration, 600); offset += period {
		for _, section := range req.Music.Analysis.Sections {
			if !finite(section.Start) || !finite(section.End) || section.Start < 0 || section.End <= section.Start || section.End > period+.002 || !finite(section.Confidence) || section.Confidence < .55 || section.Confidence > 1 || !finite(section.Energy) || section.Energy < 0 || section.Energy > 1 {
				continue
			}
			section.Start += offset
			section.End = min(section.End+offset, duration)
			if section.Start < duration {
				sections = append(sections, section)
			}
			if len(sections) == 128 {
				return sections
			}
		}
		if !req.Options.Music.Repeats() {
			break
		}
	}
	return sections
}

// Pacing is a soft preference, applied only to timing choices already proven
// to preserve a complete source action. It never manufactures a new cut.
func musicPacingPenalty(sections []MusicSection, start, end float64) float64 {
	if end <= start {
		return 0
	}
	for _, section := range sections {
		if (start+end)/2 < section.Start || (start+end)/2 >= section.End {
			continue
		}
		var minimum float64
		switch section.Pace {
		case "hold":
			minimum = min(8, section.End-section.Start)
		case "slow":
			minimum = 4
		case "moderate":
			minimum = 2
		case "fast":
			minimum = 1
		default:
			return 0
		}
		if minimum <= 0 {
			return 0
		}
		return .8 * section.Confidence * math.Max(0, 1-(end-start)/minimum)
	}
	return 0
}

// Explicit music-only playback overrides the ordinary source-speech playback
// default; it never authorizes invented visual claims or muted-word captions.
func sourceAudioEditorialPolicy(options Options) string {
	if !UsesMusicOnlyAudio(options) || options.Narration {
		return ""
	}
	return `SOURCE AUDIO CHOICE: The user explicitly selected music-only playback. Video-source audio, including dialogue, is muted and no dialogue captions may be emitted. Candidate transcripts remain provenance only, not audible narration or evidence that the viewer will hear a claim. Select and review complete visible actions and coherent visual meaning. Do not require retention of muted source words merely for audio continuity, and do not invent text or narration to replace them. Explicit source inclusion, exclusion, visual dependencies, chronology and locks remain binding. `
}
