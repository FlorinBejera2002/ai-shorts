package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestReplayVerifiesEveryOriginalWhenDuplicateAnalysisIsShared(t *testing.T) {
	dir, _ := replayFixture(t)
	run, err := loadReplay(dir)
	if err != nil {
		t.Fatal(err)
	}
	original := run.request.Assets[0]
	duplicate := original
	duplicate.ID, duplicate.Key = "source-002", "sources/original-run/source-002.mp4"
	raw, err := os.ReadFile(filepath.Join(dir, "media", filepath.FromSlash(original.Key)))
	if err != nil {
		t.Fatal(err)
	}
	writeFixtureFile(t, filepath.Join(dir, "media", filepath.FromSlash(duplicate.Key)), raw)
	run.request.Assets = append(run.request.Assets, duplicate)
	inspector := &fixtureInspector{expected: original, root: filepath.Join(dir, "media")}
	if _, err := run.verifiedRequest(context.Background(), inspector, evalFlags{}); err != nil || inspector.calls != 2 {
		t.Fatalf("verified duplicate cache rejected or original not checked: %v, calls=%d", err, inspector.calls)
	}
	if err := os.WriteFile(filepath.Join(dir, "media", filepath.FromSlash(duplicate.Key)), []byte("changed original"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := run.verifiedRequest(context.Background(), inspector, evalFlags{}); err == nil {
		t.Fatal("shared proxy bypassed original checksum verification")
	}
}

func TestReplaySharedAnalysisRejectsUnrelatedOrEscapingReferences(t *testing.T) {
	for _, namespace := range []string{"analysis", "source-media"} {
		t.Run(namespace, func(t *testing.T) { testReplaySharedCacheReferences(t, namespace) })
	}
}

func testReplaySharedCacheReferences(t *testing.T, namespace string) {
	t.Helper()
	owner := story.Asset{ID: "one", Hash: strings.Repeat("a", 64), Size: 100, Duration: 8, Width: 640, Height: 480, AnalysisVersion: "analysis", ProxyKey: "work/run/analysis/one/analysis/proxy.mp4", ThumbnailKey: "work/run/analysis/one/analysis/thumbnail.jpg"}
	owner.ProxyKey = strings.Replace(owner.ProxyKey, "/analysis/", "/"+namespace+"/", 1)
	owner.ThumbnailKey = strings.Replace(owner.ThumbnailKey, "/analysis/", "/"+namespace+"/", 1)
	copy := owner
	copy.ID = "two"
	request := story.Request{ID: "run", Assets: []story.Asset{owner, copy}}
	if !replayAnalysisKeyAllowed(request, copy, owner.ThumbnailKey, true) {
		t.Fatal("verified duplicate thumbnail was rejected")
	}
	for _, key := range []string{"work/other/analysis/one/analysis/proxy.mp4", "work/run/analysis/missing/analysis/proxy.mp4", "work/run/analysis/two/../../one/proxy.mp4", owner.ThumbnailKey} {
		key = strings.Replace(key, "/analysis/", "/"+namespace+"/", 1)
		if replayAnalysisKeyAllowed(request, copy, key, false) {
			t.Fatalf("unowned proxy accepted: %s", key)
		}
	}
	for _, change := range []func(*story.Asset){
		func(a *story.Asset) { a.Hash = strings.Repeat("b", 64) },
		func(a *story.Asset) { a.Size++ },
		func(a *story.Asset) { a.Duration++ },
		func(a *story.Asset) { a.AnalysisVersion = "other" },
		func(a *story.Asset) { a.Kind = "narration" },
	} {
		altered := copy
		change(&altered)
		if replayAnalysisKeyAllowed(request, altered, owner.ProxyKey, false) {
			t.Fatal("incompatible source reused another source's analysis")
		}
	}
}
