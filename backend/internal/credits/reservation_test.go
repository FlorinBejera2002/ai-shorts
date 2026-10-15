package credits

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"sneepcut/backend-go/internal/testdb"
)

func TestReservationUsesCurrentAccountAndActualCharge(t *testing.T) {
	db := testdb.Open(t)
	for i, tt := range []struct {
		name, role, status   string
		balance, wantCharge  int
		activation, deleting bool
		wantErr              error
	}{
		{name: "member", role: "member", status: "active", balance: 100, wantCharge: 50},
		{name: "insufficient member", role: "member", status: "active", balance: 0, wantErr: ErrInsufficient},
		{name: "zero balance admin", role: "admin", status: "active"},
		{name: "funded admin", role: "admin", status: "active", balance: 100},
		{name: "viewer", role: "viewer", status: "active", balance: 100, wantErr: ErrInactive},
		{name: "suspended admin", role: "admin", status: "suspended", wantErr: ErrInactive},
		{name: "unverified admin", role: "admin", status: "active", activation: true, wantErr: ErrInactive},
		{name: "deleting admin", role: "admin", status: "active", deleting: true, wantErr: ErrInactive},
	} {
		t.Run(tt.name, func(t *testing.T) {
			user := fmt.Sprintf("00000000-0000-4000-8000-%012d", i+1)
			if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan,access_role,account_status,email_activation_required) VALUES($1,$2,'credentials',$3,'free',$4,$5,$6)`, user, user+"@example.invalid", tt.balance, tt.role, tt.status, tt.activation); err != nil {
				t.Fatal(err)
			}
			if tt.deleting {
				if _, err := db.Exec(`INSERT INTO account_deletion_requests(user_id) VALUES($1)`, user); err != nil {
					t.Fatal(err)
				}
			}
			tx, err := db.BeginTx(context.Background(), nil)
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback()
			charged, err := Reserve(context.Background(), tx, user, 50)
			if !errors.Is(err, tt.wantErr) || charged != tt.wantCharge {
				t.Fatalf("charge=%d err=%v, want charge=%d err=%v", charged, err, tt.wantCharge, tt.wantErr)
			}
			if err := tx.Commit(); err != nil {
				t.Fatal(err)
			}
			var balance int
			if err := db.QueryRow(`SELECT credits FROM users WHERE id=$1`, user).Scan(&balance); err != nil || balance != tt.balance-tt.wantCharge {
				t.Fatalf("balance=%d err=%v", balance, err)
			}
		})
	}
}

func TestReservationWaitsForAdministratorDemotion(t *testing.T) {
	db := testdb.Open(t)
	const user = "00000000-0000-4000-8000-000000000001"
	if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan,access_role) VALUES($1,$2,'credentials',0,'free','admin')`, user, user+"@example.invalid"); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	demotion, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer demotion.Rollback()
	if _, err = demotion.ExecContext(ctx, `UPDATE users SET access_role='member' WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			done <- err
			return
		}
		defer tx.Rollback()
		_, err = Reserve(ctx, tx, user, 50)
		done <- err
	}()
	select {
	case err := <-done:
		t.Fatalf("reservation bypassed the account lock: %v", err)
	case <-time.After(100 * time.Millisecond):
	}
	if err = demotion.Commit(); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if !errors.Is(err, ErrInsufficient) {
			t.Fatalf("demoted account retained admin exemption: %v", err)
		}
	case <-ctx.Done():
		t.Fatal("reservation did not complete after demotion")
	}
}

func TestReservationObservesDeletionMarkerCommittedWhileWaiting(t *testing.T) {
	db := testdb.Open(t)
	const user = "00000000-0000-4000-8000-000000000001"
	if _, err := db.Exec(`INSERT INTO users(id,email,provider,credits,plan,access_role) VALUES($1,$2,'credentials',0,'free','admin')`, user, user+"@example.invalid"); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	deletion, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer deletion.Rollback()
	var locked string
	if err = deletion.QueryRowContext(ctx, `SELECT id FROM users WHERE id=$1 FOR UPDATE`, user).Scan(&locked); err != nil {
		t.Fatal(err)
	}
	pid := make(chan int, 1)
	done := make(chan error, 1)
	go func() {
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			done <- err
			return
		}
		defer tx.Rollback()
		var backendPID int
		if err = tx.QueryRowContext(ctx, `SELECT pg_backend_pid()`).Scan(&backendPID); err != nil {
			done <- err
			return
		}
		pid <- backendPID
		_, err = Reserve(ctx, tx, user, 50)
		done <- err
	}()
	var backendPID int
	select {
	case backendPID = <-pid:
	case err := <-done:
		t.Fatalf("reservation could not start: %v", err)
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	// Observe an actual blocked PostgreSQL lock, so the reservation's first
	// statement snapshot necessarily predates the deletion marker's commit.
	for {
		var waiting bool
		if err = db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted)`, backendPID).Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if waiting {
			break
		}
		select {
		case err := <-done:
			t.Fatalf("reservation bypassed the deletion lock: %v", err)
		case <-ctx.Done():
			t.Fatal(ctx.Err())
		case <-time.After(10 * time.Millisecond):
		}
	}
	if _, err = deletion.ExecContext(ctx, `INSERT INTO account_deletion_requests(user_id) VALUES($1)`, user); err != nil {
		t.Fatal(err)
	}
	if err = deletion.Commit(); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if !errors.Is(err, ErrInactive) {
			t.Fatalf("reservation ignored committed deletion marker: %v", err)
		}
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
}
