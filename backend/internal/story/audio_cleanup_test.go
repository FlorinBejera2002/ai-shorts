package story

import (
	"context"

	"sneepcut/backend-go/internal/audiocleanup"
	"testing"
)

type cleanupMedia struct {
	fakeMedia
	err   error
	calls int
}

func (m *cleanupMedia) PrepareStoryAudio(_ context.Context, _ string, a Asset) (Asset, error) {
	m.calls++
	a.AudioCleanup = &audiocleanup.Derivative{Status: "ready"}
	if m.err != nil {
		a.AudioCleanup.Status = "failed"
		a.AudioCleanup.Message = m.err.Error()
	}
	return a, m.err
}
func TestAudioCleanupDisabledNeverInvokesProvider(t *testing.T) {
	m := &cleanupMedia{}
	s := runState{builder: &Builder{media: m}, req: Request{Options: DefaultOptions()}}
	if err := s.prepareAudio(context.Background()); err != nil || m.calls != 0 {
		t.Fatalf("opt-in violated: %v", err)
	}
}
func TestAudioCleanupStyleIsReversibleAndLegacyDefaultsOff(t *testing.T) {
	before := DefaultOptions()
	if audiocleanup.Enabled(before.AudioCleanup) {
		t.Fatal("legacy enabled cleanup")
	}
	after, err := ApplyStyle(before, Style{AudioCleanup: &audiocleanup.Settings{Enabled: true}})
	if err != nil || !audiocleanup.Enabled(after.AudioCleanup) || before.AudioCleanup != nil {
		t.Fatalf("enable mutated original: %v", err)
	}
	restored, err := ApplyStyle(after, Style{AudioCleanup: &audiocleanup.Settings{Enabled: false}})
	if err != nil || audiocleanup.Enabled(restored.AudioCleanup) || !audiocleanup.Enabled(after.AudioCleanup) {
		t.Fatalf("disable mutated original: %v", err)
	}

}

func TestAudioCleanupFailureIsCheckpointedWithoutRendering(t *testing.T) {
	m := &cleanupMedia{err: &audiocleanup.Failure{Message: "fixture cleanup failed"}}
	checkpoints := &memoryCheckpoints{}
	options := DefaultOptions()
	options.AudioCleanup = &audiocleanup.Settings{Enabled: true}
	a := fixtureAsset()
	s := runState{builder: &Builder{media: m}, req: Request{ID: "project", Options: options, Assets: []Asset{a}}, checkpoints: checkpoints}
	if err := s.prepareAudio(context.Background()); err == nil {
		t.Fatal("failure hidden")
	}
	if len(checkpoints.assets) != 1 || checkpoints.assets[0].AudioCleanup.Status != "failed" || checkpoints.assets[0].Key != a.Key || len(m.renders) != 0 {
		t.Fatal("failure was not reversibly checkpointed")
	}
}
