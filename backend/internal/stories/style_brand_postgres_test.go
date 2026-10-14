package stories

import (
	"context"
	"encoding/json"
	"sneepcut/backend-go/internal/captions"
	"sneepcut/backend-go/internal/story"
	"testing"
)

func TestExistingStorySwitchToBrandKitReplacesCustomCaptionStyle(t *testing.T) {
	r, user, id, ids := fixture(t, 1)
	ctx := context.Background()
	kit := captions.Default()
	kit.Preset = "active-color"
	kit.Position = captions.Position{X: .4, Y: .3, Anchor: "center"}
	raw, _ := json.Marshal(kit)
	if _, err := r.db.Exec(`INSERT INTO brand_kits(id,user_id,primary_color,secondary_color,font_family,subtitle_font,subtitle_color,subtitle_bg_color,subtitle_bg_opacity,subtitle_position,watermark_position,watermark_opacity,caption_style,watermark_enabled) VALUES($1,$2,'#123456','#ffffff','Inter','Inter Bold','#ffffff','#000000',0,'bottom','bottom-right',0.8,$3,false)`, newID(), user, string(raw)); err != nil {
		t.Fatal(err)
	}
	before := story.DefaultOptions()
	custom := captions.Default()
	custom.Size = .073
	before.CaptionStyle = &custom
	if err := r.Patch(ctx, user, id, Patch{Options: &before}); err != nil {
		t.Fatal(err)
	}
	e := queue(t, r, user, id, ids)
	accepted := version(id, 1)
	accepted.RenderOptions = &before
	if err := e.SaveVersion(ctx, accepted); err != nil {
		t.Fatal(err)
	}
	if err := e.finish(ctx, story.Result{Best: accepted}, nil); err != nil {
		t.Fatal(err)
	}
	state, err := r.AgentState(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	enabled := true
	if err = r.Queue(ctx, user, id, Generate{RequestID: newID(), Action: "restyle", Version: 1, ExpectedState: state, Style: &story.Style{UseBrandKit: &enabled}}); err != nil {
		t.Fatal(err)
	}
	var payload []byte
	if err = r.db.QueryRow(`SELECT request FROM story_projects WHERE id=$1`, id).Scan(&payload); err != nil {
		t.Fatal(err)
	}
	var envelope struct {
		Input story.Request `json:"input"`
	}
	if err = json.Unmarshal(payload, &envelope); err != nil {
		t.Fatal(err)
	}
	request := envelope.Input
	if request.Options.CaptionStyle == nil || *request.Options.CaptionStyle != kit || !request.Options.UseBrandKit {
		t.Fatalf("existing video kept stale caption style: %+v", request.Options)
	}
	if request.Base == nil || request.Base.RenderOptions == nil || request.Base.RenderOptions.CaptionStyle == nil || *request.Base.RenderOptions.CaptionStyle != custom {
		t.Fatal("previous version lost its original custom style")
	}
}
