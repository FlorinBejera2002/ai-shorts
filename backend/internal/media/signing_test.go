package media

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const testUserID = "00000000-0000-0000-0000-000000000123"

var testNow = time.Unix(2000000000, 0)

const pythonUploadToken = "eyJ2ZXJzaW9uIjoxLCJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAxMjMiLCJub25jZSI6ImFiY2RlZjAxMjM0NTY3ODlhYmNkZWYwMTIzNDU2Nzg5IiwiZXhwaXJlc0F0IjoyMDAwMDAwMzAwLCJmaWxlTmFtZSI6InZpZGVvLm1wNCIsImZpbGVTaXplIjoxNiwiY29udGVudFR5cGUiOiJ2aWRlby9tcDQifQ.CMwrYzJlAmMZionQeXttLb5movIhadEmmjIOgnlgXvI"

func TestPythonMediaSignatureCompatibility(t *testing.T) {
	path := "/media/clips/" + testUserID + "/clip.mp4"
	got := SignMediaPath("test-media-secret", path, 2000000000)
	if got != "092dc0c095a924b6dbeadac5df1e3c88" {
		t.Fatalf("Python fixture changed: %s", got)
	}
	if !VerifyMediaSignature("test-media-secret", path, "2000000000", got, testNow) {
		t.Fatal("boundary signature invalid")
	}
	for _, check := range []struct {
		path, expires, sig string
		now                time.Time
	}{{path, "2000000000", got, testNow.Add(time.Nanosecond)}, {path + "x", "2000000000", got, testNow}, {path, "garbage", got, testNow}, {"/media/../secret", "2000000000", got, testNow}, {"/api/account", "2000000000", got, testNow}} {
		if VerifyMediaSignature("test-media-secret", check.path, check.expires, check.sig, check.now) {
			t.Fatalf("accepted %+v", check)
		}
	}
}
func TestUploadTokenPythonCompatibilityAndTampering(t *testing.T) {
	secret := strings.Repeat("x", 32)
	claims, e := VerifyUploadToken(secret, pythonUploadToken, 1024, testNow)
	if e != nil || claims.UserID != testUserID || claims.FileSize != 16 {
		t.Fatalf("fixture failed: %+v %v", claims, e)
	}
	for _, token := range []string{pythonUploadToken + "=", pythonUploadToken + ".junk", "x" + pythonUploadToken, pythonUploadToken[:len(pythonUploadToken)-1] + "J"} {
		if _, e := VerifyUploadToken(secret, token, 1024, testNow); e == nil {
			t.Fatal("accepted tampered token")
		}
	}
	if _, e := VerifyUploadToken(secret, pythonUploadToken, 1024, testNow.Add(5*time.Minute)); e == nil {
		t.Fatal("accepted expired token")
	}
	if _, e := VerifyUploadToken(secret, pythonUploadToken, 8, testNow); e == nil {
		t.Fatal("accepted excessive size")
	}
}
func tokenForPayload(payload string) string {
	encoded := base64.RawURLEncoding.EncodeToString([]byte(payload))
	mac := hmac.New(sha256.New, []byte(strings.Repeat("x", 32)))
	_, _ = io.WriteString(mac, encoded)
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
func TestUploadTokenRejectsMalformedSignedClaims(t *testing.T) {
	parts := strings.Split(pythonUploadToken, ".")
	raw, _ := base64.RawURLEncoding.DecodeString(parts[0])
	var original map[string]any
	_ = json.Unmarshal(raw, &original)
	for key, value := range map[string]any{"version": 2, "userId": "../root", "nonce": "../nonce", "expiresAt": testNow.Unix() + 601, "fileName": "../video.mp4", "fileSize": true, "contentType": "text/html", "extra": "value"} {
		copy := map[string]any{}
		for k, v := range original {
			copy[k] = v
		}
		copy[key] = value
		payload, _ := json.Marshal(copy)
		if _, e := VerifyUploadToken(strings.Repeat("x", 32), tokenForPayload(string(payload)), 1024, testNow); e == nil {
			t.Fatalf("accepted %s", key)
		}
	}
	duplicate := strings.TrimSuffix(string(raw), "}") + `,"fileSize":16}`
	if _, e := VerifyUploadToken(strings.Repeat("x", 32), tokenForPayload(duplicate), 1024, testNow); e == nil {
		t.Fatal("accepted duplicate claim")
	}
}
func TestVerifyRequestRejectsAmbiguousAndUnsafeURLs(t *testing.T) {
	s := NewService(Config{SigningSecret: "secret"}, nil, nil, nil, nil)
	s.now = func() time.Time { return testNow }
	h := NewHandler(s, nil)
	path := "/media/clips/job/clip.mp4"
	uri := path + "?expires=2000000300&sig=" + SignMediaPath("secret", path, 2000000300)
	for _, tc := range []struct {
		uri    string
		status int
	}{{uri, 204}, {uri + "&sig=evil", 403}, {uri + "&expires=2000000300", 403}, {"https://evil.invalid" + uri, 403}, {"//evil.invalid" + uri, 403}, {strings.Replace(uri, "/clips/", "/%2e%2e/", 1), 403}, {"", 403}} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/api/media/verify-request", nil)
		r.Header.Set("X-Original-URI", tc.uri)
		h.verifyRequest(w, r)
		if w.Code != tc.status {
			t.Fatalf("%q: %d", tc.uri, w.Code)
		}
	}
}
