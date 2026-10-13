package stories

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCreateExplainsCaptionConflictBeforeAccessingDatabase(t *testing.T) {
	h := &Handler{}
	req := httptest.NewRequest("POST", "/api/stories", strings.NewReader(`{"id":"synthetic","options":{"brief":"Fără subtitrări.","caption_mode":"all","caption_mode_revised":true}}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.create(w, req)
	if w.Code != 422 || !strings.Contains(w.Body.String(), "brief requests caption mode") {
		t.Fatalf("caption conflict was hidden: %d %s", w.Code, w.Body.String())
	}
}
