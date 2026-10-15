package assistant

import "testing"

func TestAdminCanPersistAssistantConversationWithNoCredits(t *testing.T) {
	f := newChatFixture(t)
	if _, err := f.db.Exec(`UPDATE users SET access_role='admin',credits=0 WHERE id=$1`, f.user); err != nil {
		t.Fatal(err)
	}
	w := f.call("POST", "/api/assistant/chat", f.token, `{"context":"create","message":"Make subtitles bold"}`)
	if w.Code != 200 || f.count(t, f.user) != 2 {
		t.Fatalf("admin chat: %d %s", w.Code, w.Body.String())
	}
	if _, err := f.db.Exec(`UPDATE users SET access_role='viewer' WHERE id=$1`, f.user); err != nil {
		t.Fatal(err)
	}
	w = f.call("POST", "/api/assistant/chat", f.token, `{"context":"create","message":"Make subtitles bold"}`)
	if w.Code != 403 || f.count(t, f.user) != 2 {
		t.Fatalf("viewer persisted conversation: %d %s", w.Code, w.Body.String())
	}
}
