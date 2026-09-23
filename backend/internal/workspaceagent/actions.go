package workspaceagent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/calendar"
	"sneepcut/backend-go/internal/clips"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/jobs"
	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/publishing"
	"sneepcut/backend-go/internal/scripts"
	"sneepcut/backend-go/internal/stories"
	"sneepcut/backend-go/internal/story"
)

type PlatformExecutor struct {
	brandMedia     *media.Service
	generator      aiprovider.Generator
	storyLifecycle *stories.Handler
	jobs           *jobs.Handler
	studio         *StudioClient
	calendar       *calendar.Repository
	publishing     *publishing.Handler
	clips          *clips.Handler
	db             *sql.DB
	stories        *stories.Repository
	scripts        *scripts.Repository
}

func NewExecutor(db *sql.DB, generator aiprovider.Generator, limits story.Limits) *PlatformExecutor {
	return &PlatformExecutor{generator: generator, db: db, stories: stories.NewRepository(db, story.NormalizeLimits(limits)), scripts: scripts.NewRepository(db)}
}
func (e *PlatformExecutor) Catalog() []Capability {
	catalog := []Capability{
		{Name: "brand.logo.update", Description: "Attach or detach the GLOBAL brand logo only on explicit global request. Input {expected_state,logo_resource_id:owned attached logo UUID or empty string}. Read brand.read first. Shared image files remain available to other projects; guarded Undo supported.", Risk: "write", Available: e.brandMedia != nil},
		{Name: "publishing.disconnect", Description: "Disconnect one inspected connected account using the existing service. Input {id,expected_state}. Requires exact account approval; no automatic reconnection or OAuth credentials in chat.", Risk: "external", Available: e.publishing != nil},
		{Name: "calendar.attach_media", Description: "Attach owned uploaded publishing media to an inspected draft. Input {id,expected_state,resource_ids:[opaque publishing_media IDs]}. Replaces draft media; does not publish. Use uploaded attachments only.", Risk: "write", Available: e.calendar != nil},
		{Name: "calendar.delete", Description: "Permanently remove an inspected calendar draft only. Input {id,expected_state}. Exact-target approval; original media retained. Published/scheduled posts must use their explicit platform workflow.", Risk: "external", Available: e.calendar != nil},
		{Name: "clips.list", Description: "Search/filter owned library clips. Input {search?,score?:all|high|promising|low,aspect?:all|9:16|1:1|16:9,subtitles?:all|yes|no,sort?:newest|oldest|score|duration,page?:integer}. Same filters as library; 24 per page.", Risk: "read", Available: e.clips != nil},
		{Name: "analytics.activity", Description: "Read actual UTC daily production activity for the last days (1..365, default30). Input {days?}. Internal score is not social engagement; no fabricated provider metrics.", Risk: "read", Available: true},
		{Name: "scripts.generate", Description: "Generate a script draft/variants through the existing script generator. Input {topic,platform?:tiktok|instagram|youtube,duration?:15..180,tone?,target_audience?,language?,style?}. No credits charged. Returns unsaved normalized script; save via scripts.create/update when requested. Never claims it was filmed.", Risk: "read", Available: e.generator != nil},
		{Name: "scripts.export", Description: "Prepare owned script JSON for explicit download. Input {id}. Does not claim it has been saved on the device.", Risk: "read", Available: true},
		{Name: "settings.preferences.read", Description: "Read saved application preferences and expected_state. Input {}.", Risk: "read", Available: true},
		{Name: "settings.preferences.update", Description: "Change explicit application preferences with guarded Undo. Input {expected_state,preferences:{locale?:en|ro,theme?:light|dark|system,timezone?:IANA timezone,defaultAspectRatio?:9:16|1:1|16:9,defaultClipCount?:1..10,emailSecurity?,emailProduct?,emailMarketing?,inAppProcessing?,inAppPublishing?}}. Preserve omitted values; read first.", Risk: "write", Available: true},
		{Name: "stories.restyle", Description: "Change only rendered story style while preserving its exact accepted plan, sources and locks. Input {id,version,expected_state,style:{captions?,subtitle_color?,subtitle_position?,subtitle_font?,subtitle_size?,logo_resource_id?,logo_position?,logo_opacity?}}. Requires new real render/review; failed review preserves the prior accepted version. Uses existing credit reservation.", Risk: "write", Available: true},
		{Name: "stories.rollback", Description: "Restore an inspected saved accepted story version. Input {id,expected_state,version}. Guarded Undo available.", Risk: "write", Available: e.storyLifecycle != nil},
		{Name: "stories.remove_asset", Description: "Remove a source from a draft story only. Input {id,expected_state,asset_id}. Original uploaded file is preserved.", Risk: "write", Available: e.storyLifecycle != nil},
		{Name: "stories.delete", Description: "Delete an inspected story and derived artifacts. Input {id,expected_state}. Original uploads remain; exact-target approval required. No Undo.", Risk: "external", Available: e.storyLifecycle != nil},
		{Name: "clips.metadata", Description: "Update inspected clip metadata with guarded Undo. Input {id,expected_state,metadata:{title?,hookText?,transcriptText?}}. Preserve omitted fields.", Risk: "write", Available: e.clips != nil},
		{Name: "clips.delete", Description: "Permanently remove an inspected clip from the library. Input {id,expected_state}. Requires exact-target approval; no Undo.", Risk: "external", Available: e.clips != nil},
		{Name: "clips.get", Description: "Read a clip, its segments and expected_state. Input {id}.", Risk: "read", Available: e.clips != nil},
		{Name: "clips.trim", Description: "Trim an existing non-story clip. Input {id,expected_state,edit:{start_time,end_time}}. Times in seconds; inspect first. Preserves rendered subtitle appearance. Output metadata is verified; no semantic AI review or Undo is available.", Risk: "write", Available: e.clips != nil},
		{Name: "clips.recut", Description: "Recut a non-story clip using original source segments. Input {id,expected_state,edit:{segments:[{start,end,order}]}}. Times in seconds; order is a unique nonnegative integer defining playback order. Inspect first. No semantic AI review or Undo is available.", Risk: "write", Available: e.clips != nil},
		{Name: "workspace.open", Description: "Prepare a workspace page to open. Input {page:home|create|clips|scripts|studio|brand|publish|calendar|settings|billing}. Returns a link; never changes data.", Risk: "read", Available: true},
		{Name: "runs.list", Description: "Inspect your active/pending agent operations and revisions. Input {}. Resolve conversational stop/pause targets from actual active operations, clarify if ambiguous.", Risk: "read", Available: true},
		{Name: "runs.control", Description: "Pause, resume or stop a specifically inspected active run at the user's request. Input {id,revision,command:pause|resume|stop}. Never auto-approve other requests; stop means cancellation requested, not necessarily already completed.", Risk: "write", Available: true},
		{Name: "projects.list", Description: "List your recent projects and clip counts. Input {}.", Risk: "read", Available: true},
		{Name: "projects.rename", Description: "Rename an existing project. Input {id,name,expected_updated_at}. Copy expected_updated_at from the project's updated_at returned by projects.list; refresh on conflict.", Risk: "write", Available: true},
		{Name: "brand.read", Description: "Read saved brand colors, fonts and subtitle settings. Input {}. Does not return private asset paths.", Risk: "read", Available: true},
		{Name: "stories.list", Description: "List your stories. Input {}.", Risk: "read", Available: true},
		{Name: "stories.get", Description: "Inspect story state and reviewed versions. Input {id}.", Risk: "read", Available: true},
		{Name: "stories.update", Description: "Update inspected story settings or protected blocks. Input {id,expected_state,patch:{options?:full existing options,assets?:[{id,role,include,order}],version,locks?:[{block_id,locked,lock_text,lock_order,lock_crop}]}}. Options/assets only while draft; protect requested sections before revising. Copy expected_state from stories.get. Preserve existing locks not requested changed.", Risk: "write", Available: true},
		{Name: "stories.create", Description: "Create an empty story draft. Input {options:{brief,target_seconds,aspect_ratio,language,mode,preserve_order,captions,subtitle_color?,subtitle_position?,subtitle_font?,subtitle_size?,logo_resource_id?,logo_position?,logo_opacity?}}. Target seconds integer15..90; subtitle size12..120, color #RRGGBB, position top|center|bottom. Logo must be an attached opaque resource ID. Sources upload in chat; continue requested montage after validated uploads.", Risk: "write", Available: true},
		{Name: "stories.generate", Description: "Generate an uploaded story. Input {id,version,expected_state}. Copy expected_state from inspected story. Requires actual uploaded assets; spends up to 10 credits.", Risk: "cost", CostCredits: 10, Available: true},
		{Name: "stories.revise", Description: "Revise an existing story using its existing credit reservation. Input {id,version,expected_state,action,block_id?,candidate_id?}; action alternate, regenerate_section, faster, improve_flow, improve_transitions. Copy expected_state from inspected story.", Risk: "write", Available: true},
		{Name: "scripts.list", Description: "List script summaries. Input {query?:string,include_archived?:boolean}.", Risk: "read", Available: true},
		{Name: "scripts.versions", Description: "Inspect saved script version history. Input {id}.", Risk: "read", Available: true},
		{Name: "scripts.restore_version", Description: "Restore a selected saved script version with Undo. Input {id,revision,version_id}. Inspect current script and version history first.", Risk: "write", Available: true},
		{Name: "scripts.archive", Description: "Archive a script reversibly. Input {id,revision}. This does not permanently delete content.", Risk: "write", Available: true},
		{Name: "scripts.get", Description: "Read a script and revision. Input {id}.", Risk: "read", Available: true},
		{Name: "scripts.create", Description: "Create a script draft. Input {title,status,topic,platform,language,target_duration_seconds,tone,style,audience,snapshot}. No publishing occurs.", Risk: "write", Available: true},
		{Name: "scripts.update", Description: "Replace a script after reading its revision. Input {id,revision,document:{title,status,topic,platform,language,target_duration_seconds,tone,style,audience,snapshot}}.", Risk: "write", Available: true},
		{Name: "analytics.read", Description: "Read aggregate workspace counts and remaining credits. Input {}.", Risk: "read", Available: true},
		{Name: "settings.read", Description: "Read editable profile name and expected_state. Input {}. Security/payment credentials are never exposed.", Risk: "read", Available: true},
		{Name: "settings.update", Description: "Change your display name. Input {expected_state,name}. Read settings first. Security, connected accounts, payment, 2FA and account deletion use official user-mediated Settings/Billing flows via workspace.open.", Risk: "write", Available: true},
		{Name: "calendar.list", Description: "List calendar entries. Input {start,end} in ISO timestamps.", Risk: "read", Available: e.calendar != nil},
		{Name: "calendar.get", Description: "Inspect exact post content, media, accounts, time and expected_state. Input {id}.", Risk: "read", Available: e.calendar != nil},
		{Name: "calendar.create_draft", Description: "Prepare a draft only. Input {fields:{title,platforms,accountIds,scheduledAt,clipId?,caption?,notes?,instagram?}}. Never invent provider consent or account IDs.", Risk: "write", Available: e.calendar != nil},
		{Name: "calendar.update", Description: "Edit an inspected draft only. Input {id,expected_state,fields:{title?,caption?,notes?,clipId?,platforms?,accountIds?,scheduledAt?}}.", Risk: "write", Available: e.calendar != nil},
		{Name: "publishing.accounts", Description: "List connected destinations and actual publishing capabilities. Input {}.", Risk: "read", Available: e.publishing != nil},
		{Name: "publishing.status", Description: "Inspect per-destination publication state. Input {id}.", Risk: "read", Available: e.calendar != nil},
		{Name: "publishing.schedule", Description: "Schedule an inspected draft. Input {id,expected_state,fields:{scheduledAt}}. Explicit timestamp including timezone; requires exact-target approval and existing provider consent.", Risk: "external", Available: e.calendar != nil},
		{Name: "publishing.reschedule", Description: "Change scheduled time. Input {id,expected_state,fields:{scheduledAt}}; requires exact-target approval.", Risk: "external", Available: e.calendar != nil},
		{Name: "publishing.publish", Description: "Publish an inspected draft now. Input {id,expected_state,fields:{}}; requires exact content/account/media approval. Observe each destination confirmation.", Risk: "external", Available: e.calendar != nil},
		{Name: "publishing.unschedule", Description: "Return a scheduled entry to draft. Input {id,expected_state,fields:{}}. Cannot retract a published post; requires approval.", Risk: "external", Available: e.calendar != nil},
		{Name: "clips.style", Description: "Change an inspected clip's local rendering. Input {id,expected_state,edit:{aspect_ratio?:9:16|16:9|1:1,subtitle_style?:default|clean|bold|caption-box|none,burn_subtitles?:boolean,smart_crop?:boolean}}. Uses saved source mapping; never changes global brand settings.", Risk: "write", Available: e.clips != nil},
		{Name: "clips.transitions", Description: "Improve transitions using the existing transition review engine. Input {id,expected_state,edit:{}}. Inspect first; preserves protected source mapping.", Risk: "write", Available: e.clips != nil},
		{Name: "clips.export", Description: "Verify the current stored clip output exists and prepare access. Input {id,expected_state}. Does not claim saving to the user's device.", Risk: "read", Available: e.clips != nil},
		{Name: "brand.update", Description: "Update global brand settings ONLY when requested globally. Input {expected_state,settings:{primaryColor?,secondaryColor?,fontFamily?,applyBrandColors?,applyBrandFont?,subtitleFont?,subtitleColor?,subtitleBgColor?,subtitleBgOpacity?,subtitlePosition?,watermarkPosition?,watermarkOpacity?,hidePlatformBadge?}}. Read brand first; preserve unrequested fields. For a single clip use its local editor action, never global brand changes.", Risk: "write", Available: true},
		{Name: "jobs.create", Description: "Process one source into clips. Input {source_type:upload|url|youtube,asset_id?:owned story video asset ID,source_url?:explicit user supplied URL,num_clips_requested:1..15,aspect_ratio?:9:16|1:1|16:9,language?,subtitle_style?,include_brand?,burn_subtitles?,smart_crop?,user_instructions?}. Upload accepts inspected assets from stories.get; no local paths. Cost exactly 10 credits per requested clip, requires approval.", Risk: "cost", Available: e.jobs != nil},
		{Name: "jobs.get", Description: "Inspect a processing job and verified saved clip IDs. Input {id}.", Risk: "read", Available: e.jobs != nil},
	}
	for i := range catalog {
		if !catalog[i].Available && catalog[i].Limitation == "" {
			catalog[i].Limitation = "The required execution service is not connected."
		}
	}
	catalog = append(catalog, e.studioCapabilities()...)
	catalog = append(catalog, e.libraryCapabilities()...)
	return append(catalog, e.projectBrandCapabilities()...)
}
func decodeAction(raw json.RawMessage, dst any) error {
	if len(raw) == 0 {
		raw = json.RawMessage(`{}`)
	}
	if len(raw) > 65536 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return errors.New("Action input must be a JSON object smaller than 64 KiB")
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if err := d.Decode(dst); err != nil {
		return fmt.Errorf("Invalid action input: %w", err)
	}
	if d.Decode(new(any)) != io.EOF {
		return errors.New("Action input contains trailing data")
	}
	return nil
}
func actionJSON(value any) json.RawMessage { raw, _ := json.Marshal(value); return raw }
func actionResult(summary, route string, value any) ActionResult {
	return ActionResult{Summary: summary, Route: route, Data: actionJSON(value)}
}
func actionID(raw json.RawMessage) (string, error) {
	var in struct {
		ID string `json:"id"`
	}
	err := decodeAction(raw, &in)
	if err == nil && !data.ValidUUID(in.ID) {
		err = errors.New("A valid resource ID is required")
	}
	return in.ID, err
}

func (e *PlatformExecutor) Execute(ctx context.Context, user, requestID string, a Action) (ActionResult, error) {
	switch a.Name {
	case "brand.logo.update", "brand.logo.restore":
		return e.brandLogo(ctx, user, requestID, a)
	case "clips.list":
		return e.clipLibrary(ctx, user, a)
	case "analytics.activity":
		return e.activity(ctx, user, a)
	case "scripts.generate", "scripts.export":
		return e.generateScript(ctx, user, a)
	case "stories.restyle":
		return e.restyleStory(ctx, user, requestID, a)
	case "stories.rollback", "stories.remove_asset", "stories.delete":
		return e.lifecycleExecute(ctx, user, requestID, a)
	case "jobs.create", "jobs.get":
		return e.executeJob(ctx, user, requestID, a)
	case "projects.brand.read", "projects.brand.update", "projects.brand.restore":
		return e.executeProjectBrand(ctx, user, requestID, a)
	case "runs.list", "runs.control":
		return e.runControls(ctx, user, requestID, a)
	case "library.get", "folders.create", "folders.update", "folders.delete", "clips.move":
		return e.executeLibrary(ctx, user, requestID, a)
	case "settings.read", "settings.update", "settings.restore", "settings.preferences.read", "settings.preferences.update":
		return e.settings(ctx, user, requestID, a)
	case "scripts.versions", "scripts.restore_version", "scripts.archive":
		return e.scriptHistory(ctx, user, requestID, a)
	case "stories.update", "stories.restore_settings":
		return e.patchStory(ctx, user, requestID, a)
	case "studio.list", "studio.get", "studio.create", "studio.edit", "studio.revise", "studio.render", "studio.restore":
		return e.studioExecute(ctx, user, requestID, a)
	case "calendar.attach_media", "calendar.delete", "calendar.list", "calendar.get", "calendar.create_draft", "calendar.update", "publishing.accounts", "publishing.disconnect", "publishing.schedule", "publishing.reschedule", "publishing.publish", "publishing.unschedule", "publishing.status":
		return e.publishingExecute(ctx, user, requestID, a)
	case "clips.get", "clips.trim", "clips.recut", "clips.style", "clips.transitions", "clips.export", "clips.metadata", "clips.delete":
		return e.clipExecute(ctx, user, requestID, a)
	case "workspace.open":
		return openWorkspace(a)
	case "projects.rename", "projects.restore":
		return e.renameProject(ctx, user, requestID, a)
	case "brand.read":
		return e.readBrand(ctx, user, a)
	case "brand.update", "brand.restore":
		return e.updateBrand(ctx, user, requestID, a)
	case "projects.list", "analytics.read", "stories.list":
		if err := decodeAction(a.Input, &struct{}{}); err != nil {
			return ActionResult{}, err
		}
		if a.Name == "projects.list" {
			v, err := e.projectSummaries(ctx, user)
			return actionResult("Loaded your projects", "/dashboard/clips", v), err
		}
		if a.Name == "analytics.read" {
			v, err := e.analytics(ctx, user)
			return actionResult("Loaded workspace totals", "/dashboard", v), err
		}
		v, err := e.stories.List(ctx, user)
		return actionResult("Loaded your stories", "/dashboard/create", v), err
	case "stories.get":
		id, err := actionID(a.Input)
		if err != nil {
			return ActionResult{}, err
		}
		result, err := e.inspectedStory(ctx, user, id)
		if err != nil {
			return ActionResult{}, err
		}
		return actionResult("Loaded story", storyRoute(id), result), nil
	case "stories.create":
		var in struct {
			Options story.Options `json:"options"`
		}
		if err := decodeAction(a.Input, &in); err != nil {
			return ActionResult{}, err
		}
		options, err := story.NormalizeOptions(in.Options)
		if err != nil {
			return ActionResult{}, err
		}
		if !data.ValidUUID(requestID) {
			return ActionResult{}, errors.New("Invalid execution ID")
		}
		if err = e.stories.Create(ctx, user, requestID, options); err != nil {
			return ActionResult{}, err
		}
		p, err := e.stories.Get(ctx, user, requestID)
		return actionResult("Story draft saved. Upload source clips to generate it.", storyRoute(requestID), safeStory(p)), err
	case "stories.generate", "stories.revise":
		return e.queueStory(ctx, user, requestID, a)
	case "scripts.list":
		var in struct {
			Query           string `json:"query"`
			IncludeArchived bool   `json:"include_archived"`
		}
		if err := decodeAction(a.Input, &in); err != nil {
			return ActionResult{}, err
		}
		if len(in.Query) > 200 {
			return ActionResult{}, errors.New("Search query too long")
		}
		v, err := e.scripts.List(ctx, user, in.Query, in.IncludeArchived)
		for i := range v {
			v[i].Snapshot = nil
		}
		return actionResult("Loaded your scripts", "/dashboard/script-generator", v), err
	case "scripts.get":
		id, err := actionID(a.Input)
		if err != nil {
			return ActionResult{}, err
		}
		v, err := e.scripts.Get(ctx, user, id)
		return actionResult("Loaded script", "/dashboard/script-generator", v), err
	case "scripts.create":
		var in scripts.WorkspaceInput
		if err := decodeAction(a.Input, &in); err != nil {
			return ActionResult{}, err
		}
		v, err := e.scripts.CreateWithID(ctx, user, requestID, in)
		return actionResult("Script draft saved", "/dashboard/script-generator", v), err
	case "scripts.update", "scripts.restore":
		return e.updateScript(ctx, user, requestID, a)
	default:
		return ActionResult{}, errors.New("This operation is not available to the workspace agent; use its manual workspace")
	}
}
