package processing

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/julienschmidt/httprouter"
	"golang.org/x/crypto/bcrypt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http/httptest"
	"os"
	"sneepcut/backend-go/internal/brand"
	"sneepcut/backend-go/internal/captions"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/story"
	"sneepcut/backend-go/internal/testdb"
	"strings"
	"testing"
	"time"
)

type fontNonceFixture struct{}

func (fontNonceFixture) Consume(context.Context, string, string, time.Duration) (bool, error) {
	return true, nil
}
func (fontNonceFixture) Allow(context.Context, string, int, time.Duration) (bool, error) {
	return true, nil
}
func TestCustomFontHTTPUploadSaveReloadArchiveAndRealStoryExport(t *testing.T) {
	db := testdb.Open(t)
	p, storage, dir := storyTestProcessor(t)
	ctx := context.Background()
	owner, other := "10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002"
	hash, err := bcrypt.GenerateFromPassword([]byte("synthetic-font-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{owner, other} {
		if _, err = db.Exec(`INSERT INTO users(id,email,provider,password_hash,credits,plan) VALUES($1,$2,'credentials',$3,100,'free')`, id, id+"@example.invalid", string(hash)); err != nil {
			t.Fatal(err)
		}
	}
	tokens, err := identity.NewTokens(identity.TokenConfig{Secret: strings.Repeat("f", 40), Issuer: "test", Audience: "test", AccessLifetime: time.Minute, RefreshLifetime: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	authService := identity.NewService(identity.NewPostgres(db), tokens)
	ownerSession, _, _, err := authService.Login(ctx, owner+"@example.invalid", "synthetic-font-password")
	if err != nil {
		t.Fatal(err)
	}
	otherSession, _, _, err := authService.Login(ctx, other+"@example.invalid", "synthetic-font-password")
	if err != nil {
		t.Fatal(err)
	}
	auth := identity.NewHandler(authService, identity.HTTPConfig{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	service := media.NewService(media.Config{StagingDirectory: dir, AppURL: "https://example.invalid", SigningSecret: strings.Repeat("s", 40)}, db, storage, fontNonceFixture{}, nil)
	router := httprouter.New()
	media.NewHandler(service, auth).Register(router)
	brand.New(db, auth, service).Register(router)
	call := func(method, path, token, contentType string, body []byte) *httptest.ResponseRecorder {
		request := httptest.NewRequest(method, path, bytes.NewReader(body))
		request.Header.Set("Content-Type", contentType)
		request.Header.Set("Authorization", "Bearer "+token)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		return response
	}
	data, _ := captions.FontBytes("builtin:open-sans", 700)
	upload := func(payload []byte, permission string) *httptest.ResponseRecorder {
		var buf bytes.Buffer
		form := multipart.NewWriter(&buf)
		part, _ := form.CreateFormFile("file", "My Multiword Font.ttf")
		_, _ = part.Write(payload)
		_ = form.Close()
		return call("POST", "/api/user/brand/fonts"+permission, ownerSession.AccessToken, form.FormDataContentType(), buf.Bytes())
	}
	if r := upload(data, ""); r.Code != 400 {
		t.Fatalf("permission missing accepted %d", r.Code)
	}
	if r := upload([]byte("not actually a font"), "?license_confirmed=true"); r.Code != 400 {
		t.Fatalf("fake font accepted %d", r.Code)
	}
	response := upload(data, "?license_confirmed=true")
	if response.Code != 201 {
		t.Fatalf("upload %d %s", response.Code, response.Body.String())
	}
	var uploaded struct {
		Font captions.Font `json:"font"`
	}
	if err = json.Unmarshal(response.Body.Bytes(), &uploaded); err != nil {
		t.Fatal(err)
	}
	if uploaded.Font.Family != "Open Sans" {
		t.Fatalf("family metadata lost %q", uploaded.Font.Family)
	}
	fontID := uploaded.Font.ID
	style := captions.Default()
	style.FontID = fontID
	style.Preset = "active-color"
	style.Position = captions.Position{X: .32, Y: .27, Anchor: "center"}
	raw, _ := json.Marshal(map[string]any{"captionStyle": style})
	response = call("PUT", "/api/user/brand", ownerSession.AccessToken, "application/json", raw)
	if response.Code != 200 {
		t.Fatalf("save %d %s", response.Code, response.Body.String())
	}
	response = call("GET", "/api/user/brand", ownerSession.AccessToken, "", nil)
	var saved struct {
		Kit struct {
			Style captions.Style `json:"captionStyle"`
		} `json:"brandKit"`
	}
	if err = json.Unmarshal(response.Body.Bytes(), &saved); err != nil || saved.Kit.Style != style {
		t.Fatalf("reload %#v %v", saved, err)
	}
	response = call("GET", "/api/user/brand/font-file?id="+fontID+"&weight=700", otherSession.AccessToken, "", nil)
	if response.Code != 404 {
		t.Fatalf("foreign font leaked %d", response.Code)
	}
	response = call("DELETE", "/api/user/brand/fonts?id="+fontID, ownerSession.AccessToken, "", nil)
	if response.Code != 200 {
		t.Fatal("archive failed")
	}
	response = call("GET", "/api/user/brand/font-file?id="+fontID+"&weight=700", ownerSession.AccessToken, "", nil)
	if response.Code != 200 || !bytes.Equal(response.Body.Bytes(), data) || response.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatalf("archived saved font unavailable %d", response.Code)
	}
	source := storySource(t, p, dir, "caption-http-source", "black", 440)
	request := story.Request{ID: "caption-http-story", UserID: owner, Options: story.Options{AspectRatio: "16:9", Captions: true, CaptionStyle: &saved.Kit.Style}, Assets: []story.Asset{source}}
	version := story.Version{Number: 1, Timeline: []story.Entry{{OutputIn: 0, OutputOut: 1.3, Video: story.Interval{SourceID: source.ID, In: 0, Out: 1.3}, Audio: &story.Interval{SourceID: source.ID, In: 0, Out: 1.3}, Words: []story.Word{{Text: "ă â î ș ț", Start: .1, End: .55}, {Text: "Ă Â Î Ș Ț", Start: .65, End: 1.15}}}}}
	output, err := p.RenderStory(ctx, request, version)
	if err != nil || !output.Captions || output.Size == 0 {
		t.Fatalf("saved custom font export failed %#v %v", output, err)
	}
	// The ordinary clip pipeline shares the exact font asset, including its second
	// TikTok export variant; repeated materialization must remain safe.
	ordinary, err := p.Render(ctx, RenderInput{SourceKey: source.Key, Namespace: "caption-http-ordinary", AspectRatio: "16:9", SubtitleStyle: "clean", BurnSubtitles: true, Segments: []Segment{{0, 1.3}}, Transcript: Transcript{Words: []Word{{Text: "ă â î ș ț Ă Â Î Ș Ț", Start: .1, End: 1.15}}}, Brand: map[string]any{"apply_brand": true, "user_id": owner, "caption_style": saved.Kit.Style}})
	if err != nil || !ordinary.HasSubtitles || ordinary.TikTokStorageKey == "" {
		t.Fatalf("ordinary custom font export failed %#v %v", ordinary, err)
	}
	fallback, err := p.Render(ctx, RenderInput{SourceKey: source.Key, Namespace: "caption-http-fallback", AspectRatio: "16:9", SubtitleStyle: "clean", BurnSubtitles: true, Segments: []Segment{{0, 1.3}}, Transcript: Transcript{Text: "Fără aliniere pe cuvinte", Segments: []TranscriptSegment{{Start: .1, End: 1.15, Text: "Fără aliniere pe cuvinte"}}}, Brand: map[string]any{"apply_brand": true, "user_id": owner, "caption_style": saved.Kit.Style}})
	if err != nil || !fallback.HasSubtitles || fallback.Metadata["caption_timing"] != "phrase_fallback" {
		t.Fatalf("genuine phrase fallback export failed %#v %v", fallback, err)
	}

	otf, err := os.ReadFile("../captions/testdata/SourceSans3-Regular.otf")
	if err != nil {
		t.Fatal(err)
	}
	response = upload(otf, "?license_confirmed=true")
	if response.Code != 201 {
		t.Fatalf("actual OTF upload %d %s", response.Code, response.Body.String())
	}
	if err = json.Unmarshal(response.Body.Bytes(), &uploaded); err != nil {
		t.Fatal(err)
	}
	if uploaded.Font.Family != "Source Sans 3" || uploaded.Font.Weights[0] != 400 {
		t.Fatalf("OTF metadata %#v", uploaded.Font)
	}
	otfStyle := captions.Default()
	otfStyle.FontID = uploaded.Font.ID
	otfStyle.Weight = 400
	otfClip, err := p.Render(ctx, RenderInput{SourceKey: source.Key, Namespace: "caption-http-otf", AspectRatio: "16:9", SubtitleStyle: "clean", BurnSubtitles: true, Segments: []Segment{{0, 1.3}}, Transcript: Transcript{Words: []Word{{Text: "ă â î ș ț Ă Â Î Ș Ț", Start: .1, End: 1.15}}}, Brand: map[string]any{"apply_brand": true, "user_id": owner, "caption_style": otfStyle}})
	if err != nil || !otfClip.HasSubtitles {
		t.Fatalf("actual OTF export failed %#v %v", otfClip, err)
	}

}
