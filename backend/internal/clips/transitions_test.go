package clips

import (
	"context"
	"github.com/julienschmidt/httprouter"
	"net/http/httptest"
	"sneepcut/backend-go/internal/testdb"
	"testing"
)

func TestTransitionActionRejectsViewers(t *testing.T) {
	r := httprouter.New()
	New(nil, fakeAuth{}, &fakeMedia{}, Config{}).Register(r)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("POST", "/api/clips/"+newID()+"/transitions", nil))
	if w.Code != 403 {
		t.Fatalf("viewer accepted: %d", w.Code)
	}
}

func TestPostgresTransitionReservationRequiresSavedAnalysis(t *testing.T) {
	db := testdb.Open(t)
	user, job, clip := seedClip(t, db)
	h := New(db, fakeAuth{true}, &fakeMedia{}, Config{})
	ctx := context.Background()
	if _, err := h.beginEdit(ctx, user, clip, "transition", map[string]any{}); err == nil {
		t.Fatal("legacy clip accepted without recipe")
	}
	if _, err := db.Exec(`UPDATE clips SET transition_state='{"recipe":{},"decisions":[{"index":0}]}'::jsonb WHERE id=$1`, clip); err != nil {
		t.Fatal(err)
	}
	if _, err := h.beginEdit(ctx, newID(), clip, "transition", map[string]any{}); err == nil {
		t.Fatal("another owner accepted")
	}
	if _, err := h.beginEdit(ctx, user, clip, "transition", map[string]any{}); err != nil {
		t.Fatal(err)
	}
	var kind, state string
	if err := db.QueryRow(`SELECT kind,state FROM edit_deliveries WHERE job_id=$1`, job).Scan(&kind, &state); err != nil || kind != "transition" || state != "pending" {
		t.Fatalf("durable edit: %s %s %v", kind, state, err)
	}
	if _, err := h.beginEdit(ctx, user, clip, "transition", map[string]any{}); err == nil {
		t.Fatal("concurrent edit accepted")
	}
}
