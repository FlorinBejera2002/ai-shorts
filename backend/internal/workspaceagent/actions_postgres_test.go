package workspaceagent

import (
	"context"
	"encoding/json"
	"errors"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/stories"
	"sneepcut/backend-go/internal/story"
	"sneepcut/backend-go/internal/testdb"
	"strings"
	"testing"
)

func TestScriptCreationRetryAndOwnership(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	user, _ := data.NewUUID()
	other, _ := data.NewUUID()
	request, _ := data.NewUUID()
	for _, id := range []string{user, other} {
		if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, id, id+"@example.invalid"); err != nil {
			t.Fatal(err)
		}
	}
	e := NewExecutor(db, nil, story.DefaultLimits())
	a := Action{Name: "scripts.create", Input: json.RawMessage(`{"title":"Verified draft"}`)}
	for i := 0; i < 2; i++ {
		result, err := e.Execute(ctx, user, request, a)
		if err != nil {
			t.Fatal(err)
		}
		if result.Pending {
			t.Fatal("draft incorrectly pending")
		}
	}
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM scripts WHERE user_id=$1`, user).Scan(&count); err != nil || count != 1 {
		t.Fatalf("retry duplicated draft count=%d error=%v", count, err)
	}
	if _, err := e.Execute(ctx, other, request, Action{Name: "scripts.get", Input: actionJSON(map[string]any{"id": request})}); err == nil {
		t.Fatal("cross-user script read allowed")
	}
	a.Input = json.RawMessage(`{"title":"Different payload"}`)
	if _, err := e.Execute(ctx, user, request, a); err == nil {
		t.Fatal("conflicting idempotency key accepted")
	}
	update := Action{Name: "scripts.update", Input: actionJSON(map[string]any{"id": request, "revision": 1, "document": map[string]any{"title": "Updated draft"}})}
	updateID, _ := data.NewUUID()
	var undo Action
	for i := 0; i < 2; i++ {
		result, err := e.Execute(ctx, user, updateID, update)
		if err != nil {
			t.Fatal("update replay", err)
		}
		if i == 0 {
			if err = json.Unmarshal(result.Undo, &undo); err != nil {
				t.Fatal("missing undo", err)
			}
		}
	}
	var revision int
	if err := db.QueryRow(`SELECT revision FROM scripts WHERE id=$1`, request).Scan(&revision); err != nil || revision != 2 {
		t.Fatalf("revision=%d error=%v", revision, err)
	}
	differentID, _ := data.NewUUID()
	if _, err := e.Execute(ctx, user, differentID, update); err == nil {
		t.Fatal("stale competing update accepted")
	}
	undoID, _ := data.NewUUID()
	if _, err := e.Execute(ctx, user, undoID, undo); err != nil {
		t.Fatal("undo failed", err)
	}
	restored, err := e.scripts.Get(ctx, user, request)
	if err != nil || restored.Title != "Verified draft" || restored.Revision != 3 {
		t.Fatalf("undo did not restore metadata: %+v %v", restored, err)
	}
	// A later manual edit cannot be overwritten by an old undo receipt.
	laterID, _ := data.NewUUID()
	later := Action{Name: "scripts.update", Input: actionJSON(map[string]any{"id": request, "revision": 3, "document": map[string]any{"title": "Later manual edit"}})}
	if _, err = e.Execute(ctx, user, laterID, later); err != nil {
		t.Fatal(err)
	}
	staleUndoID, _ := data.NewUUID()
	if _, err = e.Execute(ctx, user, staleUndoID, undo); err == nil {
		t.Fatal("stale undo overwrote later edit")
	}
	final, err := e.scripts.Get(ctx, user, request)
	if err != nil || final.Title != "Later manual edit" {
		t.Fatalf("later edit not preserved: %+v %v", final, err)
	}
}

func TestBrandReadOmitsPrivateMediaReferences(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	user, _ := data.NewUUID()
	brandID, _ := data.NewUUID()
	if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, user, user+"@example.invalid"); err != nil {
		t.Fatal(err)
	}
	e := NewExecutor(db, nil, story.DefaultLimits())
	result, err := e.Execute(ctx, user, "", Action{Name: "brand.read", Input: json.RawMessage(`{}`)})
	if err != nil || !strings.Contains(string(result.Data), `"configured":false`) {
		t.Fatalf("missing brand response %+v %v", result, err)
	}
	if _, err = db.Exec(`INSERT INTO brand_kits(id,user_id,logo_path,primary_color,secondary_color,font_family,subtitle_font,subtitle_color,subtitle_bg_color,subtitle_bg_opacity,subtitle_position,watermark_position,watermark_opacity) VALUES($1,$2,'brand/private-secret.png','#112233','#000000','Inter','Inter Bold','#FFFFFF','#000000',0.7,'bottom','bottom-right',0.8)`, brandID, user); err != nil {
		t.Fatal(err)
	}
	result, err = e.Execute(ctx, user, "", Action{Name: "brand.read", Input: json.RawMessage(`{}`)})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(result.Data), "private-secret") || !strings.Contains(string(result.Data), "#112233") {
		t.Fatalf("incorrect brand projection %s", result.Data)
	}
}

func TestStoryCancellationRejectsSupersededRequest(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	user, _ := data.NewUUID()
	id, _ := data.NewUUID()
	oldRequest, _ := data.NewUUID()
	newRequest, _ := data.NewUUID()
	if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, user, user+"@example.invalid"); err != nil {
		t.Fatal(err)
	}
	repo := stories.NewRepository(db, story.DefaultLimits())
	if err := repo.Create(ctx, user, id, story.DefaultOptions()); err != nil {
		t.Fatal(err)
	}
	state, err := repo.AgentState(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`UPDATE story_projects SET options=jsonb_set(options,'{brief}','"Manually changed brief"') WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	if err = repo.Queue(ctx, user, id, stories.Generate{RequestID: oldRequest, ExpectedState: state}); !errors.Is(err, stories.ErrConflict) {
		t.Fatalf("stale draft proposal accepted: %v", err)
	}
	if _, err := db.Exec(`UPDATE story_projects SET request=jsonb_build_object('request_id',$2::text) WHERE id=$1`, id, newRequest); err != nil {
		t.Fatal(err)
	}
	if err := repo.CancelRequest(ctx, user, id, oldRequest); !errors.Is(err, stories.ErrConflict) {
		t.Fatalf("superseded request cancellation error=%v", err)
	}
	if err := repo.CancelRequest(ctx, user, id, newRequest); err != nil {
		t.Fatal("idempotent idle cancellation", err)
	}
}
