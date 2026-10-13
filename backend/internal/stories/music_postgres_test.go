package stories

import (
	"context"
	"reflect"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestMusicSelectionAndVersionCreditsSurviveDatabaseRoundTrip(t *testing.T) {
	r, user, id, ids := fixture(t, 2)
	ctx := context.Background()
	options := story.DefaultOptions()
	options.Music = &story.MusicSelection{TrackID: "incompetech:USUAN0000001", Volume: .18, Sync: true}
	if err := r.Patch(ctx, user, id, Patch{Options: &options}); err != nil {
		t.Fatal(err)
	}
	p, err := r.Get(ctx, user, id)
	if err != nil || !reflect.DeepEqual(p.Options.Music, options.Music) {
		t.Fatalf("music selection did not survive reload: %+v %v", p.Options.Music, err)
	}
	e := queue(t, r, user, id, ids)
	if !reflect.DeepEqual(e.Input.Options.Music, options.Music) {
		t.Fatal("worker request lost music selection")
	}
	v := version(id, 1)
	v.RenderOptions = &options
	v.MusicSync = &story.MusicSync{Status: "partial", AdjustedCuts: 1}
	v.Output.Music = &story.MusicCredit{TrackID: options.Music.TrackID, Title: "Synthetic fixture", Artist: "Test author", License: "CC BY 4.0", Attribution: "Test credit with adaptation notice", SyncStatus: "partial", AdjustedCuts: 1, BPM: 120}
	if err = e.SaveVersion(ctx, v); err != nil {
		t.Fatal(err)
	}
	p, err = r.Get(ctx, user, id)
	if err != nil || len(p.Versions) != 1 || !reflect.DeepEqual(p.Versions[0].Output.Music, v.Output.Music) || !reflect.DeepEqual(p.Versions[0].MusicSync, v.MusicSync) {
		t.Fatalf("render credits or sync evidence were lost: %+v %v", p.Versions, err)
	}
}

func TestMusicCanBeRemovedFromDraft(t *testing.T) {
	r, user, id, _ := fixture(t, 1)
	options := story.DefaultOptions()
	options.Music = &story.MusicSelection{TrackID: "incompetech:USUAN0000001", Volume: 0, Sync: false}
	if err := r.Patch(context.Background(), user, id, Patch{Options: &options}); err != nil {
		t.Fatal(err)
	}
	options.Music = nil
	if err := r.Patch(context.Background(), user, id, Patch{Options: &options}); err != nil {
		t.Fatal(err)
	}
	p, err := r.Get(context.Background(), user, id)
	if err != nil || p.Options.Music != nil {
		t.Fatal("removed draft music returned after reload", err)
	}
}
