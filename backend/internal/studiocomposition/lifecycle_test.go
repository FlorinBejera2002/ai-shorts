package studiocomposition

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCleanupIsOwnerBoundAndRequiresConfirmedDeletion(t *testing.T) {
	confirmed := true
	operations := []string{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("X-Studio-Composition-Grant"), testOwner+":") {
			t.Error("missing owner grant")
		}
		var body struct {
			Operation string                     `json:"operation"`
			Input     map[string]json.RawMessage `json:"input"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		operations = append(operations, body.Operation)
		if body.Operation == "composition.delete_scope" {
			var scope string
			_ = json.Unmarshal(body.Input["scope_id"], &scope)
			if scope != Scope(testOwner, "job") {
				t.Error("wrong cleanup scope")
			}
		}
		_ = json.NewEncoder(w).Encode(map[string]bool{"deleted": confirmed})
	}))
	defer server.Close()
	client, err := New(server.URL, strings.Repeat("s", 32))
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err = client.DeleteScope(ctx, testOwner, Scope(testOwner, "job")); err != nil {
		t.Fatal(err)
	}
	if err = client.Delete(ctx, testOwner, []string{Identity(testOwner, "clip", nil)}); err != nil {
		t.Fatal(err)
	}
	if err = client.PurgeOwner(ctx, testOwner); err != nil {
		t.Fatal(err)
	}
	confirmed = false
	if err = client.PurgeOwner(ctx, testOwner); err == nil {
		t.Fatal("unconfirmed cleanup accepted")
	}
	if err = client.Delete(ctx, testOwner, []string{"invalid"}); err == nil {
		t.Fatal("invalid deletion identity accepted")
	}
	if strings.Join(operations, ",") != "composition.delete_scope,composition.delete,composition.purge_owner,composition.purge_owner" {
		t.Fatal(operations)
	}
	if Scope(testOwner, "job") == Scope(testOwner, "other") || Scope(testOwner, "job") == Scope("22222222-2222-4222-8222-222222222222", "job") {
		t.Fatal("scope collision")
	}
}
