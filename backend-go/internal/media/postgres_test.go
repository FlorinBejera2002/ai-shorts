package media

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
	"golang.org/x/crypto/bcrypt"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/testdb"
)

func TestPostgresAuthenticatedUploadsBrandAndCleanup(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	hash, e := bcrypt.GenerateFromPassword([]byte("media-test-password"), bcrypt.MinCost)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec(`INSERT INTO users(id,email,provider,password_hash,credits,plan) VALUES($1,'media-test@example.invalid','credentials',$2,100,'free')`, testUserID, string(hash)); e != nil {
		t.Fatal(e)
	}
	tokens, e := identity.NewTokens(identity.TokenConfig{Secret: strings.Repeat("a", 32), Issuer: "test", Audience: "test", AccessLifetime: time.Minute, RefreshLifetime: time.Hour})
	if e != nil {
		t.Fatal(e)
	}
	authService := identity.NewService(identity.NewPostgres(db), tokens)
	session, _, _, e := authService.Login(ctx, "media-test@example.invalid", "media-test-password")
	if e != nil {
		t.Fatal(e)
	}
	auth := identity.NewHandler(authService, identity.HTTPConfig{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	root := t.TempDir()
	storage, e := NewLocalStorage(root)
	if e != nil {
		t.Fatal(e)
	}
	defer storage.Close()
	s := NewService(Config{LocalRoot: root, AppURL: "https://app.example.invalid", SigningSecret: strings.Repeat("s", 32), UploadSecret: strings.Repeat("u", 32), StagingDirectory: t.TempDir(), MaxUploadBytes: 1024 * 1024}, db, storage, &mockNonce{}, scannerFunc(func(context.Context, string) error { return nil }))
	router := httprouter.New()
	NewHandler(s, auth).Register(router)
	call := func(method, path, contentType, token string, body []byte) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, bytes.NewReader(body))
		r.Header.Set("Content-Type", contentType)
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	w := call("POST", "/api/upload/authorize", "application/json", session.AccessToken, []byte(`{"fileName":"video.mp4","fileSize":16,"contentType":"video/mp4"}`))
	if w.Code != 200 {
		t.Fatalf("authorize %d %s", w.Code, w.Body.String())
	}
	var authz map[string]string
	if e = json.Unmarshal(w.Body.Bytes(), &authz); e != nil {
		t.Fatal(e)
	}
	w = call("PUT", authz["uploadUrl"], "video/mp4", authz["token"], videoBytes)
	if w.Code != 201 {
		t.Fatalf("upload %d %s", w.Code, w.Body.String())
	}
	var uploaded UploadResult
	_ = json.Unmarshal(w.Body.Bytes(), &uploaded)
	key, e := s.ValidateUploadSource(ctx, testUserID, uploaded.FilePath)
	if e != nil {
		t.Fatal(e)
	}
	if got, e := os.ReadFile(uploaded.FilePath); e != nil || !bytes.Equal(got, videoBytes) {
		t.Fatal("local video did not persist")
	}
	var raster bytes.Buffer
	im := image.NewRGBA(image.Rect(0, 0, 2, 2))
	im.Set(0, 0, color.RGBA{R: 255, A: 255})
	if e = png.Encode(&raster, im); e != nil {
		t.Fatal(e)
	}
	var multipartBody bytes.Buffer
	form := multipart.NewWriter(&multipartBody)
	part, e := form.CreatePart(textproto.MIMEHeader{"Content-Disposition": {`form-data; name="file"; filename="logo.png"`}, "Content-Type": {"image/png"}})
	if e != nil {
		t.Fatal(e)
	}
	_, _ = part.Write(raster.Bytes())
	_ = form.Close()
	w = call(http.MethodPost, "/api/user/brand/logo", form.FormDataContentType(), session.AccessToken, multipartBody.Bytes())
	if w.Code != 200 {
		t.Fatalf("logo %d %s", w.Code, w.Body.String())
	}
	brand, e := s.GetBrand(ctx, testUserID)
	if e != nil {
		t.Fatal(e)
	}
	logoPath, ok := brand["logoPath"].(string)
	if !ok || !strings.HasPrefix(logoPath, "brand/"+testUserID+"/") || brand["logoUrl"] == nil || brand["fontFamily"] != "Inter" || brand["hidePlatformBadge"] != false {
		t.Fatalf("invalid brand contract: %+v", brand)
	}
	w = call("GET", "/api/brand/logo?logo_path="+logoPath, "", session.AccessToken, nil)
	if w.Code != 200 {
		t.Fatalf("logo read %d", w.Code)
	}
	if _, e = db.Exec(`UPDATE users SET access_role='viewer' WHERE id=$1`, testUserID); e != nil {
		t.Fatal(e)
	}
	w = call("DELETE", "/api/user/brand/logo", "", session.AccessToken, nil)
	if w.Code != 403 {
		t.Fatalf("viewer mutation %d", w.Code)
	}
	w = call("GET", "/api/user/brand/logo", "", session.AccessToken, nil)
	if w.Code != 200 {
		t.Fatalf("viewer read %d", w.Code)
	}
	_, _ = db.Exec(`UPDATE users SET access_role='member' WHERE id=$1`, testUserID)
	// Legacy SVG cannot be read but remains removable by its owner.
	legacy := "brand/" + testUserID + "/legacy.svg"
	svg := filepath.Join(t.TempDir(), "legacy.svg")
	_ = os.WriteFile(svg, []byte("<svg/>"), 0600)
	if e = storage.Save(ctx, svg, legacy, "image/svg+xml"); e != nil {
		t.Fatal(e)
	}
	if e = s.setBrandLogo(ctx, testUserID, &legacy); e != nil {
		t.Fatal(e)
	}
	w = call("GET", "/api/brand/logo?logo_path="+legacy, "", session.AccessToken, nil)
	if w.Code != 403 {
		t.Fatal("legacy SVG was served")
	}
	w = call("DELETE", "/api/user/brand/logo", "", session.AccessToken, nil)
	if w.Code != 200 {
		t.Fatalf("legacy delete %d %s", w.Code, w.Body.String())
	}
	if exists, _ := storage.Exists(ctx, legacy); exists {
		t.Fatal("legacy SVG survived delete")
	}
	if result, e := s.CleanupAccount(ctx, testUserID); e == nil || result.Complete {
		t.Fatal("cleanup without marker succeeded")
	}
	if _, e = db.Exec(`INSERT INTO account_deletion_requests(user_id,billing_cancellation_completed) VALUES($1,true)`, testUserID); e != nil {
		t.Fatal(e)
	}
	if e = s.setBrandLogo(ctx, testUserID, &logoPath); e == nil {
		t.Fatal("brand updated during deletion")
	}
	result, e := s.CleanupAccount(ctx, testUserID)
	if e != nil || !result.Complete {
		t.Fatalf("cleanup: %+v %v", result, e)
	}
	if exists, e := storage.Exists(ctx, key); e != nil || exists {
		t.Fatal("uploaded media survived cleanup")
	}
	if exists, e := storage.Exists(ctx, logoPath); e != nil || exists {
		t.Fatal("unlinked logo survived cleanup")
	}
	var users int
	if e = db.QueryRow(`SELECT count(*) FROM users WHERE id=$1`, testUserID).Scan(&users); e != nil || users != 1 {
		t.Fatal("media cleanup deleted account rows")
	}
}
