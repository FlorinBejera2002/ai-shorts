package feedback

import (
	"strings"
	"testing"
)

func TestValidate(t *testing.T) {
	job := "0b7a8a3e-2f7c-4c1a-9a55-3f2a1f6c9d10"
	cases := []struct {
		name  string
		input Input
		want  string
	}{
		{"problem", Input{Kind: KindProblem, Category: "clips", Message: "  The export froze  "}, ""},
		{"idea", Input{Kind: KindIdea, Category: "other", Message: "Dark captions"}, ""},
		{"problem needs a message", Input{Kind: KindProblem, Category: "clips", Message: "   "}, "Message is required"},
		{"problem needs a category", Input{Kind: KindProblem, Message: "Broken"}, "Choose a category"},
		{"message limit", Input{Kind: KindIdea, Category: "other", Message: strings.Repeat("ă", MaxMessage+1)}, "Message is too long"},
		{"clip rating", Input{Kind: KindClip, Rating: 3, JobID: job}, ""},
		{"clip rating range", Input{Kind: KindClip, Rating: 4, JobID: job}, "Rating must be between 1 and 3"},
		{"clip needs a job", Input{Kind: KindClip, Rating: 2, JobID: "../jobs"}, "A job is required"},
		{"unknown kind", Input{Kind: "spam"}, "Invalid feedback kind"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := c.input.Validate(); got != c.want {
				t.Fatalf("got %q, want %q", got, c.want)
			}
		})
	}
}

func TestValidateNormalizes(t *testing.T) {
	problem := Input{Kind: KindProblem, Category: "clips", Message: "  hi  ", Rating: 3, JobID: "x", Page: "/ro/dashboard/clips?token=secret#top"}
	if problem.Validate() != "" || problem.Message != "hi" || problem.Rating != 0 || problem.JobID != "" || problem.Page != "/ro/dashboard/clips" {
		t.Fatalf("problem was not normalized: %+v", problem)
	}
	clip := Input{Kind: KindClip, Category: "clips", Rating: 1, JobID: "0b7a8a3e-2f7c-4c1a-9a55-3f2a1f6c9d10"}
	if clip.Validate() != "" || clip.Category != "" {
		t.Fatalf("clip rating keeps no category: %+v", clip)
	}
}
