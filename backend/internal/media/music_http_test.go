package media

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/julienschmidt/httprouter"
	"golang.org/x/crypto/bcrypt"
	"sneepcut/backend-go/internal/identity"
)

func TestMusicHTTPUploadAndOwnedPreviewUseAuthenticatedRoutes(t *testing.T) {
	s, mock, storage, nonce := uploadService(t)
	auth, repository, token := musicHTTPIdentity(t)
	router := httprouter.New()
	NewHandler(s, auth).Register(router)
	audio := []byte("fLaCsynthetic-container-for-http-ingestion-only")
	body, contentType := musicHTTPMultipart(t, "file", "My quiet intro.flac", audio)
	call := func(method, target, bearer string, body []byte, contentType string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, target, bytes.NewReader(body))
		if bearer != "" {
			r.Header.Set("Authorization", "Bearer "+bearer)
		}
		if contentType != "" {
			r.Header.Set("Content-Type", contentType)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	// Membership and authentication must run before body parsing or storage.
	if w := call(http.MethodPost, "/api/upload/music", "", body, contentType); w.Code != http.StatusUnauthorized || len(storage.saved) != 0 {
		t.Fatalf("unauthenticated upload reached ingestion: %d %s", w.Code, w.Body.String())
	}
	repository.user.AccessRole = "viewer"
	if w := call(http.MethodPost, "/api/upload/music", token, body, contentType); w.Code != http.StatusForbidden || len(storage.saved) != 0 {
		t.Fatalf("viewer upload reached ingestion: %d %s", w.Code, w.Body.String())
	}
	repository.user.AccessRole = "member"
	activeAccount(mock, "member", false) // Request admission precedes ingestion.
	activeAccount(mock, "member", false)
	activeAccount(mock, "member", false)
	w := call(http.MethodPost, "/api/upload/music", token, body, contentType)
	if w.Code != http.StatusCreated {
		t.Fatalf("music upload route failed: %d %s", w.Code, w.Body.String())
	}
	var uploaded struct {
		FilePath string `json:"file_path"`
		FileName string `json:"file_name"`
		FileSize int64  `json:"file_size"`
		URL      string `json:"url"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &uploaded); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(uploaded.FilePath, "uploads/"+testUserID+"/") || !strings.HasSuffix(uploaded.FilePath, "-music.flac") ||
		uploaded.FileName != "My quiet intro.flac" || uploaded.FileSize != int64(len(audio)) || uploaded.URL != "https://storage.invalid/"+uploaded.FilePath+"?fresh=1" {
		t.Fatalf("HTTP upload contract lost actual stored metadata: %+v", uploaded)
	}
	if len(storage.saved) != 1 || storage.saved[0] != uploaded.FilePath || !bytes.Equal(storage.data[uploaded.FilePath], audio) {
		t.Fatal("HTTP upload response does not describe the stored original")
	}
	if w.Header().Get("Cache-Control") != "private, no-store" || w.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("private upload response has incorrect headers: %v", w.Header())
	}
	previewURL := "/api/upload/music/preview?reference=" + url.QueryEscape(uploaded.FilePath)
	w = call(http.MethodGet, previewURL, token, nil, "")
	var preview struct {
		URL string `json:"url"`
	}
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &preview) != nil || preview.URL != uploaded.URL {
		t.Fatalf("owned preview could not refresh its URL: %d %s", w.Code, w.Body.String())
	}
	foreign := strings.Replace(uploaded.FilePath, testUserID, "11111111-1111-4111-8111-111111111111", 1)
	storage.data[foreign] = audio // Even an existing other account's file is private.
	w = call(http.MethodGet, "/api/upload/music/preview?reference="+url.QueryEscape(foreign), token, nil, "")
	if w.Code != http.StatusBadRequest || strings.Contains(w.Body.String(), "storage.invalid") {
		t.Fatalf("preview exposed a foreign recording: %d %s", w.Code, w.Body.String())
	}
	if w := call(http.MethodGet, previewURL, "", nil, ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("preview bypassed authentication: %d %s", w.Code, w.Body.String())
	}
	if repository.reads != 4 {
		t.Fatalf("protected routes did not read current session state: %d", repository.reads)
	}
	nonce.limited = true
	activeAccount(mock, "member", false)
	w = call(http.MethodPost, "/api/upload/music", token, body, contentType)
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") == "" || len(storage.saved) != 1 {
		t.Fatalf("music upload admission was not enforced: %d %s", w.Code, w.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
	assertEmptyStage(t, s)
}

func TestMusicHTTPRejectsMalformedUploadWithoutStoring(t *testing.T) {
	s, mock, storage, _ := uploadService(t)
	auth, _, token := musicHTTPIdentity(t)
	router := httprouter.New()
	NewHandler(s, auth).Register(router)
	for _, test := range []struct {
		name, field, filename string
		data                  []byte
		status                int
		checksAccount         bool
	}{
		{"wrong field", "attachment", "song.flac", []byte("fLaCaudio"), http.StatusBadRequest, false},
		{"unsupported extension", "file", "song.exe", []byte("fLaCaudio"), http.StatusUnprocessableEntity, false},
		{"forged container", "file", "song.flac", []byte("this is not a FLAC file"), http.StatusBadRequest, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			activeAccount(mock, "member", false) // Upload admission checks the account.
			if test.checksAccount {
				activeAccount(mock, "member", false)
			}
			body, contentType := musicHTTPMultipart(t, test.field, test.filename, test.data)
			r := httptest.NewRequest(http.MethodPost, "/api/upload/music", bytes.NewReader(body))
			r.Header.Set("Content-Type", contentType)
			r.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, r)
			if w.Code != test.status || len(storage.saved) != 0 {
				t.Fatalf("invalid upload reached storage: %d %s", w.Code, w.Body.String())
			}
			assertEmptyStage(t, s)
		})
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func musicHTTPMultipart(t *testing.T, field, filename string, audio []byte) ([]byte, string) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile(field, filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = part.Write(audio); err != nil {
		t.Fatal(err)
	}
	if err = writer.Close(); err != nil {
		t.Fatal(err)
	}
	return body.Bytes(), writer.FormDataContentType()
}

// Use the actual middleware and signed token format: the identity package
// deliberately keeps its principal context key private. Only persistence is fake.
func musicHTTPIdentity(t *testing.T) (*identity.Handler, *musicHTTPRepository, string) {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte("synthetic-music-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	repository := &musicHTTPRepository{user: identity.User{ID: testUserID, Email: "music-http@example.invalid", PasswordHash: string(hash), AccessRole: "member", AccountStatus: "active"}, sessions: map[string]time.Time{}}
	tokens, err := identity.NewTokens(identity.TokenConfig{Secret: strings.Repeat("music-test-secret", 3), Issuer: "music-test", Audience: "music-test", AccessLifetime: time.Minute, RefreshLifetime: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	service := identity.NewService(repository, tokens)
	session, _, _, err := service.Login(context.Background(), repository.user.Email, "synthetic-music-password")
	if err != nil {
		t.Fatal(err)
	}
	return identity.NewHandler(service, identity.HTTPConfig{}, slog.New(slog.NewTextHandler(io.Discard, nil))), repository, session.AccessToken
}

type musicHTTPRepository struct {
	user     identity.User
	sessions map[string]time.Time
	reads    int
}

func (r *musicHTTPRepository) FindByEmail(_ context.Context, email string) (identity.User, error) {
	if email != r.user.Email {
		return identity.User{}, identity.ErrUnauthenticated
	}
	return r.user, nil
}

func (r *musicHTTPRepository) CreateSession(_ context.Context, id string, _ identity.User, expires time.Time) error {
	r.sessions[id] = expires
	return nil
}

func (r *musicHTTPRepository) FindSession(_ context.Context, id string) (identity.Session, error) {
	r.reads++
	expires, ok := r.sessions[id]
	if !ok {
		return identity.Session{}, identity.ErrUnauthenticated
	}
	return identity.Session{User: r.user, Expires: expires}, nil
}

func (r *musicHTTPRepository) DeleteSession(_ context.Context, id string) error {
	delete(r.sessions, id)
	return nil
}
