package story

import (
	"fmt"
	"math"
	"reflect"
	"sort"
)

// Audio-free visuals can be shortened inside their source interval. Never
// infer silence from an empty transcript: it can also mean unrecognized speech.
func blockSourceInterval(block Block, candidate Candidate, source Asset) (Interval, error) {
	interval := Interval{SourceID: candidate.SourceID, In: candidate.In, Out: candidate.Out}
	if block.Visual == nil {
		return interval, nil
	}
	trim := *block.Visual
	if source.HasAudio || len(candidate.Words) > 0 || candidate.Text != "" || block.BRollID != "" ||
		!finite(trim.In) || !finite(trim.Out) || trim.SourceID != candidate.SourceID ||
		math.Abs(trim.In-candidate.In) > .000001 || trim.Out > candidate.Out || trim.Out <= trim.In || candidate.Out-trim.Out > .35+.000001 {
		return Interval{}, fmt.Errorf("music trim must retain the source start and may shorten only audio-free footage by at most 0.35 seconds")
	}
	return trim, nil
}

// synchronizeMusic changes the saved plan, then derives the executable EDL from
// it. Render, captions, review and the editor therefore all see the same cuts.
func synchronizeMusic(req Request, plan Plan) (Plan, []Entry, *MusicSync, error) {
	build := BuildTimeline
	if req.Options.Narration {
		build = BuildNarrationTimeline
	}
	timeline, err := build(plan, req.Assets)
	if err != nil || req.Options.Music == nil {
		return plan, timeline, nil, err
	}
	result := &MusicSync{Status: "off"}
	if !req.Options.Music.Sync || req.Options.Music.Volume == 0 {
		return plan, timeline, result, nil
	}
	result.Status = "unchanged"
	beats := musicBeats(req.Music, timelineDuration(timeline))
	if len(beats) == 0 || len(timeline) < 2 {
		return plan, timeline, result, nil
	}
	// Editing an existing story must not rewrite approved timing or user locks.
	// New stories may adjust eligible cuts while retaining complete dialogue.
	if req.Base == nil {
		plan = clonePlan(plan)
		all := indexCandidates(req.Assets)
		sources := make(map[string]Asset, len(req.Assets))
		for _, source := range req.Assets {
			sources[source.ID] = source
		}
		for i := 0; i < len(timeline)-1; i++ {
			if plan.Blocks[i].Locked || plan.Blocks[i+1].Locked {
				continue
			}
			boundary := timeline[i].OutputOut
			if nearestBeatDistance(beats, boundary) <= 1.0/60 {
				continue
			}
			choices := nearbyMusicBeats(beats, boundary)
			for _, beat := range choices {
				delta := beat - boundary
				candidate := clonePlan(plan)
				left, right := &candidate.Blocks[i], &candidate.Blocks[i+1]
				if req.Options.Narration {
					if left.Visual == nil || right.Visual == nil || left.Narration == nil || right.Narration == nil {
						continue
					}
					left.Visual.Out += delta
					right.Visual.In += delta
					left.Narration.Out += delta
					right.Narration.In += delta
					if left.Visual.Out-left.Visual.In < .5 || right.Visual.Out-right.Visual.In < .5 {
						continue
					}
				} else {
					if delta >= 0 || timeline[i].OutputOut-timeline[i].OutputIn+delta < .5 {
						continue
					}
					trim := timeline[i].Video
					trim.Out += delta
					left.Visual = &trim
					c := all[left.CandidateID]
					if _, err := blockSourceInterval(*left, c, sources[c.SourceID]); err != nil {
						continue
					}
				}
				updated, buildErr := build(candidate, req.Assets)
				if buildErr != nil {
					continue
				}
				plan, timeline = candidate, updated
				result.AdjustedCuts++
				break
			}
		}
	}
	aligned := 0
	for _, entry := range timeline[:len(timeline)-1] {
		if nearestBeatDistance(beats, entry.OutputOut) <= 1.0/30 {
			aligned++
		}
	}
	if aligned == len(timeline)-1 {
		result.Status = "aligned"
	} else if aligned > 0 || result.AdjustedCuts > 0 {
		result.Status = "partial"
	}
	return plan, timeline, result, nil
}

func musicBeats(prepared *PreparedMusic, duration float64) []float64 {
	if prepared == nil || !finite(prepared.Confidence) || prepared.Confidence < .55 ||
		!finite(prepared.Track.DurationSeconds) || prepared.Track.DurationSeconds <= 0 || len(prepared.Beats) < 3 || len(prepared.Beats) > 20000 {
		return nil
	}
	period := prepared.Track.DurationSeconds
	previous := -1.0
	for _, beat := range prepared.Beats {
		if !finite(beat) || beat <= previous || beat < 0 || beat >= period {
			return nil
		}
		previous = beat
	}
	var beats []float64
	for offset := 0.0; offset < min(duration, 600); offset += period {
		for _, beat := range prepared.Beats {
			if at := offset + beat; at > 0 && at < duration {
				beats = append(beats, at)
				if len(beats) == 20000 {
					return beats
				}
			}
		}
	}
	return beats
}

func nearbyMusicBeats(beats []float64, boundary float64) []float64 {
	var choices []float64
	start := sort.SearchFloat64s(beats, boundary-.35)
	for _, beat := range beats[start:] {
		if beat > boundary+.35 {
			break
		}
		choices = append(choices, beat)
	}
	sort.SliceStable(choices, func(i, j int) bool { return math.Abs(choices[i]-boundary) < math.Abs(choices[j]-boundary) })
	return choices
}

func nearestBeatDistance(beats []float64, boundary float64) float64 {
	i := sort.SearchFloat64s(beats, boundary)
	distance := math.Inf(1)
	if i < len(beats) {
		distance = math.Abs(beats[i] - boundary)
	}
	if i > 0 {
		distance = min(distance, math.Abs(beats[i-1]-boundary))
	}
	return distance
}

func sameBlockIntervals(a, b Block) bool {
	return reflect.DeepEqual(a.Visual, b.Visual) && reflect.DeepEqual(a.Narration, b.Narration)
}
