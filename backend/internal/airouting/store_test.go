package airouting

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"reflect"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"

	"sneepcut/backend-go/internal/aiprovider"
)

const routingSelect = `SELECT version,routes FROM ai_routing_settings WHERE singleton=true`
const routingUpdate = `UPDATE ai_routing_settings SET version=version+1,routes=$1,updated_at=now(),updated_by=$2 WHERE singleton=true`
const routingAudit = `INSERT INTO admin_audit_events(actor_user_id,target_user_id,action,reason,before_state,after_state) VALUES($1,NULL,'set_ai_routing',$2,$3,$4)`

func storeFixture(t *testing.T) (*SQLStore, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Error(err)
		}
		db.Close()
	})
	return NewStore(db), mock
}

func TestSQLStoreLoad(t *testing.T) {
	store, mock := storeFixture(t)
	mock.ExpectQuery(regexp.QuoteMeta(routingSelect)).WillReturnRows(sqlmock.NewRows([]string{"version", "routes"}).AddRow(3, `{"story_plan":{"provider":"openrouter","model":"example/planner"}}`))
	got, err := store.Load(context.Background())
	if err != nil || got.Version != 3 || got.Routes[aiprovider.Task("story_plan")].Model != "example/planner" {
		t.Fatalf("load returned %+v, %v", got, err)
	}
}

func TestSQLStoreRejectsCorruptConfiguration(t *testing.T) {
	for _, raw := range []string{`null`, `[]`, `{"story_plan":false}`} {
		t.Run(raw, func(t *testing.T) {
			store, mock := storeFixture(t)
			mock.ExpectQuery(regexp.QuoteMeta(routingSelect)).WillReturnRows(sqlmock.NewRows([]string{"version", "routes"}).AddRow(1, raw))
			if _, err := store.Load(context.Background()); err == nil {
				t.Fatal("corrupt configuration accepted")
			}
		})
	}
}

func TestSQLStoreSaveRecordsAuditAtomically(t *testing.T) {
	store, mock := storeFixture(t)
	routes := map[aiprovider.Task]Route{"story_plan": {Provider: "openrouter", Model: "example/planner"}}
	before := Configuration{Version: 2, Routes: map[aiprovider.Task]Route{}}
	after := Configuration{Version: 3, Routes: routes}
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(routingSelect + ` FOR UPDATE`)).WillReturnRows(sqlmock.NewRows([]string{"version", "routes"}).AddRow(2, `{}`))
	mock.ExpectExec(regexp.QuoteMeta(routingUpdate)).WithArgs(jsonArgument{routes}, "actor-id").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta(routingAudit)).WithArgs("actor-id", "Improve story planning", jsonArgument{before}, jsonArgument{after}).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()
	got, err := store.Save(context.Background(), 2, routes, "actor-id", "Improve story planning")
	if err != nil || !reflect.DeepEqual(got, after) {
		t.Fatalf("save returned %+v, %v", got, err)
	}
}

func TestSQLStoreStaleVersionDoesNotWrite(t *testing.T) {
	store, mock := storeFixture(t)
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(routingSelect + ` FOR UPDATE`)).WillReturnRows(sqlmock.NewRows([]string{"version", "routes"}).AddRow(4, `{}`))
	mock.ExpectRollback()
	if _, err := store.Save(context.Background(), 3, nil, "actor-id", "Stale editor"); !errors.Is(err, ErrConflict) {
		t.Fatalf("wanted version conflict, got %v", err)
	}
}

func TestSQLStoreAuditFailureRollsBackConfiguration(t *testing.T) {
	store, mock := storeFixture(t)
	auditError := errors.New("audit write unavailable")
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(routingSelect + ` FOR UPDATE`)).WillReturnRows(sqlmock.NewRows([]string{"version", "routes"}).AddRow(0, `{}`))
	mock.ExpectExec(regexp.QuoteMeta(routingUpdate)).WithArgs(jsonArgument{map[aiprovider.Task]Route{}}, "actor-id").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta(routingAudit)).WillReturnError(auditError)
	mock.ExpectRollback()
	if _, err := store.Save(context.Background(), 0, nil, "actor-id", "Reset stage overrides"); !errors.Is(err, auditError) {
		t.Fatalf("wanted audit failure, got %v", err)
	}
}

type jsonArgument struct{ value any }

func (arg jsonArgument) Match(value driver.Value) bool {
	raw, ok := value.([]byte)
	if !ok {
		return false
	}
	expected, err := json.Marshal(arg.value)
	if err != nil {
		return false
	}
	var got, want any
	return json.Unmarshal(raw, &got) == nil && json.Unmarshal(expected, &want) == nil && reflect.DeepEqual(got, want)
}
