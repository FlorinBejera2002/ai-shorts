package workspaceagent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"sneepcut/backend-go/internal/aiprovider"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/processing"
	"sneepcut/backend-go/internal/stories"
	"sneepcut/backend-go/internal/story"
)

// This provider is deliberately deterministic. The test proves orchestration,
// durable execution and actual media delivery, not live-model semantic quality.
type workflowFixtureProvider struct {
	t           *testing.T
	candidates  []string
	unavailable bool
	mediaCalls  int
	planCalls   int
}

func (p *workflowFixtureProvider) Generate(_ context.Context, prompt string) (string, error) {
	if strings.Contains(prompt, "Independently review this proposed story") {
		return `{"complete":true,"issues":[],"incomplete":[]}`, nil
	}
	if !strings.Contains(prompt, "You are an editorial planner") {
		return "", errors.New("unexpected fixture provider prompt")
	}
	p.planCalls++
	blocks := make([]map[string]string, 0, len(p.candidates))
	for i, id := range p.candidates {
		role := "context"
		if i == 0 {
			role = "hook"
		}
		if i == len(p.candidates)-1 {
			role = "conclusion"
		}
		blocks = append(blocks, map[string]string{"candidate_id": id, "role": role, "reason": "Known synthetic fixture interval"})
	}
	return encode(map[string]any{"title": "Synthetic workflow fixture", "summary": "Ten actual uploaded video sources", "blocks": blocks, "gaps": []string{}}), nil
}
func (p *workflowFixtureProvider) ReviewMedia(_ context.Context, prompt string, parts []aiprovider.MediaPart) (string, error) {
	p.mediaCalls++
	if len(parts) < 2 || parts[0].MIME != "video/mp4" || len(parts[0].Data) < 32 || !strings.Contains(string(parts[0].Data[:32]), "ftyp") || parts[1].MIME != "audio/mpeg" {
		p.t.Fatal("review fixture did not receive actual encoded output media")
	}
	if p.unavailable {
		return "", errors.New("fixture reviewer unavailable")
	}
	marker := "DATA:\n"
	start := strings.LastIndex(prompt, marker)
	if start < 0 {
		p.t.Fatal("review payload missing")
	}
	var payload struct {
		Duration float64       `json:"duration"`
		Timeline []story.Entry `json:"timeline"`
	}
	if err := json.NewDecoder(strings.NewReader(prompt[start+len(marker):])).Decode(&payload); err != nil {
		p.t.Fatal(err)
	}
	boundaries := []float64{}
	for _, entry := range payload.Timeline[1:] {
		boundaries = append(boundaries, entry.OutputIn)
	}
	return encode(map[string]any{"coverage": map[string]any{"audio": true, "visual": true, "captions": true, "semantics": true, "boundaries": true, "incomplete": []string{}}, "reviewed_ranges": []map[string]float64{{"start": 0, "end": payload.Duration}}, "reviewed_boundaries": boundaries, "issues": []any{}}), nil
}

// Only source transcription is supplied by a fixture: tone sources have no
// human speech. Probe, rendering, decoding, review media preparation and output
// checks all use the production Processor. No ready status is written by tests.
type workflowFixtureMedia struct {
	processor *processing.Processor
	analyzed  *int
}

func (m workflowFixtureMedia) Inspect(ctx context.Context, key string) (story.Asset, error) {
	return m.processor.Inspect(ctx, key)
}
func (m workflowFixtureMedia) Analyze(_ context.Context, _ string, a story.Asset, _ story.Options) (story.Asset, error) {
	if m.analyzed != nil {
		(*m.analyzed)++
	}
	text := fmt.Sprintf("Fixture%d", a.Order)
	a.Candidates = []story.Candidate{{ID: a.ID + "-phrase", SourceID: a.ID, In: 0, Out: 3.5, Text: text, Words: []story.Word{{Text: text, Start: .3, End: 2.5}}, Language: "en", Speaker: "fixture", Role: "a_roll", AudioScore: 1, VisualScore: 1, Confidence: 1}}
	return a, nil
}
func (m workflowFixtureMedia) RenderStory(ctx context.Context, r story.Request, v story.Version) (story.Output, error) {
	return m.processor.RenderStory(ctx, r, v)
}
func (m workflowFixtureMedia) ReviewStory(ctx context.Context, r story.Request, v story.Version) (story.Report, error) {
	return m.processor.ReviewStory(ctx, r, v)
}

func workflowCommand(t *testing.T, name string, args ...string) []byte {
	t.Helper()
	cmd := exec.Command(name, args...)
	output, err := cmd.Output()
	if err != nil {
		if failure, ok := err.(*exec.ExitError); ok {
			t.Fatalf("%s failed: %v %s", name, err, failure.Stderr)
		}
		t.Fatal(err)
	}
	return output
}
func workflowUUID(t *testing.T) string {
	t.Helper()
	id, err := data.NewUUID()
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func TestStoryRestyleActualMediaPreservesLockedTimeline(t *testing.T) {
	for _, binary := range []string{"ffmpeg", "ffprobe"} {
		if _, err := exec.LookPath(binary); err != nil {
			t.Skip("requires actual FFmpeg/FFprobe runtime")
		}
	}
	f := newAgentFixture(t)
	ctx := context.Background()
	dir := t.TempDir()
	storage, err := media.NewLocalStorage(filepath.Join(dir, "media"))
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()
	id, sourceID := workflowUUID(t), workflowUUID(t)
	provider := &workflowFixtureProvider{t: t, candidates: []string{sourceID + "-phrase"}}
	cfg, _ := processing.ConfigFromEnv(func(string) string { return "" })
	cfg.TempDir = dir
	processor := processing.New(cfg, storage, provider)
	analyzed := 0
	engine := workflowFixtureMedia{processor: processor, analyzed: &analyzed}
	limits := story.DefaultLimits()
	limits.MaxRepairCycles = 0
	executor := NewExecutor(f.db, nil, limits)
	options := story.DefaultOptions()
	options.AspectRatio = "16:9"
	options.SubtitleColor = "#00FF00"
	if err = executor.stories.Create(ctx, f.user, id, options); err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(dir, "source.mp4")
	workflowCommand(t, "ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=320x180:r=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "3.5", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", source)
	key := "uploads/" + f.user + "/" + sourceID + ".mp4"
	if err = storage.Save(ctx, source, key, "video/mp4"); err != nil {
		t.Fatal(err)
	}
	asset, err := processor.Inspect(ctx, key)
	if err != nil {
		t.Fatal(err)
	}
	asset.ID = sourceID
	asset.Name = "Synthetic source.mp4"
	if _, err = executor.stories.AddAsset(ctx, f.user, id, asset); err != nil {
		t.Fatal(err)
	}
	if err = executor.stories.Queue(ctx, f.user, id, stories.Generate{RequestID: workflowUUID(t), AssetIDs: []string{sourceID}}); err != nil {
		t.Fatal(err)
	}
	runner := stories.Runner{Repo: executor.stories, Builder: story.New(engine, provider, limits)}
	if claimed, err := runner.Once(ctx); err != nil || !claimed {
		t.Fatalf("initial render: %t %v", claimed, err)
	}
	before, err := executor.stories.Get(ctx, f.user, id)
	if err != nil || before.Status != "ready" || before.CurrentVersion != 1 {
		t.Fatalf("initial reviewed version unavailable: %v %+v", err, before)
	}
	original := before.Versions[0]
	ending := original.Plan.Blocks[len(original.Plan.Blocks)-1].ID
	if err = executor.stories.Patch(ctx, f.user, id, stories.Patch{Version: 1, Locks: []stories.Lock{{BlockID: ending, Locked: true, Text: true, Order: true, Crop: true}}}); err != nil {
		t.Fatal(err)
	}
	state, err := executor.stories.AgentState(ctx, f.user, id)
	if err != nil {
		t.Fatal(err)
	}
	color := "#FF0000"
	action := Action{Name: "stories.restyle", Input: json.RawMessage(encode(storyAction{ID: id, Version: 1, ExpectedState: state, Style: &story.Style{SubtitleColor: &color}}))}
	receipt, err := executor.Execute(ctx, f.user, workflowUUID(t), action)
	if err != nil || !receipt.Pending {
		t.Fatalf("restyle not queued: %v %+v", err, receipt)
	}
	queued, _ := executor.stories.Get(ctx, f.user, id)
	if queued.Options.SubtitleColor != "#00FF00" {
		t.Fatal("unreviewed style replaced accepted options")
	}
	if _, err = executor.Execute(ctx, f.user, workflowUUID(t), action); err == nil {
		t.Fatal("stale restyle state accepted")
	}
	if claimed, err := runner.Once(ctx); err != nil || !claimed {
		t.Fatalf("restyle worker: %t %v", claimed, err)
	}
	after, err := executor.stories.Get(ctx, f.user, id)
	if err != nil || after.CurrentVersion != 2 || after.Options.SubtitleColor != color {
		t.Fatalf("reviewed style not accepted: %v %+v", err, after)
	}
	latest := after.Versions[0]
	if !reflect.DeepEqual(original.Timeline, latest.Timeline) || !latest.Plan.Blocks[len(latest.Plan.Blocks)-1].Locked || analyzed != 1 || provider.planCalls != 1 {
		t.Fatal("restyle changed exact source timeline, protected ending, or invoked analysis/planning")
	}
	if latest.RenderOptions == nil || latest.RenderOptions.SubtitleColor != color || latest.Output.Key == original.Output.Key {
		t.Fatal("style version snapshot or output identity missing")
	}
	output, _ := storage.Path(latest.Output.Key)
	pixels := workflowCommand(t, "ffmpeg", "-v", "error", "-ss", "0.8", "-i", output, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
	red, green := 0, 0
	for i := 0; i+2 < len(pixels); i += 3 {
		r, g, b := int(pixels[i]), int(pixels[i+1]), int(pixels[i+2])
		if r > g+80 && r > b+80 {
			red++
		}
		if g > r+80 && g > b+80 {
			green++
		}
	}
	if red < 100 || green > 20 {
		t.Fatalf("actual subtitles not restyled red: red=%d green=%d", red, green)
	}
	if result, err := executor.Poll(ctx, f.user, action, receipt); err != nil || result.Pending {
		t.Fatalf("accepted restyle not delivered: %v %+v", err, result)
	}
	provider.unavailable = true
	state, _ = executor.stories.AgentState(ctx, f.user, id)
	white := "#FFFFFF"
	failedAction := Action{Name: "stories.restyle", Input: json.RawMessage(encode(storyAction{ID: id, Version: 2, ExpectedState: state, Style: &story.Style{SubtitleColor: &white}}))}
	receipt, err = executor.Execute(ctx, f.user, workflowUUID(t), failedAction)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = runner.Once(ctx); err != nil {
		t.Fatal(err)
	}
	retained, err := executor.stories.Get(ctx, f.user, id)
	if err != nil || retained.CurrentVersion != 2 || retained.Options.SubtitleColor != color {
		t.Fatal("failed style review overwrote previous accepted render/options")
	}
	if _, err = executor.Poll(ctx, f.user, failedAction, receipt); err == nil {
		t.Fatal("unreviewed style falsely reported successful")
	}
	var credits int
	if err = f.db.QueryRow(`SELECT credits FROM users WHERE id=$1`, f.user).Scan(&credits); err != nil || credits != 90 {
		t.Fatalf("restyles charged again: %d %v", credits, err)
	}
}

func TestWorkspaceStoryConversationActualMedia(t *testing.T) {
	for _, binary := range []string{"ffmpeg", "ffprobe"} {
		if _, err := exec.LookPath(binary); err != nil {
			t.Skip("requires actual FFmpeg/FFprobe runtime")
		}
	}
	for _, unavailable := range []bool{false, true} {
		name := "verified_delivery"
		if unavailable {
			name = "reviewer_unavailable"
		}
		t.Run(name, func(t *testing.T) {
			f := newAgentFixture(t)
			ctx := context.Background()
			// Actual native rendering can exceed the short unit-test JWT lifetime.
			tokens, err := identity.NewTokens(identity.TokenConfig{Secret: strings.Repeat("a", 32), Issuer: "test", Audience: "test", AccessLifetime: 10 * time.Minute, RefreshLifetime: time.Hour})
			if err != nil {
				t.Fatal(err)
			}
			session, _, _, err := identity.NewService(identity.NewPostgres(f.db), tokens).Login(ctx, f.user+"@example.invalid", "agent-test-password")
			if err != nil {
				t.Fatal(err)
			}
			f.token = session.AccessToken
			dir := t.TempDir()
			storage, err := media.NewLocalStorage(filepath.Join(dir, "media"))
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = storage.Close() })
			provider := &workflowFixtureProvider{t: t, unavailable: unavailable}
			cfg, _ := processing.ConfigFromEnv(func(string) string { return "" })
			cfg.TempDir = dir
			processor := processing.New(cfg, storage, provider)
			engine := workflowFixtureMedia{processor: processor}
			limits := story.DefaultLimits()
			limits.MaxRepairCycles = 0
			executor := NewExecutor(f.db, nil, limits)
			f.handler.executor = executor
			service := media.NewService(media.Config{LocalRoot: filepath.Join(dir, "media"), SigningSecret: strings.Repeat("s", 32)}, f.db, storage, nil, nil)
			f.handler.SetMedia(service)
			stories.New(f.db, f.handler.auth, service, engine, limits).Register(f.router)
			options := story.DefaultOptions()
			options.TargetSeconds = 35
			options.AspectRatio = "16:9"
			options.Language = "en"
			options.SubtitleColor = "#00FF00"
			options.SubtitlePosition = "top"
			options.SubtitleSize = 60
			options.LogoPosition = "bottom-right"
			opacity := 1.0
			options.LogoOpacity = &opacity
			projectID, resourceID := "", ""
			phase := 0
			f.handler.generator = generatorFunc(func(ctx context.Context, prompt string) (string, error) {
				phase++
				switch phase {
				case 1:
					return encode(plannedReply{Intent: "execute", Reply: "Create the requested story draft", Continue: true, Action: &Action{Name: "stories.create", Input: json.RawMessage(encode(map[string]any{"options": options}))}}), nil
				case 2:
					return encode(plannedReply{Intent: "resources", Reply: "Upload ten source videos and the logo", MissingResources: []ResourceNeed{{Kind: "videos", Label: "Ten recordings", TargetID: projectID}, {Kind: "logo", Label: "Brand logo", TargetID: projectID}}}), nil
				case 3:
					if !strings.Contains(prompt, resourceID) {
						t.Fatal("resumed planner did not receive attached resource")
					}
					state, err := executor.stories.AgentState(ctx, f.user, projectID)
					if err != nil {
						return "", err
					}
					options.LogoResourceID = resourceID
					return encode(plannedReply{Intent: "execute", Continue: true, Reply: "Apply requested logo and subtitles", Action: &Action{Name: "stories.update", Input: json.RawMessage(encode(map[string]any{"id": projectID, "expected_state": state, "patch": stories.Patch{Options: &options}}))}}), nil
				case 4:
					state, err := executor.stories.AgentState(ctx, f.user, projectID)
					if err != nil {
						return "", err
					}
					return encode(plannedReply{Intent: "execute", Reply: "Generate the confirmed 35 second story", Action: &Action{Name: "stories.generate", Input: json.RawMessage(encode(storyAction{ID: projectID, ExpectedState: state}))}}), nil
				default:
					return "", errors.New("unexpected repeated workflow planning")
				}
			})
			requestID := workflowUUID(t)
			response := f.call("POST", "/api/workspace-agent/runs", f.token, encode(createRequest{RequestID: requestID, Message: "Create one 35 second story from ten recordings, with green top subtitles and my logo bottom right.", Context: Scope{Route: "/dashboard/create"}}))
			if response.Code != 202 {
				t.Fatalf("conversation admission: %d %s", response.Code, response.Body.String())
			}
			run := f.load(t, requestID)
			f.advance(t, &run)
			f.advance(t, &run)
			if run.Status != "planning" || len(run.Steps) != 1 {
				t.Fatalf("draft falsely completed workflow: %+v", run)
			}
			var draft struct {
				ID string `json:"id"`
			}
			if json.Unmarshal(run.Steps[0].Result.Data, &draft) != nil || draft.ID == "" {
				t.Fatal("draft receipt missing")
			}
			projectID = draft.ID
			f.advance(t, &run)
			if run.Status != "waiting_for_resources" {
				t.Fatalf("missing resource pause: %+v", run)
			}
			response = f.call("POST", "/api/workspace-agent/runs/"+run.ID+"/control", f.token, encode(map[string]any{"command": "resume", "revision": run.Revision}))
			if response.Code != 409 {
				t.Fatal("resumed without required sources")
			}
			for i := 0; i < 10; i++ {
				id := workflowUUID(t)
				file := filepath.Join(dir, id+".mp4")
				workflowCommand(t, "ffmpeg", "-v", "error", "-y", "-threads", "1", "-f", "lavfi", "-i", "color=c=black:s=320x180:r=30", "-f", "lavfi", "-i", fmt.Sprintf("sine=frequency=%d:sample_rate=48000", 440+i*20), "-t", "3.5", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", file)
				key := "uploads/" + f.user + "/" + id + ".mp4"
				if err = storage.Save(ctx, file, key, "video/mp4"); err != nil {
					t.Fatal(err)
				}
				response = f.call("POST", "/api/stories/"+projectID+"/assets", f.token, encode(map[string]any{"id": id, "reference": key, "name": fmt.Sprintf("Synthetic source %02d.mp4", i), "order": i}))
				if response.Code != 201 && response.Code != 200 {
					t.Fatalf("real source inspection: %d %s", response.Code, response.Body.String())
				}
				provider.candidates = append(provider.candidates, id+"-phrase")
			}
			logo := filepath.Join(dir, "logo.png")
			workflowCommand(t, "ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=100x100", "-frames:v", "1", logo)
			logoKey := "brand/" + f.user + "/logo-fixture.png"
			if err = storage.Save(ctx, logo, logoKey, "image/png"); err != nil {
				t.Fatal(err)
			}
			response = f.call("POST", "/api/workspace-agent/resources", f.token, encode(map[string]any{"kind": "logo", "reference": logoKey, "name": "Synthetic logo", "project_id": projectID}))
			if response.Code != 201 {
				t.Fatalf("logo resource: %d %s", response.Code, response.Body.String())
			}
			var resource struct {
				ID string `json:"id"`
			}
			if json.Unmarshal(response.Body.Bytes(), &resource) != nil {
				t.Fatal("resource response")
			}
			resourceID = resource.ID
			response = f.call("POST", "/api/workspace-agent/runs/"+run.ID+"/control", f.token, encode(map[string]any{"command": "resume", "revision": run.Revision, "resource_ids": []string{resourceID}}))
			if response.Code != 200 {
				t.Fatalf("resume: %d %s", response.Code, response.Body.String())
			}
			run = f.load(t, run.ID)
			for i := 0; i < 3; i++ {
				f.advance(t, &run)
			}
			if run.Status != "waiting_for_confirmation" || run.CostCredits != 10 {
				t.Fatalf("missing generation approval: %+v", run)
			}
			var credits int
			if err = f.db.QueryRow(`SELECT credits FROM users WHERE id=$1`, f.user).Scan(&credits); err != nil || credits != 100 {
				t.Fatalf("charged before approval: %d %v", credits, err)
			}
			response = f.call("POST", "/api/workspace-agent/runs/"+run.ID+"/control", f.token, encode(map[string]any{"command": "approve", "revision": run.Revision}))
			if response.Code != 200 {
				t.Fatalf("approve: %d %s", response.Code, response.Body.String())
			}
			run = f.load(t, run.ID)
			f.advance(t, &run)
			if run.Status != "running" || run.Result == nil || !run.Result.Pending {
				t.Fatalf("story queue: %+v", run)
			}
			runner := stories.Runner{Repo: executor.stories, Builder: story.New(engine, provider, limits)}
			if claimed, err := runner.Once(ctx); err != nil || !claimed {
				t.Fatalf("actual worker did not run: %t %v", claimed, err)
			}
			project, err := executor.stories.Get(ctx, f.user, projectID)
			if err != nil {
				t.Fatal(err)
			}
			if provider.mediaCalls != 1 || project.CurrentVersion != 1 || len(project.Versions) == 0 {
				t.Fatalf("real output was not independently inspected: calls=%d project=%+v", provider.mediaCalls, project)
			}
			version := project.Versions[0]
			if version.Output.Key == "" || len(version.Timeline) != 10 || math.Abs(version.Output.Duration-35) > .12 || !version.Output.Captions {
				t.Fatalf("incorrect actual montage: %+v", version)
			}
			output, err := storage.Path(version.Output.Key)
			if err != nil {
				t.Fatal(err)
			}
			stat, err := os.Stat(output)
			if err != nil || stat.Size() == 0 {
				t.Fatalf("actual output missing: %v", err)
			}
			probe := workflowCommand(t, "ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", output)
			if !strings.Contains(string(probe), `"video"`) || !strings.Contains(string(probe), `"audio"`) {
				t.Fatalf("actual MP4 missing streams: %s", probe)
			}
			pixels := workflowCommand(t, "ffmpeg", "-v", "error", "-ss", "0.8", "-i", output, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
			red, green := 0, 0
			for i := 0; i+2 < len(pixels); i += 3 {
				r, g, b := int(pixels[i]), int(pixels[i+1]), int(pixels[i+2])
				if r > g+80 && r > b+80 {
					red++
				}
				if g > r+80 && g > b+80 {
					green++
				}
			}
			if red < 1000 || green < 100 {
				t.Fatalf("requested logo/captions absent in actual export: red=%d green=%d", red, green)
			}
			f.advance(t, &run)
			if unavailable {
				if project.Status != "needs_review" || run.Status != "failed" {
					t.Fatalf("unavailable reviewer falsely completed: project=%s agent=%s", project.Status, run.Status)
				}
			} else {
				if project.Status != "ready" || run.Status != "completed" || run.Result == nil || run.Result.Pending {
					t.Fatalf("verified delivery did not complete: project=%s agent=%+v", project.Status, run)
				}
				response = f.call("GET", "/api/stories/"+projectID, f.token, "")
				if response.Code != 200 || !strings.Contains(response.Body.String(), `"preview_url"`) || !strings.Contains(response.Body.String(), "sig=") {
					t.Fatalf("verified signed export unavailable: %d %s", response.Code, response.Body.String())
				}
			}
			if err = f.db.QueryRow(`SELECT credits FROM users WHERE id=$1`, f.user).Scan(&credits); err != nil || credits != 90 {
				t.Fatalf("single execution charge incorrect: %d %v", credits, err)
			}
		})
	}
}
