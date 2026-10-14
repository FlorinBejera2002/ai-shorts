package stories

import (
	"context"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/captions"
	"sneepcut/backend-go/internal/story"
	"strings"
	"testing"
)

func TestBrandKitCaptionSnapshotReachesStoryGeneration(t *testing.T) {
	r, user, id, ids := fixture(t, 1)
	ctx := context.Background()
	style := captions.Default()
	style.Position = captions.Position{X: .4, Y: .3, Anchor: "center"}
	raw, _ := json.Marshal(style)
	if _, e := r.db.Exec(`INSERT INTO brand_kits(id,user_id,primary_color,secondary_color,font_family,subtitle_font,subtitle_color,subtitle_bg_color,subtitle_bg_opacity,subtitle_position,watermark_position,watermark_opacity,caption_style,watermark_enabled) VALUES($1,$2,'#123456','#ffffff','Inter','Inter Bold','#ffffff','#000000',0,'bottom','bottom-right',0.8,$3,false)`, newID(), user, string(raw)); e != nil {
		t.Fatal(e)
	}
	options := story.DefaultOptions()
	options.UseBrandKit = true
	options.Captions = true
	if e := r.Patch(ctx, user, id, Patch{Options: &options}); e != nil {
		t.Fatal(e)
	}
	if e := r.Queue(ctx, user, id, Generate{RequestID: newID(), AssetIDs: ids}); e != nil {
		t.Fatal(e)
	}
	var payload []byte
	if e := r.db.QueryRow(`SELECT request FROM story_projects WHERE id=$1`, id).Scan(&payload); e != nil {
		t.Fatal(e)
	}
	var envelope struct {
		Input story.Request `json:"input"`
	}
	if e := json.Unmarshal(payload, &envelope); e != nil {
		t.Fatal(e)
	}
	if envelope.Input.Options.CaptionStyle == nil || *envelope.Input.Options.CaptionStyle != style || envelope.Input.LogoKey != "" {
		t.Fatalf("brand not applied %#v", envelope.Input)
	}
	// A later global Brand Kit change must not rewrite the project's snapshot.
	if _, e := r.db.Exec(`UPDATE brand_kits SET caption_style=NULL WHERE user_id=$1`, user); e != nil {
		t.Fatal(e)
	}
	tx, e := r.db.BeginTx(ctx, nil)
	if e != nil {
		t.Fatal(e)
	}
	defer tx.Rollback()
	request := story.Request{ID: id, UserID: user, Options: options}
	if e = resolveStoryLogo(ctx, tx, &request); e != nil {
		t.Fatal(e)
	}
	if request.Options.CaptionStyle == nil || *request.Options.CaptionStyle != style {
		t.Fatal("global changes changed saved project")
	}
}

func TestLegacyUnavailableCaptionFontDoesNotBlockLogoOnlyStory(t *testing.T) {
	for _, mode := range []string{"off", "all"} {
		t.Run(mode, func(t *testing.T) {
			r, user, id, ids := fixture(t, 1)
			ctx := context.Background()
			logo := "brand/" + user + "/" + newID() + ".png"
			if _, err := r.db.Exec(`INSERT INTO brand_kits(id,user_id,primary_color,secondary_color,font_family,subtitle_font,subtitle_color,subtitle_bg_color,subtitle_bg_opacity,subtitle_position,watermark_position,watermark_opacity,logo_path,watermark_enabled) VALUES($1,$2,'#123456','#ffffff','Inter','Impact','#ffffff','#000000',0,'bottom','bottom-right',0.8,$3,true)`, newID(), user, logo); err != nil {
				t.Fatal(err)
			}
			options := story.DefaultOptions()
			options.UseBrandKit = true
			options.CaptionMode = mode
			options.Captions = mode != "off"
			if err := r.Patch(ctx, user, id, Patch{Options: &options}); err != nil {
				t.Fatal(err)
			}
			err := r.Queue(ctx, user, id, Generate{RequestID: newID(), AssetIDs: ids})
			if mode == "all" {
				if !errors.Is(err, ErrInvalid) || !strings.Contains(err.Error(), "choose an available caption font or upload your saved font") {
					t.Fatalf("missing actionable caption font error: %v", err)
				}
				if got := credits(t, r, user); got != 100 {
					t.Fatalf("failed caption validation charged credits: %d", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("logo-only generation rejected unavailable caption font: %v", err)
			}
			var payload, snapshot []byte
			if err = r.db.QueryRow(`SELECT request,brand_snapshot FROM story_projects WHERE id=$1`, id).Scan(&payload, &snapshot); err != nil {
				t.Fatal(err)
			}
			var envelope struct {
				Input story.Request `json:"input"`
			}
			if err = json.Unmarshal(payload, &envelope); err != nil {
				t.Fatal(err)
			}
			if envelope.Input.LogoKey != logo || envelope.Input.Options.CaptionStyle != nil || story.EffectiveCaptionMode(envelope.Input.Options) != "off" {
				t.Fatalf("logo-only request changed %#v", envelope.Input)
			}
			var saved map[string]any
			if err = json.Unmarshal(snapshot, &saved); err != nil || saved["subtitle_font"] != "Impact" {
				t.Fatalf("legacy snapshot was lost %#v %v", saved, err)
			}
			// A future explicit enable still validates the saved kit, even if
			// the global kit now has an available font.
			if _, err = r.db.Exec(`UPDATE brand_kits SET subtitle_font='Inter Bold' WHERE user_id=$1`, user); err != nil {
				t.Fatal(err)
			}
			tx, err := r.db.BeginTx(ctx, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback()
			options.CaptionMode = "all"
			options.Captions = true
			request := story.Request{ID: id, UserID: user, Options: options}
			err = resolveStoryLogo(ctx, tx, &request)
			if !errors.Is(err, ErrInvalid) || !strings.Contains(err.Error(), "choose an available caption font or upload your saved font") {
				t.Fatalf("later enable skipped saved font validation: %v", err)
			}
		})
	}
}
