package story

import (
	"math"
	"regexp"
	"sort"
	"strings"
	"unicode"
)

// A report is a collection of findings, not a set of type/block labels. Match
// existing findings one-to-one so an extra defect in the same block cannot hide
// behind an older finding of the same severity. IDs alone are model-authored and
// are deliberately insufficient evidence of identity.
func introducesBlockingRegression(before, after Report, timelines ...[]Entry) bool {
	return len(blockingRegressions(before, after, timelines...)) > 0
}

func blockingRegressions(before, after Report, timelines ...[]Entry) []Issue {
	var original, updated []Issue
	for _, issue := range before.Issues {
		if isBlocking(issue) {
			original = append(original, issue)
		}
	}
	for _, issue := range after.Issues {
		if isBlocking(issue) {
			updated = append(updated, issue)
		}
	}
	matched := make([]int, len(original))
	for i := range matched {
		matched[i] = -1
	}
	var visit func(int, []bool) bool
	visit = func(index int, seen []bool) bool {
		for j, old := range original {
			if seen[j] || severityRank(updated[index].Severity) > severityRank(old.Severity) || !sameFinding(old, updated[index], timelines...) {
				continue
			}
			seen[j] = true
			if matched[j] < 0 || visit(matched[j], seen) {
				matched[j] = index
				return true
			}
		}
		return false
	}
	var regressions []Issue
	for i := range updated {
		if !visit(i, make([]bool, len(original))) {
			regressions = append(regressions, updated[i])
		}
	}
	return regressions
}

func severityRank(severity string) int {
	switch severity {
	case "critical":
		return 3
	case "major":
		return 2
	case "minor":
		return 1
	}
	return 0
}

func sameFinding(before, after Issue, timelines ...[]Entry) bool {
	if before.Type != after.Type || before.BlockID != after.BlockID {
		return false
	}
	if before.Type == "dependency" && before.CandidateID != after.CandidateID {
		return false
	}
	if strings.Join(sortedUnique(before.SourceIDs), "|") != strings.Join(sortedUnique(after.SourceIDs), "|") {
		return false
	}
	startA, endA := findingRange(before, timelineAt(timelines, 0))
	startB, endB := findingRange(after, timelineAt(timelines, 1))
	if endA > startA && endB > startB {
		overlap := math.Min(endA, endB) - math.Max(startA, startB)
		if overlap < -.05 || (overlap/math.Min(endA-startA, endB-startB) < .5 && math.Abs(startA-startB) > .25) {
			return false
		}
	}
	return comparableEvidence(before.Evidence, after.Evidence)
}

func timelineAt(values [][]Entry, index int) []Entry {
	if len(values) > index {
		return values[index]
	}
	return nil
}
func findingRange(issue Issue, timeline []Entry) (float64, float64) {
	for _, entry := range timeline {
		if issue.BlockID != "" && entry.BlockID == issue.BlockID {
			return issue.Start - entry.OutputIn, issue.End - entry.OutputIn
		}
	}
	return issue.Start, issue.End
}

var quotedEvidence = regexp.MustCompile(`(?:^|[\s:(])["']([^"'\n]{2,240})["']`)
var evidenceNumbers = regexp.MustCompile(`\b[0-9]+(?:[.,][0-9]+)?\b`)

func comparableEvidence(a, b string) bool {
	if lexical(a) == lexical(b) {
		return true
	}
	quotesA, quotesB := quoteAnchors(a), quoteAnchors(b)
	if len(quotesA) > 0 && len(quotesB) > 0 {
		// The same quoted actual/expected words remain stable when the reviewer's
		// surrounding explanation changes. A different wrong word is a new defect.
		return strings.Join(quotesA, "|") == strings.Join(quotesB, "|")
	}
	if strings.Join(sortedUnique(evidenceNumbers.FindAllString(a, -1)), "|") != strings.Join(sortedUnique(evidenceNumbers.FindAllString(b, -1)), "|") {
		return false
	}
	wordsA, wordsB := evidenceWords(a), evidenceWords(b)
	common := 0
	for word := range wordsA {
		if wordsB[word] {
			common++
		}
	}
	if common < 2 {
		return false
	}
	union := len(wordsA) + len(wordsB) - common
	return float64(common)/float64(union) >= .65 && float64(common)/float64(min(len(wordsA), len(wordsB))) >= .8
}

func quoteAnchors(text string) []string {
	normalized := strings.NewReplacer("\u201c", "\"", "\u201d", "\"", "\u2018", "'", "\u2019", "'").Replace(text)
	var anchors []string
	for _, match := range quotedEvidence.FindAllStringSubmatch(normalized, -1) {
		anchors = append(anchors, lexical(match[1]))
	}
	return sortedUnique(anchors)
}
func sortedUnique(values []string) []string {
	seen := make(map[string]bool)
	var result []string
	for _, value := range values {
		if value != "" && !seen[value] {
			seen[value] = true
			result = append(result, value)
		}
	}
	sort.Strings(result)
	return result
}

func evidenceWords(text string) map[string]bool {
	stop := map[string]bool{"the": true, "a": true, "an": true, "is": true, "are": true, "was": true, "were": true, "and": true, "of": true, "to": true, "for": true, "from": true, "with": true, "in": true, "on": true, "at": true, "this": true, "that": true, "it": true, "output": true, "rendered": true, "actual": true, "block": true, "source": true, "has": true, "have": true, "been": true}
	aliases := map[string]string{"captions": "caption", "subtitles": "caption", "subtitle": "caption", "delayed": "lag", "late": "lag", "lags": "lag", "lagging": "lag", "clipped": "cut", "clips": "cut", "truncated": "cut", "cutting": "cut", "cuts": "cut", "spoken": "speech", "speaking": "speech", "voice": "speech", "missing": "absent", "omitted": "absent"}
	words := strings.FieldsFunc(strings.ToLower(text), func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) })
	result := make(map[string]bool)
	for _, word := range words {
		if replacement, ok := aliases[word]; ok {
			word = replacement
		}
		if len(word) > 2 && !stop[word] {
			result[word] = true
		}
	}
	return result
}
