package media

import (
	"context"
	"encoding/json"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"sneepcut/backend-go/internal/brand"
	"sneepcut/backend-go/internal/testdb"
	"strings"
	"testing"
)

func TestAgentGlobalLogoAttachDetachUndoAndOwnership(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	user := testUserID
	if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,'global-logo@example.invalid','credentials',100,'free')`, user); err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	storage, err := NewLocalStorage(root)
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()
	service := NewService(Config{LocalRoot: root}, db, storage, nil, nil)
	uuid := func() string {
		id, err := randomUUID()
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	create := func() (string, string) {
		id := uuid()
		key := "brand/" + user + "/" + id + ".png"
		file := filepath.Join(t.TempDir(), "logo.png")
		f, err := os.Create(file)
		if err != nil {
			t.Fatal(err)
		}
		if err = png.Encode(f, image.NewRGBA(image.Rect(0, 0, 4, 4))); err != nil {
			t.Fatal(err)
		}
		if err = f.Close(); err != nil {
			t.Fatal(err)
		}
		if err = storage.Save(ctx, file, key, "image/png"); err != nil {
			t.Fatal(err)
		}
		if _, err = db.Exec(`INSERT INTO workspace_agent_resources(id,user_id,kind,name,reference) VALUES($1,$2,'logo','Synthetic logo',$3)`, id, user, key); err != nil {
			t.Fatal(err)
		}
		return id, key
	}
	first, key := create()
	second, secondKey := create()
	state, err := brand.NewRepository(db).AgentRead(ctx, user)
	if err != nil {
		t.Fatal(err)
	}
	request := uuid()
	input := AgentLogoInput{ExpectedState: state.ExpectedState, LogoResourceID: &first}
	attached, err := service.AgentBrandLogo(ctx, user, request, "brand.logo.update", input)
	if err != nil || !attached.HasLogo {
		t.Fatalf("attach: %v %+v", err, attached)
	}
	replay, err := service.AgentBrandLogo(ctx, user, request, "brand.logo.update", input)
	if err != nil || replay != attached {
		t.Fatalf("receipt replay: %v", err)
	}
	raw, _ := json.Marshal(attached)
	if strings.Contains(string(raw), "brand/") {
		t.Fatal("private prior path leaked")
	}
	empty := ""
	detached, err := service.AgentBrandLogo(ctx, user, uuid(), "brand.logo.update", AgentLogoInput{ExpectedState: attached.ExpectedState, LogoResourceID: &empty})
	if err != nil || detached.HasLogo {
		t.Fatalf("detach: %v", err)
	}
	if exists, _ := storage.Exists(ctx, key); !exists {
		t.Fatal("detach removed shared story image")
	}
	restored, err := service.AgentBrandLogo(ctx, user, uuid(), "brand.logo.restore", AgentLogoInput{ExpectedState: detached.ExpectedState, ReceiptID: detached.UndoReceiptID})
	if err != nil || !restored.HasLogo {
		t.Fatalf("undo: %v", err)
	}
	// A manual logo writer changes the same digest and invalidates older Undo.
	if err = service.setBrandLogo(ctx, user, &secondKey); err != nil {
		t.Fatal(err)
	}
	if _, err = service.AgentBrandLogo(ctx, user, uuid(), "brand.logo.restore", AgentLogoInput{ExpectedState: restored.ExpectedState, ReceiptID: restored.UndoReceiptID}); err == nil {
		t.Fatal("late Undo overwrote manual logo")
	}
	state, _ = brand.NewRepository(db).AgentRead(ctx, user)
	foreign := uuid()
	if _, err = db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, foreign, foreign+"@example.invalid"); err != nil {
		t.Fatal(err)
	}
	foreignState, _ := brand.NewRepository(db).AgentRead(ctx, foreign)
	if _, err = service.AgentBrandLogo(ctx, foreign, uuid(), "brand.logo.update", AgentLogoInput{ExpectedState: foreignState.ExpectedState, LogoResourceID: &first}); err == nil {
		t.Fatal("foreign logo resource accepted")
	}
	if _, err = db.Exec(`UPDATE users SET access_role='viewer' WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	if _, err = service.AgentBrandLogo(ctx, user, uuid(), "brand.logo.update", AgentLogoInput{ExpectedState: state.ExpectedState, LogoResourceID: &second}); err == nil {
		t.Fatal("revoked member changed logo")
	}
}
