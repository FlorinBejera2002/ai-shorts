package processing

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"

	"sneepcut/backend-go/internal/story"
)

func TestStudioNativeTransitionsPreserveAllNominalClocks(t *testing.T) {
	plan := studioPlan{
		Duration: 3,
		Scenes: []studioScene{
			{ID: "left", AssetID: "a", Duration: 1, SourceIn: 2, Crop: &studioCrop{X: 10, Width: 100, Height: 200}},
			{ID: "middle", AssetID: "b", Start: 1, Duration: 1, SourceIn: 4},
			{ID: "right", AssetID: "b", Start: 2, Duration: 1, SourceIn: 7},
		},
		Audio:    []studioAudio{{ID: "voice", AssetID: "voice", Duration: 3, SourceIn: 5, Volume: 1}},
		Captions: &studioCaption{Groups: [][]Word{{{Text: "word across cut", Start: .9, End: 1.1}}}},
	}
	before, _ := json.Marshal(plan)
	studioApplyNativeTransitions(&plan, nil)
	if plan.Scenes[0].TransitionIn != 0 || plan.Scenes[1].TransitionIn != .3 || plan.Scenes[2].TransitionIn != .3 {
		t.Fatalf("distinct shots were not blended: %+v", plan.Scenes)
	}
	for i := range plan.Scenes {
		plan.Scenes[i].TransitionIn = 0
	}
	after, _ := json.Marshal(plan)
	if string(before) != string(after) {
		t.Fatal("visual transition changed source selection, crop, audio, caption or duration")
	}
}

func TestStudioNativeTransitionEligibility(t *testing.T) {
	for _, test := range []struct {
		name      string
		change    func(*studioPlan)
		treatment string
		want      float64
	}{
		{name: "natural", treatment: "natural", want: .3},
		{name: "explicit smoothing", treatment: "crossfade", want: .3},
		{name: "explicit cut", treatment: "cut"},
		{name: "legacy dip", treatment: "fade"},
		{name: "continuous source", change: func(p *studioPlan) { p.Scenes[1].AssetID = "a"; p.Scenes[1].SourceIn = 1 }},
		{name: "gap", change: func(p *studioPlan) { p.Scenes[1].Start += .1 }},
		{name: "overlap", change: func(p *studioPlan) { p.Scenes[1].Start -= .1 }},
		{name: "existing fade", change: func(p *studioPlan) { p.Scenes[1].FadeIn = .1 }},
		{name: "short shot", change: func(p *studioPlan) { p.Scenes[1].Duration = .2 }, want: .1},
		{name: "subframe shot", change: func(p *studioPlan) { p.Scenes[1].Duration = .1 }},
		{name: "motion bridge priority", change: func(p *studioPlan) { studioAttachBridge(p, 0, "bridge") }},
	} {
		t.Run(test.name, func(t *testing.T) {
			plan := studioPlan{Scenes: []studioScene{{ID: "left", AssetID: "a", Duration: 1}, {ID: "right", AssetID: "b", Start: 1, Duration: 1}}}
			if test.change != nil {
				test.change(&plan)
			}
			studioApplyNativeTransitions(&plan, []string{"", test.treatment})
			if got := plan.Scenes[1].TransitionIn; got != test.want {
				t.Fatalf("transition duration = %v, want %v", got, test.want)
			}
		})
	}
}

func TestStudioGeneratedClipEmitsNativeBlendWithoutAudioOverlap(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	plan := captureStudioPlan(t, p)
	source := storySource(t, p, dir, "native-transition", "green", 440)
	in := RenderInput{UserID: studioTestOwner, Namespace: "native-transition/clip", SourceKey: source.Key, PreserveGeometry: true, NaturalTransitions: true, Segments: []Segment{{0, .6}, {1, 1.6}}}
	if _, err := p.Render(context.Background(), in); err == nil || len(plan.Scenes) != 2 {
		t.Fatal("native composition was not captured", err)
	}
	if plan.Duration != 1.2 || plan.Scenes[1].TransitionIn != .3 || plan.Scenes[1].Start != .6 || plan.Scenes[1].SourceIn != 1 {
		t.Fatalf("generated scene clock changed: %+v", plan)
	}
	if len(plan.Audio) != 2 || plan.Audio[1].Start != .6 || plan.Audio[1].SourceIn != 1 || len(plan.Audio[0].Envelope) != 0 || len(plan.Audio[1].Envelope) != 0 {
		t.Fatalf("native visual blend overlapped speech: %+v", plan.Audio)
	}
}

func TestStudioStoryEmitsDefaultAndRequestedNativeBlends(t *testing.T) {
	p, _, dir := storyTestProcessor(t)
	plan := captureStudioPlan(t, p)
	source := storySource(t, p, dir, "story-native-transition", "green", 440)
	request := story.Request{ID: "story-native-transition", UserID: studioTestOwner, Options: story.Options{AspectRatio: "16:9", CaptionMode: "off"}, Assets: []story.Asset{source}}
	version := story.Version{Timeline: []story.Entry{
		{BlockID: "left", OutputOut: .6, Video: story.Interval{SourceID: source.ID, Out: .6}, Audio: &story.Interval{SourceID: source.ID, Out: .6}, Crop: "fit"},
		{BlockID: "right", OutputIn: .6, OutputOut: 1.2, Video: story.Interval{SourceID: source.ID, In: 1, Out: 1.6}, Audio: &story.Interval{SourceID: source.ID, In: 1, Out: 1.6}, Crop: "fit"},
	}}
	for _, treatment := range []string{"natural", "crossfade", "cut"} {
		t.Run(treatment, func(t *testing.T) {
			version.Timeline[1].Transition = treatment
			before := append([]story.Entry(nil), version.Timeline...)
			if _, err := p.RenderStory(context.Background(), request, version); err == nil || len(plan.Scenes) != 2 {
				t.Fatal("native Story composition was not captured", err)
			}
			want := .3
			if treatment == "cut" {
				want = 0
			}
			if plan.Scenes[1].TransitionIn != want || plan.Duration != 1.2 || plan.Audio[1].Start != .6 || plan.Audio[1].SourceIn != 1 || !reflect.DeepEqual(before, version.Timeline) {
				t.Fatalf("Story treatment or clocks changed: %+v", plan)
			}
		})
	}
}
