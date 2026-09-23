package stories

import (
	"context"
	"testing"
	"time"
)

func TestStoryAgentPatchWaitsForConcurrentMembershipRevocation(t *testing.T) {
	r, user, id, _ := fixture(t, 1)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	state, err := r.AgentState(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `UPDATE users SET access_role='viewer' WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { _, err := r.AgentPatch(ctx, user, id, newID(), state, Patch{}); done <- err }()
	select {
	case err := <-done:
		t.Fatalf("membership writer lock was bypassed: %v", err)
	case <-time.After(100 * time.Millisecond):
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("mutation ignored committed role revocation")
		}
	case <-ctx.Done():
		t.Fatal("membership guard deadlocked")
	}
}

func TestAgentStoryMutationsRecheckMembershipInsideTransaction(t *testing.T) {
	for _, mode := range []string{"initial", "revision", "patch"} {
		t.Run(mode, func(t *testing.T) {
			r, user, id, ids := fixture(t, 1)
			ctx := context.Background()
			input := Generate{RequestID: newID(), AssetIDs: ids}
			if mode == "revision" {
				// Domain guard fixture: an already charged historical version, no native job.
				if _, err := r.db.Exec(`INSERT INTO jobs(id,user_id,source_type,status,progress,num_clips_requested,aspect_ratio,language,subtitle_style,include_brand,credits_charged) VALUES($1,$2,'story','completed',100,1,'9:16','auto','clean',false,10)`, id, user); err != nil {
					t.Fatal(err)
				}
				if _, err := r.db.Exec(`INSERT INTO story_versions(project_id,number,version) VALUES($1,1,$2)`, id, encoded(version(id, 1))); err != nil {
					t.Fatal(err)
				}
				if _, err := r.db.Exec(`UPDATE story_projects SET status='ready',current_version=1 WHERE id=$1`, id); err != nil {
					t.Fatal(err)
				}
				input.Version = 1
				input.Action = "improve_flow"
			}
			state, err := r.AgentState(ctx, user, id)
			if err != nil {
				t.Fatal(err)
			}
			input.ExpectedState = state
			if _, err = r.db.Exec(`UPDATE users SET access_role='viewer' WHERE id=$1`, user); err != nil {
				t.Fatal(err)
			}
			if mode == "patch" {
				_, err = r.AgentPatch(ctx, user, id, newID(), state, Patch{})
			} else {
				err = r.Queue(ctx, user, id, input)
			}
			if err == nil {
				t.Fatal("revoked member changed story state")
			}
			var status string
			if err = r.db.QueryRow(`SELECT status FROM story_projects WHERE id=$1`, id).Scan(&status); err != nil {
				t.Fatal(err)
			}
			want := "draft"
			if mode == "revision" {
				want = "ready"
			}
			if status != want || credits(t, r, user) != 100 {
				t.Fatalf("rejected mutation changed state: %s", status)
			}
		})
	}
}
