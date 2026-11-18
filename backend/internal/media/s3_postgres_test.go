package media

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/png"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
	"golang.org/x/crypto/bcrypt"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/testdb"
)

func TestPostgresS3MediaLifecycle(t *testing.T) {
	storage := localS3ForTest(t)
	db := testdb.Open(t)
	ctx := context.Background()
	userID, err := data.NewUUID()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		for _, category := range []string{"uploads", "publishing", "brand"} {
			if _, err := storage.DeletePrefix(cleanup, category+"/"+userID); err != nil {
				t.Errorf("clean synthetic owner media: %v", err)
			}
		}
	})
	password, _ := bcrypt.GenerateFromPassword([]byte("synthetic-media-password"), bcrypt.MinCost)
	if _, err := db.Exec(`INSERT INTO users(id,email,provider,password_hash,credits,plan) VALUES($1,'s3-media@example.invalid','credentials',$2,100,'free')`, userID, string(password)); err != nil {
		t.Fatal(err)
	}
	tokens, err := identity.NewTokens(identity.TokenConfig{Secret: strings.Repeat("t", 32), Issuer: "media-test", Audience: "media-test", AccessLifetime: 5 * time.Minute, RefreshLifetime: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	authService := identity.NewService(identity.NewPostgres(db), tokens)
	session, _, _, err := authService.Login(ctx, "s3-media@example.invalid", "synthetic-media-password")
	if err != nil {
		t.Fatal(err)
	}
	auth := identity.NewHandler(authService, identity.HTTPConfig{AllowedOrigins: []string{"http://127.0.0.1:3000"}}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	endpoint := strings.TrimRight(os.Getenv("SNEEPCUT_TEST_S3_ENDPOINT"), "/")
	service := NewService(Config{LocalRoot: "/app/media", PublicBaseURL: endpoint + "/" + storage.bucket, AppURL: "http://127.0.0.1:3000", SigningSecret: strings.Repeat("s", 32), UploadSecret: strings.Repeat("u", 32), StagingDirectory: t.TempDir(), MaxUploadBytes: 1024 * 1024}, db, storage, &mockNonce{}, scannerFunc(func(context.Context, string) error { return nil }))
	router := httprouter.New()
	NewHandler(service, auth).Register(router)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Origin") == "http://127.0.0.1:3000" {
			w.Header().Set("Access-Control-Allow-Origin", "http://127.0.0.1:3000")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		router.ServeHTTP(w, r)
	}))
	t.Cleanup(server.Close)
	call := func(method, route, contentType, token string, body []byte, status int, result any) {
		t.Helper()
		req, _ := http.NewRequest(method, server.URL+route, bytes.NewReader(body))
		req.Header.Set("Content-Type", contentType)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		response, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		if response.StatusCode != status {
			message, _ := io.ReadAll(response.Body)
			t.Fatalf("%s %s: %d %s", method, route, response.StatusCode, message)
		}
		if result != nil {
			if err := json.NewDecoder(response.Body).Decode(result); err != nil {
				t.Fatal(err)
			}
		}
	}
	fixture := filepath.Join(t.TempDir(), "synthetic.mp4")
	if output, err := exec.Command("ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=160x90:r=12:d=1", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", fixture).CombinedOutput(); err != nil {
		t.Fatalf("create valid synthetic video: %v %s", err, output)
	}
	video, err := os.ReadFile(fixture)
	if err != nil {
		t.Fatal(err)
	}
	intent, _ := json.Marshal(UploadIntent{FileName: "synthetic.mp4", FileSize: int64(len(video)), ContentType: "video/mp4"})
	var authorized map[string]string
	call("POST", "/api/upload/authorize", "application/json", session.AccessToken, intent, 200, &authorized)
	var uploaded UploadResult
	call("PUT", authorized["uploadUrl"], "video/mp4", authorized["token"], video, 201, &uploaded)
	call("PUT", authorized["uploadUrl"], "video/mp4", authorized["token"], video, 401, nil)
	if !strings.HasPrefix(uploaded.FilePath, "uploads/"+userID+"/") {
		t.Fatal("S3 upload did not return a stable owner key")
	}
	if _, err := service.ValidateUploadSource(ctx, userID, uploaded.FilePath); err != nil {
		t.Fatal(err)
	}
	workerURL, err := service.WorkerSource(ctx, uploaded.FilePath)
	if err != nil {
		t.Fatal(err)
	}
	parsed, _ := url.Parse(workerURL)
	if key, err := service.KeyFromReference(workerURL); err != nil || key != uploaded.FilePath {
		t.Fatal("signed S3 reference cannot round-trip through the media service")
	}
	request, _ := http.NewRequest(http.MethodGet, workerURL, nil)
	request.Header.Set("Range", "bytes=4-7")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal("worker signed download failed")
	}
	rangeBytes, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != 206 || !bytes.Equal(rangeBytes, video[4:8]) {
		t.Fatal("signed range download changed bytes")
	}
	parsed.RawQuery = ""
	response, err = http.Get(parsed.String())
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusForbidden {
		t.Fatal("unsigned media was readable")
	}
	var raster bytes.Buffer
	if err := png.Encode(&raster, image.NewRGBA(image.Rect(0, 0, 16, 12))); err != nil {
		t.Fatal(err)
	}
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	part, _ := form.CreateFormFile("file", "photo.png")
	_, _ = part.Write(raster.Bytes())
	_ = form.Close()
	var publishing struct {
		Reference string `json:"reference"`
	}
	call("POST", "/api/publishing/media", form.FormDataContentType(), session.AccessToken, body.Bytes(), 201, &publishing)
	var preview map[string]string
	call("GET", "/api/publishing/media/preview?reference="+url.QueryEscape(publishing.Reference), "", session.AccessToken, nil, 200, &preview)
	if !strings.Contains(preview["url"], "X-Amz-Signature=") {
		t.Fatal("preview did not use a private S3 signature")
	}
	call("GET", "/api/publishing/media/preview?reference="+url.QueryEscape(publishing.Reference), "", "", nil, 401, nil)
	foreign := strings.Replace(publishing.Reference, userID, testUserID, 1)
	call("GET", "/api/publishing/media/preview?reference="+url.QueryEscape(foreign), "", session.AccessToken, nil, 403, nil)

	if manifest := os.Getenv("SNEEPCUT_MEDIA_BROWSER_MANIFEST"); manifest != "" {
		localEndpoint, _ := url.Parse(endpoint)
		aliasStorage, err := NewS3Storage(S3Config{AccessKey: os.Getenv("SNEEPCUT_TEST_S3_ACCESS_KEY"), SecretKey: os.Getenv("SNEEPCUT_TEST_S3_SECRET_KEY"), Bucket: storage.bucket, Region: "us-east-1", Endpoint: "http://s3.localhost:" + localEndpoint.Port(), PathStyle: true})
		if err != nil {
			t.Fatal(err)
		}
		aliasURL, err := aliasStorage.SignedURL(ctx, uploaded.FilePath, 5*time.Minute)
		if err != nil {
			t.Fatal(err)
		}
		payload, _ := json.Marshal(map[string]string{"baseURL": server.URL, "token": session.AccessToken, "fixture": fixture, "sourceURL": aliasURL, "owner": userID})
		if err := os.WriteFile(manifest, payload, 0600); err != nil {
			t.Fatal(err)
		}
		deadline := time.Now().Add(150 * time.Second)
		for {
			if _, err := os.Stat(manifest + ".done"); err == nil {
				break
			}
			if time.Now().After(deadline) {
				t.Fatal("browser verification did not release its fixture")
			}
			time.Sleep(100 * time.Millisecond)
		}
	}
	if _, err := db.Exec(`INSERT INTO account_deletion_requests(user_id,billing_cancellation_completed) VALUES($1,true)`, userID); err != nil {
		t.Fatal(err)
	}
	if result, err := service.CleanupAccount(ctx, userID); err != nil || !result.Complete {
		t.Fatalf("S3 owner cleanup: %+v %v", result, err)
	}
	if exists, err := storage.Exists(ctx, uploaded.FilePath); err != nil || exists {
		t.Fatal("S3 upload survived owner cleanup")
	}
}
