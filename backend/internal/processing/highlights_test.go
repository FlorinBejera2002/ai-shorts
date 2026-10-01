package processing

import (
	"context"
	"strings"
	"testing"
)

type highlightGenerator func(context.Context, string) (string, error)

func (generator highlightGenerator) Generate(ctx context.Context, prompt string) (string, error) {
	return generator(ctx, prompt)
}

func TestHighlightsPassCreatorDirectionAndRejectInvalidOrRepeatedCuts(t *testing.T) {
	var received string
	generator := highlightGenerator(func(_ context.Context, prompt string) (string, error) {
		received = prompt
		return `{"shorts":[
			{"segments":[{"start":0,"end":70}],"transition":"cut","viral_score":8},
			{"segments":[{"start":10,"end":35}],"transition":"cut","viral_score":14,"video_title_for_youtube_short":" First ","viral_hook_text":" Hook "},
			{"segments":[{"start":15,"end":37}],"transition":"cut","viral_score":9},
			{"segments":[{"start":60,"end":82}],"transition":"cut","viral_score":7}
		]}`, nil
	})
	processor := New(Config{}, nil, generator)
	got, err := processor.highlights(context.Background(), Transcript{Duration: 120, Text: "source"}, 3, "Keep the pricing example")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(received, "Keep the pricing example") || !strings.Contains(received, "Never invent spoken claims") {
		t.Fatalf("quality contract or creator direction missing from prompt: %s", received)
	}
	if len(got) != 2 || got[0].Segments[0].Start != 10 || got[1].Segments[0].Start != 60 {
		t.Fatalf("invalid or repetitive highlights were retained: %#v", got)
	}
	if got[0].Score != 10 || got[0].Title != "First" || got[0].Hook != "Hook" {
		t.Fatalf("metadata was not normalized: %#v", got[0])
	}
}

func TestValidateSegmentsUsesTotalEditedDuration(t *testing.T) {
	for name, segments := range map[string][]Segment{
		"too short": {{Start: 0, End: 8}, {Start: 20, End: 25}},
		"too long":  {{Start: 0, End: 35}, {Start: 40, End: 70}},
	} {
		t.Run(name, func(t *testing.T) {
			if err := validateSegments(segments, 100); err == nil {
				t.Fatalf("expected total duration validation for %#v", segments)
			}
		})
	}
	if err := validateSegments([]Segment{{Start: 0, End: 8}, {Start: 20, End: 28}}, 100); err != nil {
		t.Fatalf("valid composed duration rejected: %v", err)
	}
	if err := validateSegments([]Segment{{Start: 0, End: 9}}, 9); err != nil {
		t.Fatalf("short source should be allowed: %v", err)
	}
}
