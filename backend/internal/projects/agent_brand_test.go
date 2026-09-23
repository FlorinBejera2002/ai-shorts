package projects

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestProjectBrandIsScopedPrivateReplayableAndUndoable(t *testing.T) {
	r, user, project, _ := libraryFixture(t)
	ctx := context.Background()
	logo := randomID()
	_, err := r.db.Exec(`INSERT INTO workspace_agent_resources(id,user_id,kind,name,reference,content) VALUES($1,$2,'logo','Logo','brand/private-test/logo.png','')`, logo, user)
	if err != nil {
		t.Fatal(err)
	}
	_, err = r.db.Exec(`UPDATE jobs SET project_brand='{"name":"Original","primaryColor":"#112233","logoPath":"brand/private-test/old.png"}' WHERE id=$1`, project)
	if err != nil {
		t.Fatal(err)
	}
	before, err := r.InspectProjectBrand(ctx, user, project)
	if err != nil {
		t.Fatal(err)
	}
	request := randomID()
	in := ProjectBrandInput{ProjectID: project, ExpectedState: before.ExpectedState, Settings: map[string]string{"subtitleColor": "#FFFFFF"}, LogoResourceID: &logo}
	changed, err := r.ChangeProjectBrand(ctx, user, request, "projects.brand.update", in)
	if err != nil {
		t.Fatal(err)
	}
	if changed.Settings["primaryColor"] != "#112233" || !changed.HasLogo {
		t.Fatalf("omitted settings lost: %+v", changed)
	}
	raw, _ := json.Marshal(changed)
	if strings.Contains(string(raw), "brand/private") || strings.Contains(string(raw), "logoPath") {
		t.Fatalf("private path leaked: %s", raw)
	}
	replay, err := r.ChangeProjectBrand(ctx, user, request, "projects.brand.update", in)
	if err != nil || replay.ExpectedState != changed.ExpectedState {
		t.Fatalf("replay %+v %v", replay, err)
	}
	undo := ProjectBrandInput{ProjectID: project, ExpectedState: changed.ExpectedState, ReceiptID: request}
	restored, err := r.ChangeProjectBrand(ctx, user, randomID(), "projects.brand.restore", undo)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Settings["name"] != "Original" || restored.Settings["subtitleColor"] != "" {
		t.Fatalf("restore %+v", restored)
	}
	var stored string
	if err = r.db.QueryRow(`SELECT project_brand->>'logoPath' FROM jobs WHERE id=$1`, project).Scan(&stored); err != nil || stored != "brand/private-test/old.png" {
		t.Fatalf("logo undo %s %v", stored, err)
	}
	if _, err = r.ChangeProjectBrand(ctx, user, randomID(), "projects.brand.restore", undo); !errors.Is(err, ErrLibraryChanged) {
		t.Fatalf("stale undo accepted: %v", err)
	}
	var global int
	if err = r.db.QueryRow(`SELECT count(*) FROM brand_kits WHERE user_id=$1`, user).Scan(&global); err != nil || global != 0 {
		t.Fatalf("global brand changed %d %v", global, err)
	}
}
func TestProjectBrandRejectsForeignResourcesAndInvalidValues(t *testing.T) {
	r, user, project, _ := libraryFixture(t)
	ctx := context.Background()
	state, err := r.InspectProjectBrand(ctx, user, project)
	if err != nil {
		t.Fatal(err)
	}
	unknown := randomID()
	cases := []ProjectBrandInput{
		{Settings: map[string]string{"primaryColor": "red"}},
		{Settings: map[string]string{"logoPath": "https://untrusted.invalid/logo.png"}},
		{LogoResourceID: &unknown},
	}
	for _, in := range cases {
		in.ProjectID = project
		in.ExpectedState = state.ExpectedState
		if _, err = r.ChangeProjectBrand(ctx, user, randomID(), "projects.brand.update", in); err == nil {
			t.Fatalf("invalid accepted %+v", in)
		}
	}
	if _, err = r.InspectProjectBrand(ctx, randomID(), project); err == nil {
		t.Fatal("other owner inspected brand")
	}
	after, err := r.InspectProjectBrand(ctx, user, project)
	if err != nil || after.ExpectedState != state.ExpectedState {
		t.Fatalf("failed edits mutated brand %+v %v", after, err)
	}
}
