package migrate

import (
	"context"
	"errors"
	"regexp"
	"github.com/DATA-DOG/go-sqlmock"
	"sneepcut/backend-go/migrations"
	"testing"
)

func TestApply(t *testing.T) {
	for _, scenario := range []string{"fresh", "adopt", "current", "unknown", "multiple", "failed"} {
		t.Run(scenario, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			chain := []migrations.Migration{{Revision: "one", SQL: "CREATE TABLE first (id int)"}, {Revision: "two", SQL: "CREATE TABLE second (id int)"}}
			mock.ExpectBegin()
			mock.ExpectExec("SELECT pg_advisory_xact_lock").WillReturnResult(sqlmock.NewResult(0, 1))
			mock.ExpectExec("CREATE TABLE IF NOT EXISTS alembic_version").WillReturnResult(sqlmock.NewResult(0, 0))
			rows := sqlmock.NewRows([]string{"version_num"})
			start := 0
			switch scenario {
			case "adopt":
				rows.AddRow("one")
				start = 1
			case "current":
				rows.AddRow("two")
				start = 2
			case "unknown":
				rows.AddRow("future")
			case "multiple":
				rows.AddRow("one").AddRow("two")
			}
			mock.ExpectQuery("SELECT version_num FROM alembic_version FOR UPDATE").WillReturnRows(rows)
			wantError := scenario == "unknown" || scenario == "multiple" || scenario == "failed"
			if scenario != "unknown" && scenario != "multiple" {
				for i, m := range chain[start:] {
					expected := mock.ExpectExec(regexp.QuoteMeta(m.SQL))
					if scenario == "failed" && i == 1 {
						expected.WillReturnError(errors.New("DDL failed"))
						break
					}
					expected.WillReturnResult(sqlmock.NewResult(0, 0))
					mock.ExpectExec("DELETE FROM alembic_version").WillReturnResult(sqlmock.NewResult(0, 1))
					mock.ExpectExec("INSERT INTO alembic_version").WithArgs(m.Revision).WillReturnResult(sqlmock.NewResult(0, 1))
				}
			}
			if wantError {
				mock.ExpectRollback()
			} else {
				mock.ExpectCommit()
			}
			revision, err := apply(context.Background(), db, chain)
			if (err != nil) != wantError {
				t.Fatalf("revision %q error %v", revision, err)
			}
			if !wantError && revision != "two" {
				t.Fatalf("unexpected revision %q", revision)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}
