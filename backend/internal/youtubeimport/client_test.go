package youtubeimport

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

const testVerifier = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGH"

func testClient(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	server := httptest.NewTLSServer(handler)
	t.Cleanup(server.Close)
	client, err := NewClient(ClientConfig{ClientID: "import-client", ClientSecret: "import-secret", RedirectURL: "http://localhost:8080/api/youtube-import/callback", HTTPClient: server.Client(), Endpoints: &Endpoints{AuthorizationURL: server.URL + "/auth", TokenURL: server.URL + "/token", APIBaseURL: server.URL + "/v1", RevokeURL: server.URL + "/revoke"}})
	if err != nil {
		t.Fatal(err)
	}
	return client
}

func TestAuthorizationSeparatesPortabilityScopesAndUsesPKCE(t *testing.T) {
	client := testClient(t, func(http.ResponseWriter, *http.Request) { t.Error("authorization must not call server") })
	authorization, err := client.AuthorizationURL("saved-state", testVerifier, []string{PublicVideos, UnlistedVideos})
	if err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(authorization)
	query := u.Query()
	if query.Get("scope") != scopePrefix+PublicVideos+" "+scopePrefix+UnlistedVideos || query.Get("include_granted_scopes") != "false" || query.Get("access_type") != "offline" || query.Get("state") != "saved-state" || query.Get("response_type") != "code" || query.Get("prompt") != "consent" {
		t.Fatalf("unexpected authorization parameters: %v", query)
	}
	challenge := sha256.Sum256([]byte(testVerifier))
	if query.Get("code_challenge_method") != "S256" || query.Get("code_challenge") != base64.RawURLEncoding.EncodeToString(challenge[:]) || strings.Contains(authorization, testVerifier) || strings.Contains(authorization, "import-secret") {
		t.Fatal("authorization URL does not safely use PKCE")
	}
	if _, err := client.AuthorizationURL("state", testVerifier, []string{"userinfo.email"}); err == nil {
		t.Fatal("mixed identity scope accepted")
	}
	if got := GrantedResources(scopePrefix+UnlistedVideos, []string{PublicVideos, UnlistedVideos}); len(got) != 1 || got[0] != UnlistedVideos {
		t.Fatalf("partial grant expanded: %v", got)
	}
	if got := GrantedResources(scopePrefix+UnlistedVideos, []string{PublicVideos}); len(got) != 0 {
		t.Fatalf("unrequested grant accepted: %v", got)
	}
}

func TestExchangeRefreshAndImportLifecycle(t *testing.T) {
	calls := make(map[string]int)
	client := testClient(t, func(w http.ResponseWriter, request *http.Request) {
		calls[request.URL.Path]++
		if request.URL.Path == "/token" {
			if err := request.ParseForm(); err != nil {
				t.Error(err)
			}
			if request.Form.Get("client_secret") != "import-secret" || request.Form.Get("client_id") != "import-client" || request.Header.Get("Authorization") != "" {
				t.Error("token credentials not sent as isolated form")
			}
			switch request.Form.Get("grant_type") {
			case "authorization_code":
				if request.Form.Get("code_verifier") != testVerifier || request.Form.Get("code") != "user-code" || request.Form.Get("redirect_uri") == "" {
					t.Error("missing authorization code binding")
				}
				fmt.Fprintf(w, `{"access_token":"access-one","refresh_token":"refresh","token_type":"Bearer","expires_in":3600,"scope":%q}`, scopePrefix+PublicVideos)
			case "refresh_token":
				if request.Form.Get("refresh_token") != "refresh" {
					t.Error("refresh token missing")
				}
				fmt.Fprint(w, `{"access_token":"access-two","token_type":"Bearer","expires_in":3600}`)
			default:
				t.Error("unexpected token grant")
			}
			return
		}
		if request.URL.Path == "/revoke" {
			_ = request.ParseForm()
			if request.Form.Get("token") != "refresh" || request.Header.Get("Authorization") != "" || request.URL.RawQuery != "" {
				t.Error("revoke leaks token in URL or headers")
			}
			fmt.Fprint(w, `{}`)
			return
		}
		if request.Header.Get("Authorization") != "Bearer access-two" {
			t.Error("portability API access token missing")
		}
		switch request.URL.Path {
		case "/v1/portabilityArchive:initiate":
			var payload struct {
				Resources []string `json:"resources"`
			}
			if request.Method != http.MethodPost || json.NewDecoder(request.Body).Decode(&payload) != nil || len(payload.Resources) != 1 || payload.Resources[0] != PublicVideos {
				t.Error("wrong initiate payload")
			}
			fmt.Fprint(w, `{"archiveJobId":"job-123","accessType":"ACCESS_TYPE_ONE_TIME"}`)
		case "/v1/archiveJobs/job-123/portabilityArchiveState":
			if request.Method != http.MethodGet {
				t.Error("state is not read-only")
			}
			fmt.Fprint(w, `{"state":"COMPLETE","urls":["https://storage.googleapis.com/export/example.zip?signature=private"]}`)
		case "/v1/authorization:reset":
			if request.Method != http.MethodPost || request.ContentLength > 0 {
				t.Error("reset requires empty POST")
			}
			fmt.Fprint(w, `{}`)
		default:
			http.NotFound(w, request)
		}
	})
	token, err := client.Exchange(context.Background(), "user-code", testVerifier)
	if err != nil || token.RefreshToken != "refresh" || time.Until(token.ExpiresAt) < 59*time.Minute {
		t.Fatalf("exchange failed: %v", err)
	}
	token, err = client.Refresh(context.Background(), token)
	if err != nil || token.RefreshToken != "refresh" || token.Scope != scopePrefix+PublicVideos || token.AccessToken != "access-two" {
		t.Fatalf("refresh lost grant: %v", err)
	}
	job, err := client.Initiate(context.Background(), token.AccessToken, []string{PublicVideos})
	if err != nil || job.ID != "job-123" {
		t.Fatalf("initiate: %v", err)
	}
	state, err := client.State(context.Background(), token.AccessToken, job.ID)
	if err != nil || state.State != "COMPLETE" || len(state.URLs) != 1 {
		t.Fatalf("state: %v", err)
	}
	if err := client.Reset(context.Background(), token.AccessToken); err != nil {
		t.Fatal(err)
	}
	if err := client.Revoke(context.Background(), token.RefreshToken); err != nil {
		t.Fatal(err)
	}
	if calls["/token"] != 2 || calls["/v1/authorization:reset"] != 1 {
		t.Fatalf("unexpected lifecycle calls: %v", calls)
	}
}

func TestGoogleClientRefusesRedirectAndSanitizesErrors(t *testing.T) {
	for _, status := range []int{http.StatusBadRequest, http.StatusFound} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			followed := false
			client := testClient(t, func(w http.ResponseWriter, request *http.Request) {
				if request.URL.Path == "/leak" {
					followed = true
				}
				w.Header().Set("Location", "/leak")
				w.WriteHeader(status)
				fmt.Fprint(w, `{"error":"invalid_grant","error_description":"secret-access-token signed-url-cookie"}`)
			})
			_, err := client.Exchange(context.Background(), "code", testVerifier)
			var apiError *APIError
			if !errors.As(err, &apiError) || apiError.StatusCode != status || apiError.Code != "invalid_grant" || strings.Contains(err.Error(), "secret-access-token") || followed {
				t.Fatalf("unsafe error handling: %v, followed=%v", err, followed)
			}
		})
	}
	if _, err := NewClient(ClientConfig{ClientID: "id", ClientSecret: "secret", RedirectURL: "https://app.example/callback", Endpoints: &Endpoints{AuthorizationURL: "http://google.example"}}); err == nil {
		t.Fatal("insecure endpoints accepted")
	}
}

func TestRefreshRejectsUnexpectedPermissions(t *testing.T) {
	client := testClient(t, func(w http.ResponseWriter, request *http.Request) {
		fmt.Fprint(w, `{"access_token":"token","expires_in":3600,"scope":"https://www.googleapis.com/auth/youtube.upload"}`)
	})
	if _, err := client.Refresh(context.Background(), Token{RefreshToken: "refresh"}); err == nil {
		t.Fatal("publishing permission accepted by portability client")
	}
}

// Private videos are a restricted Google scope that would require an annual
// security assessment; the app requests only public and unlisted videos.
func TestPrivateVideoScopeIsNeitherRequestedNorAccepted(t *testing.T) {
	const privateVideos = "youtube.private_videos"
	client := testClient(t, func(w http.ResponseWriter, request *http.Request) {
		fmt.Fprintf(w, `{"access_token":"token","expires_in":3600,"scope":%q}`, scopePrefix+privateVideos)
	})
	if _, err := client.AuthorizationURL("state", testVerifier, []string{PublicVideos, privateVideos}); err == nil {
		t.Fatal("private video scope requested")
	}
	if _, err := requestedResources([]string{"private"}); err == nil {
		t.Fatal("private visibility accepted")
	}
	if _, err := client.Exchange(context.Background(), "code", testVerifier); err == nil {
		t.Fatal("private video grant accepted")
	}
}

func TestRevokePreservesInvalidTokenWithoutSensitiveDescription(t *testing.T) {
	client := testClient(t, func(w http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/revoke" || request.Method != http.MethodPost {
			t.Error("unexpected revocation request")
		}
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, `{"error":"invalid_token","error_description":"sensitive-token-and-signed-url"}`)
	})
	err := client.Revoke(context.Background(), "already-revoked-token")
	var rejected *APIError
	if !errors.As(err, &rejected) || rejected.StatusCode != http.StatusBadRequest || rejected.Code != "invalid_token" {
		t.Fatalf("definitive revocation was not preserved: %v", err)
	}
	if strings.Contains(err.Error(), "sensitive-token-and-signed-url") || strings.Contains(err.Error(), "already-revoked-token") {
		t.Fatalf("revocation error exposed credentials: %v", err)
	}
}
