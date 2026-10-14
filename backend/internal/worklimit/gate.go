// Package worklimit bounds active expensive work without limiting project collections.
package worklimit

import "sync"

// Gate is process-local; each API replica has a fixed total resource budget.
// Idle account keys are removed, so the bookkeeping cannot grow with account count.
type Gate struct {
	mu             sync.Mutex
	active         int
	users          map[string]int
	total, perUser int
}

func New(total, perUser int) *Gate {
	return &Gate{total: total, perUser: perUser, users: make(map[string]int)}
}
func (g *Gate) Acquire(user string) (func(), bool) {
	g.mu.Lock()
	if user == "" || g.active >= g.total || g.users[user] >= g.perUser {
		g.mu.Unlock()
		return nil, false
	}
	g.active++
	g.users[user]++
	g.mu.Unlock()
	var once sync.Once
	return func() {
		once.Do(func() {
			g.mu.Lock()
			defer g.mu.Unlock()
			g.active--
			g.users[user]--
			if g.users[user] == 0 {
				delete(g.users, user)
			}
		})
	}, true
}
