package stories

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"sneepcut/backend-go/internal/story"
)

func TestStoryReadResolvesOnlyPublishedClipForStudio(t *testing.T) {
	for name, clipID := range map[string]string{"published": newID(), "deleted": ""} {
		t.Run(name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			user, projectID := newID(), newID()
			mock.ExpectQuery("SELECT id,options,status").WithArgs(projectID, user).WillReturnRows(
				sqlmock.NewRows([]string{"id", "options", "status", "message", "current_version", "ai_calls", "stage_metrics", "outcome"}).AddRow(projectID, encoded(story.DefaultOptions()), "completed", "", 2, 0, []byte("{}"), ""),
			)
			mock.ExpectQuery("SELECT asset FROM story_assets").WithArgs(projectID).WillReturnRows(sqlmock.NewRows([]string{"asset"}))
			// Historical serialized identities must not survive a newer publication or
			// clip deletion. The live ownership-scoped clip relation is authoritative.
			mock.ExpectQuery("SELECT v.version,coalesce").WithArgs(projectID, user).WillReturnRows(
				sqlmock.NewRows([]string{"version", "clip_id"}).
					AddRow(encoded(story.Version{Number: 1, Accepted: true, ClipID: "stale-clip"}), "").
					AddRow(encoded(story.Version{Number: 2, Accepted: true, ClipID: "stale-current-clip"}), clipID).
					AddRow(encoded(story.Version{Number: 3, Accepted: false}), ""),
			)
			mock.ExpectQuery("SELECT attempt FROM story_attempts").WithArgs(projectID).WillReturnRows(sqlmock.NewRows([]string{"attempt"}))
			project, err := NewRepository(db, story.DefaultLimits()).Get(context.Background(), user, projectID)
			if err != nil {
				t.Fatal(err)
			}
			var response struct {
				Versions []struct {
					ClipID string `json:"clip_id"`
				} `json:"versions"`
			}
			if err = json.Unmarshal([]byte(encoded(project)), &response); err != nil {
				t.Fatal(err)
			}
			if len(response.Versions) != 3 || response.Versions[0].ClipID != "" || response.Versions[1].ClipID != clipID || response.Versions[2].ClipID != "" {
				t.Fatalf("wrong Studio entry points: %+v", response)
			}
			if err = mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}
