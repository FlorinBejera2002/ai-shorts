package story

import (
	"context"
	"errors"
	"strings"
	"testing"
)

type failedMusicSourceMedia struct{ semanticMedia }

func (*failedMusicSourceMedia) PrepareStoryMusic(context.Context, MusicSelection) (*PreparedMusic, error) {
	prepared, _ := musicFixture()
	return prepared, nil
}

func TestMusicSourceFailureStopsBeforePlanningAndRendering(t *testing.T) {
	req := fixtureRequest()
	_, req.Options.Music = musicFixture()
	req.Options.Music.Sync = true
	media := &failedMusicSourceMedia{semanticMedia: semanticMedia{err: errors.New("AI provider credit or API-key spending limit was reached")}}
	ai := &fakeGenerator{}
	_, err := New(media, ai, DefaultLimits()).Run(context.Background(), req, &memoryCheckpoints{})
	if err == nil || !strings.Contains(err.Error(), "spending limit") || media.semanticCalls != 1 || ai.calls != 0 || len(media.renders) != 0 {
		t.Fatalf("music source failure became a paid fallback draft: err=%v semantic=%d ai=%d renders=%d", err, media.semanticCalls, ai.calls, len(media.renders))
	}
}
