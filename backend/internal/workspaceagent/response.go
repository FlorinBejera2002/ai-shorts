package workspaceagent

import (
	"strings"

	"sneepcut/backend-go/internal/locale"
)

const (
	scheduledSummaryPrefix   = "Post scheduled for "
	jobAlreadyFinishedPrefix = "Processing job is already "
)

// localeCopy is the presentation text for one non-English UI locale. Only
// presentation text is localized: the authoritative receipt, its pending flag
// and error remain the source of truth, and no model can turn them into success.
type localeCopy struct {
	// pending is keyed by action name; the "" key is the fallback.
	pending map[string]string
	// summaries maps exact English result summaries that need specific wording.
	summaries map[string]string
	// scheduled is the wording for a scheduled post; %s receives the time.
	scheduled string
	// jobFinished replaces "Processing job is already ..." summaries.
	jobFinished string
	// actions is keyed by action name for completed results.
	actions map[string]string
	// fallback is used for a completed action without specific wording.
	fallback string
	// runtime maps authored English error messages to safe translations.
	runtime map[string]string
	// resourcesReply is the planner reply when files must be added first.
	resourcesReply string
}

var localeCopies = map[string]localeCopy{
	locale.Romanian: romanianCopy,
	locale.Spanish:  spanishCopy,
}

// localizedActionSummary returns the receipt text for a locale. English and
// unknown locales keep the authored summary.
func localizedActionSummary(uiLocale string, action Action, result ActionResult) string {
	texts, ok := localeCopies[uiLocale]
	if !ok {
		return result.Summary
	}
	if result.Pending {
		if text := texts.pending[action.Name]; text != "" {
			return text
		}
		return texts.pending[""]
	}
	// Preserve distinctions that cannot be inferred from the action name alone.
	if text := texts.summaries[result.Summary]; text != "" {
		return text
	}
	if strings.HasPrefix(result.Summary, scheduledSummaryPrefix) {
		return strings.Replace(texts.scheduled, "%s", strings.TrimPrefix(result.Summary, scheduledSummaryPrefix), 1)
	}
	if strings.HasPrefix(result.Summary, jobAlreadyFinishedPrefix) {
		return texts.jobFinished
	}
	if text := texts.actions[action.Name]; text != "" {
		return text
	}
	return texts.fallback
}

// localizedRuntimeText translates an authored runtime message; unknown text is
// returned unchanged so no translation is invented.
func localizedRuntimeText(uiLocale, text string) string {
	if translated := localeCopies[uiLocale].runtime[text]; translated != "" {
		return translated
	}
	return text
}

// knownRuntimeMessage reports whether text is an authored message that has a
// translation, so its actionable detail may be shown to the user.
func knownRuntimeMessage(text string) bool {
	for _, texts := range localeCopies {
		if _, known := texts.runtime[text]; known {
			return true
		}
	}
	return false
}

// localizedResourcesReply returns the planner reply when files must be added first.
func localizedResourcesReply(uiLocale string) string {
	if texts, ok := localeCopies[uiLocale]; ok {
		return texts.resourcesReply
	}
	return "Add the requested files to continue this request."
}
