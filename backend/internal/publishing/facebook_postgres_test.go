package publishing

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/lib/pq"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/media"
)

type facebookPreparedMedia struct{ fakeMedia }

func (facebookPreparedMedia) PrepareFacebookImage(_ context.Context, reference string, _ *media.InstagramCrop) (string, error) {
	return reference + "-crop.jpg", nil
}
func (facebookPreparedMedia) SignedURL(_ context.Context, reference string) (string, error) {
	return "https://media.example.invalid/" + reference, nil
}

func TestPostgresFacebookWorkerPreservesPhotoSettingsAndUsesPreparedImage(t *testing.T) {
	h, user, _, _ := fixture(t)
	h.media = facebookPreparedMedia{}
	calls := 0
	h.client = mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		if strings.HasSuffix(r.URL.Path, "/photos") {
			_ = r.ParseForm()
			if r.Form.Get("alt_text_custom") != "A red bicycle" || !strings.HasSuffix(r.Form.Get("url"), "original.png-crop.jpg") {
				t.Errorf("worker lost photo settings: %v", r.Form)
			}
			fmt.Fprint(w, `{"id":"photo1"}`)
			return
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["place"] != "987654" {
			t.Errorf("worker lost Facebook place: %+v", body)
		}
		fmt.Fprint(w, `{"id":"page_post"}`)
	})
	h.client.config.MetaAppID, h.client.config.MetaAppSecret = "test", "test"
	account, _ := data.NewUUID()
	postID, _ := data.NewUUID()
	encrypted, err := seal(h.vault, Credentials{AccessToken: "synthetic"}, user+":facebook:12345")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := h.db.Exec(`INSERT INTO social_accounts(id,user_id,provider,remote_id,name,credentials) VALUES($1,$2,'facebook','12345','Synthetic Page',$3)`, account, user, encrypted); err != nil {
		t.Fatal(err)
	}
	attachments := []MediaAttachment{{Type: "image", Reference: "publishing/" + user + "/original.png", AltText: "A red bicycle", Crop: &media.InstagramCrop{AspectRatio: "4:5", X: .5, Y: .5, Zoom: 1}, UserTags: []InstagramUserTag{{Username: "alice", X: .5, Y: .5}}}}
	raw, _ := json.Marshal(attachments)
	if _, err := h.db.Exec(`INSERT INTO scheduled_posts(id,user_id,title,platforms,account_ids,status,scheduled_at,updated_at,media,facebook_options) VALUES($1,$2,'Fixture',ARRAY['facebook'],$3,'scheduled',now()-interval '1 minute',now(),$4,'{"placeId":"987654"}')`, postID, user, pq.Array([]string{account}), raw); err != nil {
		t.Fatal(err)
	}
	if err := h.dispatchCalendar(context.Background()); err != nil {
		t.Fatal(err)
	}
	var options FacebookOptions
	var optionsJSON, referenceJSON []byte
	if err := h.db.QueryRow(`SELECT options,media_reference FROM social_posts WHERE scheduled_post_id=$1`, postID).Scan(&optionsJSON, &referenceJSON); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(optionsJSON, &options); err != nil || options.PlaceID != "987654" {
		t.Fatalf("queued options lost: %s %v", optionsJSON, err)
	}
	var queued []MediaAttachment
	if err := json.Unmarshal(referenceJSON, &queued); err != nil || len(queued) != 1 || queued[0].Crop == nil || queued[0].AltText != "A red bicycle" || len(queued[0].UserTags) != 0 || queued[0].Reference != attachments[0].Reference {
		t.Fatalf("queued metadata lost or leaked: %s %v", referenceJSON, err)
	}
	if err := h.runOne(context.Background()); err != nil {
		t.Fatal(err)
	}
	var status, message string
	if err := h.db.QueryRow(`SELECT status,error FROM social_posts WHERE scheduled_post_id=$1`, postID).Scan(&status, &message); err != nil || status != "published" || calls != 2 {
		t.Fatalf("publication status=%s error=%s calls=%d err=%v", status, message, calls, err)
	}
}
