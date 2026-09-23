package story

import (
	"crypto/sha256"
	"fmt"
	"math"
	"sort"
	"strings"
	"unicode"
)

// EquivalentTakes deliberately requires every lexical token to match. In
// particular numbers, units, negation and qualifications cannot disappear into
// a fuzzy semantic similarity score. Unknown speakers are certified only when
// both candidates reference the exact same original interval.
func EquivalentTakes(a, b Candidate) bool {
	if a.Text == "" || lexical(a.Text) != lexical(b.Text) {
		return false
	}
	if a.Speaker == "" || b.Speaker == "" || a.Speaker == "unknown" || b.Speaker == "unknown" {
		return a.SourceID == b.SourceID && math.Abs(a.In-b.In) < .001 && math.Abs(a.Out-b.Out) < .001
	}
	return a.Speaker == b.Speaker && a.Language == b.Language
}

// CompatibleTake permits a provisional alternate when identity is not yet
// known. Such a selection still needs source-media identity comparison before
// delivery; it is never used for automatic deduplication.
func CompatibleTake(a, b Candidate) bool {
	if a.Text == "" || lexical(a.Text) != lexical(b.Text) || a.Language != b.Language {
		return false
	}
	return !knownSpeaker(a.Speaker) || !knownSpeaker(b.Speaker) || a.Speaker == b.Speaker
}

func knownSpeaker(speaker string) bool { return speaker != "" && speaker != "unknown" }

func NeedsSourceIdentity(a, b Candidate) bool {
	differentInterval := a.SourceID != b.SourceID || math.Abs(a.In-b.In) >= .001 || math.Abs(a.Out-b.Out) >= .001
	return differentInterval && CompatibleTake(a, b) && (!knownSpeaker(a.Speaker) || !knownSpeaker(b.Speaker))
}

func lexical(s string) string {
	var out strings.Builder
	for _, r := range strings.ToLower(s) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '%' || r == '.' || r == ',' || r == '-' {
			out.WriteRune(r)
		} else {
			out.WriteByte(' ')
		}
	}
	// Preserve punctuation inside numbers (1.5 is different from 15), but ignore
	// sentence punctuation when comparing complete, otherwise identical takes.
	return strings.Trim(strings.Join(strings.Fields(out.String()), " "), "., ")
}

func indexCandidates(assets []Asset) map[string]Candidate {
	result := make(map[string]Candidate)
	for _, a := range assets {
		for _, c := range a.Candidates {
			result[c.ID] = c
		}
	}
	return result
}

func prepareCandidates(assets []Asset) error {
	ids := make(map[string]bool)
	for ai := range assets {
		a := &assets[ai]
		sort.SliceStable(a.Candidates, func(i, j int) bool { return a.Candidates[i].In < a.Candidates[j].In })
		for ci := range a.Candidates {
			c := &a.Candidates[ci]
			if c.SourceID != "" && c.SourceID != a.ID {
				return fmt.Errorf("analysis returned a candidate from another source")
			}
			c.SourceID = a.ID
			if c.ID == "" {
				c.ID = fmt.Sprintf("%s-%03d", a.ID, ci+1)
			}
			if ids[c.ID] {
				return fmt.Errorf("analysis returned duplicate candidate IDs")
			}
			ids[c.ID] = true
			if !finite(c.In) || !finite(c.Out) || c.In < 0 || c.Out <= c.In || c.Out > a.Duration+.001 {
				return fmt.Errorf("candidate %s is outside its original source", c.ID)
			}
			if a.Role != "" && a.Role != "auto" {
				c.Role = a.Role
			}
			if !validRole(c.Role) {
				if strings.TrimSpace(c.Text) == "" {
					c.Role = "b_roll"
				} else {
					c.Role = "a_roll"
				}
			}
			previous := c.In
			for _, w := range c.Words {
				if !finite(w.Start) || !finite(w.End) || w.Start < c.In-.001 || w.Start < previous-.001 || w.End <= w.Start || w.End > c.Out+.001 {
					return fmt.Errorf("candidate %s has invalid aligned words", c.ID)
				}
				previous = w.End
			}
			if strings.TrimSpace(c.Text) != "" && !a.HasAudio {
				return fmt.Errorf("silent source contains an invented transcript")
			}
			if c.Idea == "" {
				c.Idea = c.Text
			}
			// A dependent opening cannot become a hook merely because it sounds
			// engaging. Its preceding source phrase must also be selected.
			if needsContext(c.Text) && ci > 0 && len(c.Dependencies) == 0 {
				c.Dependencies = appendUnique(c.Dependencies, a.Candidates[ci-1].ID)
			}
		}
	}
	all := indexCandidates(assets)
	for ai := range assets {
		for ci := range assets[ai].Candidates {
			c := &assets[ai].Candidates[ci]
			for _, dep := range c.Dependencies {
				if _, ok := all[dep]; !ok || dep == c.ID {
					return fmt.Errorf("candidate has an invalid context dependency")
				}
			}
			// Conservative grouping works across files only after speaker identity was
			// established by analysis; a transcript alone does not prove identity.
			identity := c.Speaker
			if identity == "" || identity == "unknown" {
				identity = "unverified-candidate:" + c.ID
			}
			if c.Text != "" {
				c.TakeGroup = fmt.Sprintf("take-%x", sha256.Sum256([]byte(identity+"|"+c.Language+"|"+lexical(c.Text))))[:21]
			}
		}
	}
	return nil
}

func needsContext(text string) bool {
	s := strings.ToLower(strings.TrimSpace(text))
	for _, prefix := range []string{"de aceea", "din acest motiv", "după aceea", "dupa aceea", "așa cum", "asa cum", "cum am spus", "acesta", "aceasta", "astfel", "therefore", "that's why", "that is why", "as i said", "as mentioned", "after that", "because of this", "this means", "then ", "however", "totuși", "totusi"} {
		if strings.HasPrefix(s, prefix) {
			return true
		}
	}
	return false
}

func appendUnique(values []string, value string) []string {
	for _, v := range values {
		if v == value {
			return values
		}
	}
	return append(values, value)
}

func alternatives(c Candidate, all map[string]Candidate) []string {
	var candidates []Candidate
	for _, other := range all {
		if other.ID != c.ID && CompatibleTake(c, other) {
			candidates = append(candidates, other)
		}
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		if candidateQuality(candidates[i]) == candidateQuality(candidates[j]) {
			return candidates[i].ID < candidates[j].ID
		}
		return candidateQuality(candidates[i]) > candidateQuality(candidates[j])
	})
	result := make([]string, 0, len(candidates))
	for _, other := range candidates {
		result = append(result, other.ID)
	}
	return result
}

func candidateQuality(c Candidate) float64 {
	return c.AudioScore*.65 + c.VisualScore*.2 + c.Confidence*.15
}
