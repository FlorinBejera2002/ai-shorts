package publishing

import (
	"context"
	"sneepcut/backend-go/internal/data"
	"testing"
)

func TestAgentDisconnectFrozenOwnedAccountAndReplay(t *testing.T) {
	h, user, clip, account := fixture(t)
	ctx := context.Background()
	// Facebook follows the normal local disconnect branch without invoking a
	// remote revocation endpoint; the fixture never contacts a provider.
	if _, err := h.db.Exec(`UPDATE social_accounts SET provider='facebook',credentials='synthetic' WHERE id=$1`, account); err != nil {
		t.Fatal(err)
	}
	accounts, err := h.AgentAccounts(ctx, user)
	if err != nil || len(accounts) != 1 {
		t.Fatalf("accounts %+v %v", accounts, err)
	}
	in := AgentDisconnectInput{ID: account, ExpectedState: accounts[0].ExpectedState}
	request, _ := data.NewUUID()
	foreign, _ := data.NewUUID()
	if _, err = h.AgentDisconnect(ctx, foreign, request, in); err == nil {
		t.Fatal("foreign disconnect")
	}
	if _, err = h.db.Exec(`UPDATE social_accounts SET remote_id='changed-target' WHERE id=$1`, account); err != nil {
		t.Fatal(err)
	}
	if _, err = h.AgentDisconnect(ctx, user, request, in); err == nil {
		t.Fatal("stale disconnect")
	}
	accounts, err = h.AgentAccounts(ctx, user)
	if err != nil {
		t.Fatal(err)
	}
	in.ExpectedState = accounts[0].ExpectedState
	post, _ := data.NewUUID()
	if _, err = h.db.Exec(`INSERT INTO social_posts(id,user_id,account_id,clip_id,provider,caption,options,idempotency_key,request_hash,media_reference,status) VALUES($1::uuid,$2,$3,$4,'facebook','fixture','{}',$1::text,'fixture','clips/test.mp4','queued')`, post, user, account, clip); err != nil {
		t.Fatal(err)
	}
	result, err := h.AgentDisconnect(ctx, user, request, in)
	if err != nil || !result.Disconnected || result.ProviderRevoked {
		t.Fatalf("disconnect %+v %v", result, err)
	}
	result, err = h.AgentDisconnect(ctx, user, request, in)
	if err != nil || !result.Disconnected {
		t.Fatalf("replay %+v %v", result, err)
	}
	var status, credentials, postStatus string
	if err = h.db.QueryRow(`SELECT a.status,a.credentials,p.status FROM social_accounts a JOIN social_posts p ON p.account_id=a.id WHERE a.id=$1`, account).Scan(&status, &credentials, &postStatus); err != nil || status != "disconnected" || credentials != "" || postStatus != "cancelled" {
		t.Fatalf("local revocation %s %q %s %v", status, credentials, postStatus, err)
	}
}
