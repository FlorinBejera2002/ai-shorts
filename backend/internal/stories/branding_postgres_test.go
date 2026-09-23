package stories

import (
	"context"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/story"
	"testing"
)

func TestStoryQueueResolvesOnlyOwnedProjectLogo(t *testing.T) {
	for _, mode := range []string{"own", "foreign-user", "foreign-project", "unsafe-key"} {
		t.Run(mode, func(t *testing.T) {
			r, user, id, ids := fixture(t, 1)
			ctx := context.Background()
			resource := newID()
			owner, project := user, id
			key := "brand/" + user + "/logo.png"
			if mode == "foreign-user" {
				owner = newID()
				if _, err := r.db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, owner, owner+"@example.invalid"); err != nil {
					t.Fatal(err)
				}
			}
			if mode == "foreign-project" {
				project = newID()
				if err := r.Create(ctx, user, project, story.DefaultOptions()); err != nil {
					t.Fatal(err)
				}
			}
			if mode == "unsafe-key" {
				key = "brand/other/logo.png"
			}
			if _, err := r.db.Exec(`INSERT INTO workspace_agent_resources(id,user_id,project_id,kind,name,reference) VALUES($1,$2,$3,'logo','Test logo',$4)`, resource, owner, project, key); err != nil {
				t.Fatal(err)
			}
			options := story.DefaultOptions()
			options.TargetSeconds = 35
			options.LogoResourceID = resource
			if err := r.Patch(ctx, user, id, Patch{Options: &options}); err != nil {
				t.Fatal(err)
			}
			err := r.Queue(ctx, user, id, Generate{RequestID: newID(), AssetIDs: ids})
			if mode != "own" {
				if !errors.Is(err, ErrInvalid) || credits(t, r, user) != 100 {
					t.Fatalf("unowned logo queued/charged: %v", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			var raw []byte
			if err = r.db.QueryRow(`SELECT request FROM story_projects WHERE id=$1`, id).Scan(&raw); err != nil {
				t.Fatal(err)
			}
			var envelope struct {
				Input story.Request `json:"input"`
			}
			err = json.Unmarshal(raw, &envelope)
			request := envelope.Input
			if err != nil || request.LogoKey != key || request.Options.TargetSeconds != 35 {
				t.Fatalf("private queued brand unresolved: %#v %v", request, err)
			}
		})
	}
}
