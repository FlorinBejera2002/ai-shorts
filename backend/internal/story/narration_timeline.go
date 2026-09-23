package story

import (
	"fmt"
	"math"
	"reflect"
	"sort"
)

const MaxNarrationSeconds = 180
const MaxNarrationBytes = 32 << 20
const maxNarrationBlocks = 720

func ValidateNarrationAssets(assets []Asset, options Options) error {
	voices, visuals := 0, 0
	for _, asset := range assets {
		if asset.Kind == "narration" {
			voices++
			if !options.Narration {
				return fmt.Errorf("enable narration mode to use a recorded voice")
			}
			if asset.Include == "excluded" || !asset.HasAudio || !finite(asset.Duration) || asset.Duration <= 0 || asset.Duration > MaxNarrationSeconds || asset.Size <= 0 || asset.Size > MaxNarrationBytes {
				return fmt.Errorf("include one complete recorded narration up to %d seconds and %d MiB", MaxNarrationSeconds, MaxNarrationBytes>>20)
			}
		} else if asset.Include != "excluded" {
			visuals++
		}
	}
	if options.Narration && (voices != 1 || visuals < 1) {
		return fmt.Errorf("narration mode requires exactly one recorded voice and at least one included video")
	}
	return nil
}

func narrationAsset(assets []Asset) Asset {
	for _, asset := range assets {
		if asset.Kind == "narration" {
			return asset
		}
	}
	return Asset{}
}

func narrationWords(voice Asset) ([]Word, error) {
	var words []Word
	for _, candidate := range voice.Candidates {
		words = append(words, candidate.Words...)
	}
	sort.SliceStable(words, func(i, j int) bool { return words[i].Start < words[j].Start })
	var result []Word
	for _, word := range words {
		if !finite(word.Start) || !finite(word.End) || word.Start < 0 || word.End <= word.Start || word.End > voice.Duration+.001 {
			return nil, fmt.Errorf("narration contains invalid original word timing")
		}
		if len(result) > 0 {
			previous := result[len(result)-1]
			if word == previous {
				continue
			}
			if word.Start < previous.End-.001 {
				return nil, fmt.Errorf("narration word timing overlaps ambiguously")
			}
		}
		result = append(result, word)
	}
	return result, nil
}

func narrationVisuals(assets []Asset) []Candidate {
	var candidates []Candidate
	for _, asset := range assets {
		if asset.Kind != "narration" && asset.Include != "excluded" {
			candidates = append(candidates, asset.Candidates...)
		}
	}
	return candidates
}

// BuildNarrationTimeline validates persisted visual trims and derives all audio
// clocks from the original voice. Source-video audio can never enter this EDL.
func BuildNarrationTimeline(plan Plan, assets []Asset) ([]Entry, error) {
	if len(plan.Blocks) > maxNarrationBlocks {
		return nil, fmt.Errorf("narration montage exceeds the supported visual-cut limit")
	}
	voice := narrationAsset(assets)
	if voice.ID == "" {
		return nil, fmt.Errorf("a recorded narration is required")
	}
	words, err := narrationWords(voice)
	if err != nil {
		return nil, err
	}
	all := indexCandidates(assets)
	sources := make(map[string]Asset)
	for _, asset := range assets {
		sources[asset.ID] = asset
	}
	var entries []Entry
	used := make(map[string][]Interval)
	seen := make(map[string]bool)
	clock := 0.0
	for _, block := range plan.Blocks {
		if block.ID == "" || seen[block.ID] {
			return nil, fmt.Errorf("narration visual blocks need unique IDs")
		}
		seen[block.ID] = true
		candidate, found := all[block.CandidateID]
		if !found || sources[candidate.SourceID].Kind == "narration" || sources[candidate.SourceID].Include == "excluded" {
			return nil, fmt.Errorf("visual block %s does not reference included video", block.ID)
		}
		if block.Visual == nil || block.Narration == nil || block.BRollID != "" || block.IdentityReferenceID != "" {
			return nil, fmt.Errorf("visual block %s has no immutable narration/video intervals", block.ID)
		}
		visual, audio := *block.Visual, *block.Narration
		if !finite(visual.In) || !finite(visual.Out) || !finite(audio.In) || !finite(audio.Out) || visual.SourceID != candidate.SourceID || visual.In < candidate.In-.001 || visual.Out > candidate.Out+.001 || visual.Out <= visual.In {
			return nil, fmt.Errorf("visual block %s is outside its known source candidate", block.ID)
		}
		if audio.SourceID != voice.ID || math.Abs(audio.In-clock) > .001 || audio.Out <= audio.In || audio.Out > voice.Duration+.001 || math.Abs((audio.Out-audio.In)-(visual.Out-visual.In)) > .001 {
			return nil, fmt.Errorf("visual block %s would omit, repeat, reorder, or speed-change original narration", block.ID)
		}
		for _, prior := range used[visual.SourceID] {
			if math.Min(prior.Out, visual.Out)-math.Max(prior.In, visual.In) > .001 {
				return nil, fmt.Errorf("visual block %s would repeat previously selected footage", block.ID)
			}
		}
		used[visual.SourceID] = append(used[visual.SourceID], visual)
		if block.Crop != "fit" && block.Crop != "track" {
			return nil, fmt.Errorf("visual block %s has an unsupported crop", block.ID)
		}
		entry := Entry{BlockID: block.ID, CandidateID: block.CandidateID, OutputIn: clock, OutputOut: audio.Out, Video: visual, Audio: &audio, Crop: block.Crop, Transition: "cut"}
		for _, word := range words {
			if word.Start >= clock-.000001 && word.Start < audio.Out-.000001 {
				entry.Words = append(entry.Words, word)
			}
		}
		entries = append(entries, entry)
		clock = audio.Out
	}
	if len(entries) == 0 || math.Abs(clock-voice.Duration) > .001 {
		return nil, fmt.Errorf("visual footage covers %.2fs of %.2fs narration; add enough distinct video to preserve the full recording", clock, voice.Duration)
	}
	return entries, nil
}

func validateNarrationLocks(plan Plan, base *Version) error {
	if base == nil {
		return nil
	}
	byID := make(map[string]int)
	for i, block := range plan.Blocks {
		byID[block.ID] = i
	}
	for oldIndex, old := range base.Plan.Blocks {
		index, found := byID[old.ID]
		if !found {
			if old.Locked || old.LockText || old.LockOrder || old.LockCrop {
				return fmt.Errorf("locked visual block %s was removed", old.ID)
			}
			continue
		}
		updated := plan.Blocks[index]
		if !reflect.DeepEqual(old.Narration, updated.Narration) {
			return fmt.Errorf("narration timing for existing block %s cannot change", old.ID)
		}
		if old.Locked && (!reflect.DeepEqual(old.Visual, updated.Visual) || old.CandidateID != updated.CandidateID || old.Crop != updated.Crop || index != oldIndex) {
			return fmt.Errorf("visual block %s is locked", old.ID)
		}
		if old.LockOrder && index != oldIndex {
			return fmt.Errorf("visual block %s has locked order", old.ID)
		}
		if old.LockCrop && old.Crop != updated.Crop {
			return fmt.Errorf("visual block %s has locked crop", old.ID)
		}
	}
	return nil
}

func validateNarrationPlan(req Request, plan Plan) error {
	if err := validateNarrationLocks(plan, req.Base); err != nil {
		return err
	}
	included := make(map[string]bool)
	for i, block := range plan.Blocks {
		if block.Visual == nil {
			return fmt.Errorf("visual block %s has no source interval", block.ID)
		}
		included[block.Visual.SourceID] = true
		if req.Options.PreserveOrder && i > 0 && plan.Blocks[i-1].Visual != nil && !visualOrderAllowed(*plan.Blocks[i-1].Visual, *block.Visual, req.Assets) {
			return fmt.Errorf("visual block %s contradicts Preserve source order", block.ID)
		}
	}
	for _, asset := range req.Assets {
		if asset.Kind != "narration" && asset.Include == "required" && !included[asset.ID] {
			return fmt.Errorf("required visual source %s is missing from the narration montage", asset.ID)
		}
	}
	return nil
}

func availableVisual(candidate Candidate, used []Interval, duration float64) (Interval, bool) {
	intervals := append([]Interval(nil), used...)
	sort.Slice(intervals, func(i, j int) bool { return intervals[i].In < intervals[j].In })
	start := candidate.In
	for _, prior := range intervals {
		if prior.SourceID != candidate.SourceID || prior.Out <= start {
			continue
		}
		if prior.In-start >= duration-.001 {
			return Interval{candidate.SourceID, start, start + duration}, true
		}
		start = math.Max(start, prior.Out)
	}
	if candidate.Out-start >= duration-.001 {
		return Interval{candidate.SourceID, start, math.Min(start+duration, candidate.Out)}, true
	}
	return Interval{}, false
}

func editNarrationPlan(req Request) (Plan, error) {
	if req.Base == nil || len(req.Base.Plan.Blocks) == 0 {
		return Plan{}, fmt.Errorf("generate a narration montage before editing its visuals")
	}
	if err := ValidateNarrationAssets(req.Assets, req.Options); err != nil {
		return Plan{}, err
	}
	plan := clonePlan(req.Base.Plan)
	if req.Action == "improve_flow" {
		for _, block := range plan.Blocks {
			if !block.Locked {
				return plan, nil
			}
		}
		return Plan{}, fmt.Errorf("all visual blocks are locked; unlock a visual before improving the montage")
	}
	switch req.Action {
	case "resume", "rerender", "improve_transitions":
	case "alternate", "use_alternative", "use_another_take", "regenerate_section":
		found := false
		for i, block := range plan.Blocks {
			if block.ID != req.BlockID {
				continue
			}
			found = true
			if block.Locked {
				return Plan{}, fmt.Errorf("unlock this visual block before replacing its footage")
			}
			if block.Narration == nil {
				return Plan{}, fmt.Errorf("saved visual block has no narration clock")
			}
			var used []Interval
			for j, other := range plan.Blocks {
				if i != j && other.Visual != nil {
					used = append(used, *other.Visual)
				}
			}
			selected := false
			for _, candidate := range narrationVisuals(req.Assets) {
				if req.Action == "regenerate_section" {
					if candidate.ID == block.CandidateID {
						continue
					}
				} else if candidate.ID != req.CandidateID {
					continue
				}
				visual, ok := availableVisual(candidate, used, block.Narration.Out-block.Narration.In)
				if !ok {
					continue
				}
				plan.Blocks[i].CandidateID = candidate.ID
				plan.Blocks[i].Visual = &visual
				plan.Blocks[i].Reason = "Selected another original visual interval while preserving the recorded narration."
				selected = true
				break
			}
			if !selected {
				return Plan{}, fmt.Errorf("choose an included visual candidate with enough unused footage for this narration interval")
			}
		}
		if !found {
			return Plan{}, fmt.Errorf("choose an existing visual block")
		}
	default:
		return Plan{}, fmt.Errorf("this action would change recorded narration; use another visual or improve visual flow")
	}
	if err := validateNarrationPlan(req, plan); err != nil {
		return Plan{}, err
	}
	if _, err := BuildNarrationTimeline(plan, req.Assets); err != nil {
		return Plan{}, err
	}
	setNarrationAlternatives(&plan, req.Assets)
	return plan, nil
}
