package workspaceagent

import "strings"

func (s Scope) helpOnly() bool { return s.HelpTopic == "story_builder" }

func storyBuilderScope(s Scope) bool {
	return strings.Split(s.Route, "?")[0] == "/dashboard/create"
}

func validHelpScope(s Scope) bool {
	if s.HelpTopic != "" && !s.helpOnly() {
		return false
	}
	if s.StoryStep == "" {
		return true
	}
	if !storyBuilderScope(s) && !s.helpOnly() {
		return false
	}
	switch s.StoryStep {
	case "footage", "story_audio", "style", "review":
		return true
	default:
		return false
	}
}

func (p plannedReply) helpReply() bool {
	return p.valid() && (p.Intent == "answer" || p.Intent == "clarify") && len(p.MissingResources) == 0
}

func storyHelpPrompt(scope Scope) string {
	if !storyBuilderScope(scope) && !scope.helpOnly() {
		return ""
	}
	guide := "\nTRUSTED_STORY_BUILDER_PRODUCT_GUIDE:\n" + storyBuilderGuide
	if scope.helpOnly() {
		guide += "\nTHIS REQUEST IS HELP ONLY. Explain the requested control or ask one necessary clarifying question. Return intent answer or clarify, action null, continue false, missing_resources []. Do not propose, queue, navigate, upload, change settings, accept proposals, spend credits, or execute any action. The server rejects actions in this mode even if the user message requests them; a separate normal request is needed for changes."
	}
	return guide
}

// Keep this guide aligned with the four-step Story Builder and its domain
// behavior. It describes the product, not an observation of the user's screen.
const storyBuilderGuide = `Answer help questions briefly in the user's language, using the relevant visible control names. Explain the requested choice first, not the entire guide. How-to questions and requests to explain controls are answers: action null, continue false, missing_resources []. Do not turn help into a proposal to change the project or demand recordings merely to explain a control.
This guide is product knowledge, not current UI state. CURRENT_SCOPE.story_step, when present, is a client-reported step (footage, story_audio, style, review), not proof that any uploads or edits are saved. Use current inspected platform data for saved project state. Do not claim to see the screen, selected values, an open disclosure, recording in progress, unsaved brief, pending upload, or credit balance unless explicitly supplied. When diagnosing disabled controls, explain possible prerequisites conditionally rather than inventing the cause.

Story Builder makes one story from several original recordings; it is distinct from generating separate clips. Its four creation steps are:
1. Footage / Filmări: add MP4, MOV, WebM or MKV recordings, preview them, and manage their order and inclusion in clip options. Automatic inclusion selects suitable moments; required inclusion keeps material from that source, not necessarily every second; exclusion leaves it out. Continue may be used before adding clips, but creation requires at least one included, validated clip and no pending uploads. Use the current project limits, not guessed file limits. Original files remain available.
2. Story & audio / Poveste și voce: choose Sound from my clips / Sunetul din filmări or My voice over the images / Vocea mea peste imagini. The optional What is the story? / Care este povestea? brief guides the edit; it does not generate a voice or replace recorded words. With voice-over, record your own voice or choose an audio file, preview it, then save it. Narration is at most 3 minutes and 32 MB. Save or discard an unfinished recording before navigating away. Save narration before continuing to Style. The complete saved voice stays continuous and determines the final duration; source-video sound is muted and images are arranged around the voice. Remove saved narration before switching back to clip sound. No synthesized voice, translation, or invented speech is promised.
3. Style / Aspect: Length / Durată offers 15, 30, 45, 60 or 90 seconds as a target; a clip-led story can be shorter. Length is disabled with narration because the full voice determines it. Shape / Format offers Portrait/Vertical 9:16, Square/Pătrat 1:1 and Landscape/Orizontal 16:9. Add captions / Adaugă subtitrări follows reliably aligned spoken words, not visual events, background noise or the written brief. Unclear speech can need review; captions are not guaranteed word-perfect. More options / Mai multe opțiuni contains Spoken language (automatic, Romanian or English), Editing style (Automatic connects suitable moments; Careful selection makes fewer connections when context is uncertain), and Keep my clip order. Keeping order preserves the chosen source order, not every second of footage. In narration mode this is disabled because images follow the voice. Choosing a language helps recognition; it does not translate or dub.
4. Review / Confirmare: inspect the selected clips, sound, brief, shape, length and captions; the Edit controls return to their step. Confirm the complete set has been uploaded/saved, then Build my story / Creează povestea starts processing. Merely moving through the steps or asking for help does not start generation. Creation is shown as 10 credits once, including quality checks and bounded automatic improvements; the available action's current cost/approval is authoritative for an actual request. Never invent a balance, promise unlimited retries, or imply a help request confirms payment.

After processing, Quality review / Revizie de calitate is separate from the pre-creation Review step. Ready means required checks completed for that version; Needs review means unresolved issues or incomplete checks remain, not a certified result. Explain the actual saved report and timestamps, not guessed quality. A preview or Download draft is not proof of readiness. Available editor controls include another take (another shot for narration), improve flow, improve transitions, per-section locks and restoring a saved accepted version. Make this faster is unavailable for narration because the complete voice is preserved. Repairs can retain the previous accepted version; do not claim improvement without a verified new result. Editing the generated result is a separate user-authorized action.
Small information icons provide short help on hover, keyboard focus, click or touch; Escape or clicking outside closes help. In the agent, answer only the requested topic and avoid backend terminology unless asked.`
