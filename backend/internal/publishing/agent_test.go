package publishing

import (
	"context"
	"encoding/json"
	"sneepcut/backend-go/internal/data"
	"testing"
)

func seedApprovedPost(t *testing.T, h *Handler, user, clip, account string) string {
	t.Helper()
	id, _ := data.NewUUID()
	if _, err := h.db.Exec(`INSERT INTO scheduled_posts(id,user_id,clip_id,clip_owner_id,title,caption,platforms,account_ids,status,scheduled_at,created_at,updated_at) VALUES($1,$2,$3,$2,'Approved synthetic post','Approved caption',ARRAY['instagram'],ARRAY[$4::uuid],'scheduled',now()-interval '1 minute',now(),now())`, id, user, clip, account); err != nil {
		t.Fatal(err)
	}
	tx, err := h.db.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	binding, err := AgentPostBinding(context.Background(), tx, user, id, true)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(map[string]string{"digest": binding, "request_id": id})
	if _, err = tx.Exec(`UPDATE scheduled_posts SET agent_binding=$2 WHERE id=$1`, id, string(raw)); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	return id
}
func TestAgentScheduledDispatchRejectsChangedApprovalBeforeQueueing(t *testing.T) {
	for _, change := range []string{"caption", "media", "account", "role"} {
		t.Run(change, func(t *testing.T) {
			h, user, clip, account := fixture(t)
			id := seedApprovedPost(t, h, user, clip, account)
			var query string
			target := id
			switch change {
			case "caption":
				query = `UPDATE scheduled_posts SET caption='Not approved' WHERE id=$1`
			case "media":
				query = `UPDATE clips SET file_storage_key='clips/changed.mp4' WHERE id=$1`
				target = clip
			case "account":
				query = `UPDATE social_accounts SET remote_id='not-approved' WHERE id=$1`
				target = account
			case "role":
				query = `UPDATE users SET access_role='viewer' WHERE id=$1`
				target = user
			}
			if _, err := h.db.Exec(query, target); err != nil {
				t.Fatal(err)
			}
			if err := h.dispatchCalendar(context.Background()); err != nil {
				t.Fatal(err)
			}
			var status string
			var count int
			if err := h.db.QueryRow(`SELECT status,(SELECT count(*) FROM social_posts WHERE scheduled_post_id=$1) FROM scheduled_posts WHERE id=$1`, id).Scan(&status, &count); err != nil {
				t.Fatal(err)
			}
			if status != "failed" || count != 0 {
				t.Fatalf("changed approval queued: status=%s jobs=%d", status, count)
			}
		})
	}
}
func TestAgentDestinationBindingRecheckedBeforeProviderRequest(t *testing.T) {
	h, user, clip, account := fixture(t)
	id := seedApprovedPost(t, h, user, clip, account)
	if err := h.dispatchCalendar(context.Background()); err != nil {
		t.Fatal(err)
	}
	var binding string
	if err := h.db.QueryRow(`SELECT agent_account_binding FROM social_posts WHERE scheduled_post_id=$1`, id).Scan(&binding); err != nil {
		t.Fatal(err)
	}
	if len(binding) != 64 {
		t.Fatal("missing frozen destination identity")
	}
	if _, err := h.db.Exec(`UPDATE social_accounts SET remote_id='different-destination' WHERE id=$1`, account); err != nil {
		t.Fatal(err)
	}
	// If binding fails, process exits before credentials or any provider HTTP call.
	if err := h.runOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	var status string
	if err := h.db.QueryRow(`SELECT status FROM social_posts WHERE scheduled_post_id=$1`, id).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "cancelled" {
		t.Fatalf("unapproved destination dispatched: %s", status)
	}
}
