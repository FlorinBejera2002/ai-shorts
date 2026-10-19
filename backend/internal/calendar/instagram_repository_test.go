package calendar

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/publishing"
)

type instagramScheduleMedia struct{ prepared int }

func (m *instagramScheduleMedia) KeyFromReference(value string) (string, error) { return value, nil }
func (m *instagramScheduleMedia) SignedURL(context.Context, string) (string, error) {
	return "https://media.example/image.jpg", nil
}
func (m *instagramScheduleMedia) PrepareInstagramImage(_ context.Context, reference string, crop *media.InstagramCrop) (string, error) {
	if crop == nil {
		return "", errors.New("the original exceeds 8 MB")
	}
	m.prepared++
	return reference + "-crop.jpg", nil
}
func (m *instagramScheduleMedia) PrepareFacebookImage(ctx context.Context, reference string, crop *media.InstagramCrop) (string, error) {
	return m.PrepareInstagramImage(ctx, reference, crop)
}
func (m *instagramScheduleMedia) ValidatePublishingMedia(context.Context, string, string, string) error {
	return errors.New("the original exceeds 8 MB")
}

type matchingJSON struct{ value any }

func (m matchingJSON) Match(value driver.Value) bool {
	raw, ok := value.([]byte)
	if !ok {
		return false
	}
	expected, _ := json.Marshal(m.value)
	var left, right any
	return json.Unmarshal(raw, &left) == nil && json.Unmarshal(expected, &right) == nil && reflect.DeepEqual(left, right)
}

func TestSchedulePersistsCropAndAltTextAndValidatesOnlyPreparedJPEG(t *testing.T) {
	for _, provider := range []string{"instagram", "facebook"} {
		t.Run(provider, func(t *testing.T) { testSchedulePhotoSettingsRoundTrip(t, provider) })
	}
}

func testSchedulePhotoSettingsRoundTrip(t *testing.T, provider string) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	user := "123e4567-e89b-42d3-a456-426614174000"
	account := "123e4567-e89b-42d3-a456-426614174001"
	now := time.Date(2026, 10, 19, 10, 0, 0, 0, time.UTC)
	attachments := []publishing.MediaAttachment{{Type: "image", Reference: "publishing/" + user + "/original.png", Name: "photo", AltText: "Red bicycle", Crop: &media.InstagramCrop{AspectRatio: "4:5", X: .25, Y: .75, Zoom: 2}, UserTags: []publishing.InstagramUserTag{{Username: "alice", X: .4, Y: .6}}}}
	options := publishing.InstagramOptions{LocationID: "123456", Collaborators: []string{"bob"}}
	mediaJSON, _ := json.Marshal(attachments)
	optionsJSON := encodeInstagramOptions(options)
	facebookOptions := publishing.FacebookOptions{PlaceID: "987654"}
	facebookJSON := encodeFacebookOptions(facebookOptions)
	var rawMedia, rawOptions, rawFacebook any
	_ = json.Unmarshal(mediaJSON, &rawMedia)
	_ = json.Unmarshal(optionsJSON, &rawOptions)
	_ = json.Unmarshal(facebookJSON, &rawFacebook)
	input := map[string]any{"title": "Photo", "platforms": []any{provider}, "accountIds": []any{account}, "status": "scheduled", "scheduledAt": now.Format(time.RFC3339), "media": rawMedia, "instagram": rawOptions, "facebook": rawFacebook}
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT access_role,email_activation_required").WithArgs(user).WillReturnRows(sqlmock.NewRows([]string{"role", "activation"}).AddRow("member", false))
	mock.ExpectQuery("SELECT EXISTS.*account_deletion_requests").WithArgs(user).WillReturnRows(sqlmock.NewRows([]string{"deleting"}).AddRow(false))
	mock.ExpectQuery("SELECT id,provider FROM social_accounts").WithArgs(user, sqlmock.AnyArg()).WillReturnRows(sqlmock.NewRows([]string{"id", "provider"}).AddRow(account, provider))
	mock.ExpectExec("INSERT INTO scheduled_posts").WithArgs(sqlmock.AnyArg(), user, nil, nil, "Photo", nil, nil, sqlmock.AnyArg(), sqlmock.AnyArg(), "scheduled", now, matchingJSON{attachments}, matchingJSON{map[string]any{}}, matchingJSON{options}, matchingJSON{publishing.YouTubeOptions{}}, matchingJSON{facebookOptions}).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE scheduled_posts SET agent_binding").WillReturnResult(sqlmock.NewResult(0, 1))
	columns := []string{"id", "title", "caption", "notes", "platforms", "accounts", "status", "error", "scheduled", "created", "updated", "media", "tiktok", "instagram", "youtube", "facebook", "clip_id", "clip_title", "score", "duration", "eligible", "thumb_key", "thumb_path", "thumb_url", "destinations"}
	mock.ExpectQuery("SELECT p.id,p.title").WillReturnRows(sqlmock.NewRows(columns).AddRow("post", "Photo", nil, nil, "{"+provider+"}", "{"+account+"}", "scheduled", "", now, now, now, mediaJSON, `{}`, optionsJSON, `{}`, facebookJSON, nil, nil, nil, nil, false, nil, nil, nil, `[]`))
	mock.ExpectCommit()
	storage := &instagramScheduleMedia{}
	repository := NewRepository(db, storage)
	post, err := repository.Mutate(context.Background(), user, "", input, true)
	if err != nil {
		t.Fatal(err)
	}
	if storage.prepared != 1 || !reflect.DeepEqual(post.Media, attachments) || post.Instagram.LocationID != "123456" || len(post.Instagram.Collaborators) != 1 || post.Facebook.PlaceID != "987654" {
		t.Fatalf("metadata failed roundtrip: %+v / %+v", post, storage)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestInstagramExplicitFalseFeedChoiceSurvivesEncoding(t *testing.T) {
	flag := false
	raw := encodeInstagramOptions(publishing.InstagramOptions{ShareToFeed: &flag})
	var loaded publishing.InstagramOptions
	if err := json.Unmarshal(raw, &loaded); err != nil || loaded.ShareToFeed == nil || *loaded.ShareToFeed {
		t.Fatalf("explicit false disappeared: %s %v", raw, err)
	}
}
