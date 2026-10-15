package story

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

// ClarificationError stops an ambiguous edit before rendering while preserving
// the uploaded sources and original request for correction.
type ClarificationError struct{ Question string }

func (e *ClarificationError) Error() string { return e.Question }

func planningClarification(questions []string) error {
	if len(questions) == 0 {
		return nil
	}
	const invalidQuestion = "Please make the conflicting editing instructions consistent before generating."
	if len(questions) > 3 {
		return &ClarificationError{Question: invalidQuestion}
	}
	clean := make([]string, 0, len(questions))
	for _, question := range questions {
		question = strings.Join(strings.Fields(question), " ")
		if utf8.RuneCountInString(question) < 8 || utf8.RuneCountInString(question) > 320 {
			return &ClarificationError{Question: invalidQuestion}
		}
		clean = appendUnique(clean, question)
	}
	return &ClarificationError{Question: strings.Join(clean, " ")}
}

const sourceFaithfulEditorialPolicy = `Honor editing_brief.original_request and every explicit instruction, including exclusions and negations, alongside selected_settings and source_constraints. The conservative_defaults are system fallbacks, never additional user requests. When selected_settings.caption_mode_revised is true, the user explicitly changed captions after the original request: that later caption choice overrides only original caption wording; every other original instruction remains binding. When selected_settings.aspect_ratio_revised is true, the user explicitly changed the output format after the original request: that later aspect ratio overrides only original output-format wording; every other original instruction remains binding. Preserve original voices, languages, framing, speed, expressive pauses, repetitions, gestures and non-speech scenes unless the user explicitly requests a justified change. A repeated phrase is not automatically a redundant take. Do not impose a hook, CTA, faster pace, music, transitions, translation, synthetic media or new claims. Prefer source order when there is no content-supported reason to change it. Never sacrifice complete meaning to hit target_seconds; name any material limit. Caption mode all covers verified dialogue, selective covers only audibly difficult passages supported by actual listening, and off adds no subtitle text; low volume or uncertain ASR alone is not audibility evidence. Unresolved explicit instruction conflicts are blocking findings; never silently choose one side of a material conflict. `

// EditingBrief is a lossless interpretation envelope, not a creative rewrite.
// The user's complete words and UI settings remain separate from our defaults;
// the same envelope is saved with the plan and supplied to independent review.
type EditingBrief struct {
	Version              int                     `json:"version"`
	OriginalRequest      string                  `json:"original_request"`
	ExplicitInstructions []string                `json:"explicit_instructions"`
	SelectedSettings     BriefSettings           `json:"selected_settings"`
	SourceConstraints    []BriefSourceConstraint `json:"source_constraints"`
	ConservativeDefaults []string                `json:"conservative_defaults"`
}

type BriefSettings struct {
	TargetSeconds      int    `json:"target_seconds"`
	AspectRatio        string `json:"aspect_ratio"`
	AspectRatioRevised bool   `json:"aspect_ratio_revised,omitempty"`
	Language           string `json:"language"`
	CaptionMode        string `json:"caption_mode"`
	CaptionModeRevised bool   `json:"caption_mode_revised,omitempty"`
	PreserveOrder      bool   `json:"preserve_order"`
	Narration          bool   `json:"recorded_narration"`
}

type BriefSourceConstraint struct {
	SourceID string `json:"source_id"`
	Name     string `json:"name"`
	Order    int    `json:"order"`
	Include  string `json:"include"`
	Role     string `json:"role"`
}

func BuildEditingBrief(req Request) EditingBrief {
	o := req.Options
	brief := EditingBrief{
		Version: 1, OriginalRequest: o.Brief,
		ExplicitInstructions: []string{},
		SelectedSettings:     BriefSettings{TargetSeconds: o.TargetSeconds, AspectRatio: o.AspectRatio, AspectRatioRevised: o.AspectRatioRevised, Language: o.Language, CaptionMode: EffectiveCaptionMode(o), CaptionModeRevised: o.CaptionModeRevised, PreserveOrder: o.PreserveOrder, Narration: o.Narration},
		SourceConstraints:    []BriefSourceConstraint{},
		ConservativeDefaults: []string{
			"Preserve original voices, appearance, speed, complete ideas, meaningful pauses and gestures.",
			"Do not add music, effects, generated media, invented words, translations or aggressive crops without an explicit request.",
			"Use full-frame fit and simple cuts; any technical correction must be subtle and justified by source evidence.",
			"Do not discard a pause, repetition or non-speech moment merely because it has no new transcript text.",
			"Treat target duration as approximate when a complete thought or required source needs more time; explain the limit.",
			"Preserve every explicit inclusion, exclusion, negation, order and stylistic restriction in the original request; never treat defaults as user intent.",
		},
	}
	// Paragraph boundaries make multi-part directions usable without guessing at
	// sentence semantics, dropping negations or splitting decimals/filenames.
	for _, line := range strings.Split(strings.ReplaceAll(o.Brief, "\r\n", "\n"), "\n") {
		if line = strings.TrimSpace(line); line != "" {
			brief.ExplicitInstructions = append(brief.ExplicitInstructions, line)
		}
	}
	for _, a := range req.Assets {
		brief.SourceConstraints = append(brief.SourceConstraints, BriefSourceConstraint{a.ID, a.Name, a.Order, a.Include, a.Role})
	}
	sort.SliceStable(brief.SourceConstraints, func(i, j int) bool { return brief.SourceConstraints[i].Order < brief.SourceConstraints[j].Order })
	return brief
}

// EffectiveCaptionMode also reads projects saved before caption modes existed.
func EffectiveCaptionMode(o Options) string {
	if o.CaptionMode != "" {
		return o.CaptionMode
	}
	if o.Captions {
		return "all"
	}
	return "off"
}

func validateCaptionMode(o Options) error {
	switch EffectiveCaptionMode(o) {
	case "all", "selective", "off":
		return nil
	default:
		return fmt.Errorf("caption mode must be all, selective or off")
	}
}

var captionDirectives = []struct {
	mode string
	text *regexp.Regexp
}{
	{"off", regexp.MustCompile(`(?:^|[.!?;\n]|\b(?:and|si|please|te rog)\s+)\s*(?:no (?:subtitles|captions)|without (?:subtitles|captions)|(?:do not|don't) (?:add|include|use) (?:any )?(?:subtitles|captions)|fara subtitrari|nu (?:adauga|include|pune|folosi) subtitrari)\b(?:\s*(?:[.!?;\n]|$)|\s+(?:and|si)\s+)`)},
	{"all", regexp.MustCompile(`(?:^|[.!?;\n]|\b(?:and|si|please|te rog)\s+)\s*(?:subtitrari (?:pe|pentru) (?:tot dialogul|tot continutul vorbit)|(?:subtitle|caption) (?:all|every|the entire) (?:dialogue|speech)|(?:subtitles|captions) (?:for|on) (?:all|every|the entire) (?:dialogue|speech))\b(?:\s*(?:[.!?;\n]|$)|\s+(?:and|si)\s+)`)},
	{"selective", regexp.MustCompile(`(?:^|[.!?;\n]|\b(?:and|si|please|te rog)\s+)\s*(?:subtitrari (?:doar|numai) (?:unde se aude greu|pentru pasajele (?:neclare|greu de inteles))|(?:subtitles|captions) only (?:where (?:speech is )?(?:hard to (?:hear|understand)|unclear)|for (?:unclear|hard to understand) (?:speech|passages)))\b(?:\s*(?:[.!?;\n]|$)|\s+(?:and|si)\s+)`)},
}

var explicitDuration = regexp.MustCompile(`(?:^|[.!?;\n])\s*(?:duration|target duration|durata|durata dorita)\s*(?:is|of|de|:|=)?\s*([0-9]{1,4})\s*(?:seconds|secondes|secunde|sec|s)\b(?:\s*(?:[.!?;\n]|$)|\s+(?:and|si)\s+)`)
var explicitAspect = regexp.MustCompile(`(?:^|[.!?;\n])\s*(?:format|aspect ratio|raport de aspect)\s*(?::|=)?\s*(9:16|16:9|1:1|4:5)\b(?:\s*(?:[.!?;\n]|$)|\s+(?:and|si)\s+)`)

// ValidateBriefSettings blocks only unambiguous conflicting declarations. This
// deliberately is not a general natural-language classifier: quoted examples,
// negated commands and vague preferences must not become fabricated choices.
// The complete remaining instructions are checked by editorial/media review.
func ValidateBriefSettings(o Options) error {
	text := strings.ToLower(o.Brief)
	text = strings.NewReplacer("ă", "a", "â", "a", "î", "i", "ș", "s", "ş", "s", "ț", "t", "ţ", "t", "’", "'").Replace(text)
	for _, directive := range captionDirectives {
		if !o.CaptionModeRevised && directive.text.MatchString(text) && EffectiveCaptionMode(o) != directive.mode {
			return fmt.Errorf("the brief requests caption mode %q but the selected option is %q; update the brief or subtitle option before generating", directive.mode, EffectiveCaptionMode(o))
		}
	}
	if !o.Narration {
		for _, match := range explicitDuration.FindAllStringSubmatch(text, -1) {
			seconds, _ := strconv.Atoi(match[1])
			if seconds != o.TargetSeconds {
				return fmt.Errorf("the brief requests %d seconds but the selected duration is %d; choose one duration before generating", seconds, o.TargetSeconds)
			}
		}
	}
	for _, match := range explicitAspect.FindAllStringSubmatch(text, -1) {
		if !o.AspectRatioRevised && match[1] != o.AspectRatio {
			return fmt.Errorf("the brief requests format %s but the selected format is %s; choose one format before generating", match[1], o.AspectRatio)
		}
	}
	return nil
}

const materialClarificationPolicy = `When explicit directions conflict or an ambiguity materially changes the requested outcome (for example include and exclude the same scene or conflicting source orders), stop selection and return clarifications with at most three specific questions of at most 320 characters each; otherwise clarifications must be empty. Do not ask about optional creative preferences: use conservative defaults. Missing source footage is a gap, not a question. Do not silently pick one side of a material conflict. `
