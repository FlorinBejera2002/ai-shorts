package projects

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"sneepcut/backend-go/internal/testdb"
)

func TestCollectionsHoldClipsFromAnySource(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	user, other := randomID(), randomID()
	first, second, foreign := randomID(), randomID(), randomID()
	clipA, clipB, foreignClip := randomID(), randomID(), randomID()
	for _, id := range []string{user, other} {
		if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan) VALUES($1,$2,'credentials',100,'free')`, id, id+"@example.invalid"); err != nil {
			t.Fatal(err)
		}
	}
	for _, pair := range [][2]string{{first, user}, {second, user}, {foreign, other}} {
		if _, err := db.Exec(`INSERT INTO jobs(id,user_id,source_type,status,progress,num_clips_requested,aspect_ratio,subtitle_style,include_brand,credits_charged) VALUES($1,$2,'upload','completed',100,5,'9:16','default',false,50)`, pair[0], pair[1]); err != nil {
			t.Fatal(err)
		}
	}
	for _, c := range [][3]string{{clipA, user, first}, {clipB, user, second}, {foreignClip, other, foreign}} {
		if _, err := db.Exec(`INSERT INTO clips(id,user_id,job_id,title,start_time,end_time,duration,file_path,resolution,viral_score,file_size,aspect_ratio,has_subtitles) VALUES($1,$2,$3,'Fixture',0,10,10,'fixture.mp4','1080x1920',8,1024,'9:16',false)`, c[0], c[1], c[2]); err != nil {
			t.Fatal(err)
		}
	}
	repo := NewRepository(db, nil)
	podcast, err := repo.CreateCollection(ctx, user, CollectionInput{Name: " Podcast "})
	if err != nil || podcast["name"] != "Podcast" {
		t.Fatalf("create: %v %v", podcast, err)
	}
	if _, err = repo.CreateCollection(ctx, user, CollectionInput{Name: "podcast"}); !errors.Is(err, ErrConflict) {
		t.Fatalf("duplicate name: got %v", err)
	}
	if _, err = repo.CreateCollection(ctx, other, CollectionInput{Name: "Podcast"}); err != nil {
		t.Fatalf("names are per account: %v", err)
	}
	id := podcast["id"].(string)
	for _, clip := range []string{clipA, clipB} {
		if err = repo.MoveToCollection(ctx, user, clip, &id); err != nil {
			t.Fatalf("move %s: %v", clip, err)
		}
	}
	if err = repo.MoveToCollection(ctx, user, foreignClip, &id); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("foreign clip: got %v", err)
	}
	if err = repo.MoveToCollection(ctx, other, foreignClip, &id); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("foreign project: got %v", err)
	}
	listed, err := repo.List(ctx, user)
	if err != nil {
		t.Fatal(err)
	}
	collections := listed["collections"].([]map[string]any)
	if len(collections) != 1 || collections[0]["id"] != id {
		t.Fatalf("collections: %v", collections)
	}
	// Stars belong to the clip owner and show in the library listing.
	if err = repo.SetFavorite(ctx, user, clipA, true); err != nil {
		t.Fatal(err)
	}
	if err = repo.SetFavorite(ctx, other, clipB, true); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("foreign favorite: got %v", err)
	}
	if listed, err = repo.List(ctx, user); err != nil {
		t.Fatal(err)
	}
	stars := map[any]any{}
	for _, project := range listed["projects"].([]map[string]any) {
		for _, clip := range project["clips"].([]map[string]any) {
			stars[clip["id"]] = clip["favorite"]
		}
	}
	if stars[clipA] != true || stars[clipB] != false {
		t.Fatalf("favorites: %v", stars)
	}
	if err = repo.SetFavorite(ctx, user, clipA, false); err != nil {
		t.Fatal(err)
	}
	if err = repo.RenameCollection(ctx, user, id, CollectionInput{Name: "Interviuri"}); err != nil {
		t.Fatal(err)
	}
	if err = repo.RenameCollection(ctx, other, id, CollectionInput{Name: "Stolen"}); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("foreign rename: got %v", err)
	}
	if err = repo.DeleteCollection(ctx, user, id); err != nil {
		t.Fatal(err)
	}
	var filed int
	if err = db.QueryRow(`SELECT count(*) FROM clips WHERE id IN ($1,$2) AND folder_id IS NOT NULL`, clipA, clipB).Scan(&filed); err != nil || filed != 0 {
		t.Fatalf("clips stay in the library without a project: %d %v", filed, err)
	}
	if err = repo.MoveToCollection(ctx, user, clipA, nil); err != nil {
		t.Fatalf("move out of every project: %v", err)
	}
}
