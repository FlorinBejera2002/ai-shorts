package worklimit

import (
	"sync"
	"testing"
)

func TestGateBoundsActiveWorkWithoutLimitingCompletedCollection(t *testing.T) {
	g := New(4, 2)
	for i := 0; i < 180; i++ {
		release, ok := g.Acquire("owner")
		if !ok {
			t.Fatal("completed work became a file-count cap", i)
		}
		release()
		release()
	}
	one, _ := g.Acquire("owner")
	two, _ := g.Acquire("owner")
	if _, ok := g.Acquire("owner"); ok {
		t.Fatal("per-account concurrency exceeded")
	}
	three, _ := g.Acquire("other")
	four, _ := g.Acquire("other")
	if _, ok := g.Acquire("third"); ok {
		t.Fatal("global concurrency exceeded")
	}
	var wg sync.WaitGroup
	for _, release := range []func(){one, two, three, four} {
		wg.Add(1)
		go func() { defer wg.Done(); release() }()
	}
	wg.Wait()
	if g.active != 0 || len(g.users) != 0 {
		t.Fatal("idle resource slots leaked")
	}
}
