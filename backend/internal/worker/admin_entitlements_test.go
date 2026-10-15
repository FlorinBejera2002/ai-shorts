package worker

import (
	"context"
	"testing"

	"sneepcut/backend-go/internal/jobs"
	"sneepcut/backend-go/internal/testdb"
)

func TestPostgresBrandBadgeEntitlementAndAdminFailureRefund(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	for _, tc := range []struct {
		role, plan       string
		preference, hide bool
	}{
		{"admin", "free", true, true},
		{"admin", "free", false, false},
		{"member", "free", true, false},
		{"member", "agency", true, true},
	} {
		t.Run(tc.role+"/"+tc.plan+"/"+map[bool]string{true: "hide", false: "show"}[tc.preference], func(t *testing.T) {
			user := token()
			balance := 100
			if tc.role == "admin" {
				balance = 0
			}
			if _, err := db.Exec(`INSERT INTO users(id,email,provider,access_role,credits,plan) VALUES($1,$2,'credentials',$3,$4,$5)`, user, user+"@example.invalid", tc.role, balance, tc.plan); err != nil {
				t.Fatal(err)
			}
			source := "https://youtube.com/watch?v=fixture"
			options := jobs.DefaultOptions()
			options.IncludeBrand = true
			created, err := jobs.NewRepository(db).Create(ctx, user, []jobs.Prepared{{Input: jobs.CreateInput{Options: options, SourceType: "youtube", SourceURL: &source}, WorkerSource: source}})
			if err != nil || len(created) != 1 {
				t.Fatalf("create: %v", err)
			}
			if _, err := db.Exec(`UPDATE jobs SET brand_snapshot=jsonb_build_object('hide_platform_badge',$2::boolean) WHERE user_id=$1`, user, tc.preference); err != nil {
				t.Fatal(err)
			}
			repo := NewRepository(db)
			job, err := repo.Claim(ctx)
			if err != nil || job == nil {
				t.Fatalf("claim: %v %v", job, err)
			}
			if job.Brand["hide_platform_badge"] != tc.hide {
				t.Fatalf("hide badge: %v, want %v", job.Brand["hide_platform_badge"], tc.hide)
			}
			if err := repo.Fail(ctx, job, "synthetic failure"); err != nil {
				t.Fatal(err)
			}
			var after int
			if err := db.QueryRow(`SELECT credits FROM users WHERE id=$1`, user).Scan(&after); err != nil || after != balance {
				t.Fatalf("refund changed original balance: %d want %d (%v)", after, balance, err)
			}
		})
	}
}
