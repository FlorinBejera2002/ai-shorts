package publishing

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

type providerTransport struct{ target *url.URL }

func (r providerTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	cloned := req.Clone(req.Context())
	u := *req.URL
	u.Scheme = r.target.Scheme
	u.Host = r.target.Host
	cloned.URL = &u
	return http.DefaultTransport.RoundTrip(cloned)
}
func mockProvider(t *testing.T, h http.HandlerFunc) *ProviderClient {
	t.Helper()
	s := httptest.NewServer(h)
	t.Cleanup(s.Close)
	u, _ := url.Parse(s.URL)
	p := NewProviderClient(ProviderConfig{AppURL: "https://app.example", MetaAppID: "fb", MetaAppSecret: "secret", InstagramAppID: "ig", InstagramAppSecret: "secret", TikTokClientKey: "tt", TikTokClientSecret: "secret", TikTokVerifiedURLPrefix: "https://media.example/"})
	p.httpClient.Transport = providerTransport{u}
	return p
}
func TestProviderAuthorizationScopes(t *testing.T) {
	p := NewProviderClient(ProviderConfig{AppURL: "https://app.example", MetaAppID: "fb", MetaAppSecret: "s", InstagramAppID: "ig", InstagramAppSecret: "s", TikTokClientKey: "tt", TikTokClientSecret: "s", TikTokVerifiedURLPrefix: "https://media.example/"})
	for _, provider := range []string{"instagram", "facebook", "tiktok"} {
		got, err := p.Authorize(provider, "csrf-state", "verifier")
		if err != nil {
			t.Fatal(err)
		}
		u, _ := url.Parse(got)
		q := u.Query()
		if q.Get("state") != "csrf-state" || q.Get("redirect_uri") != "https://app.example/api/publishing/callback/"+provider {
			t.Fatal(got)
		}
		if strings.Contains(got, "client_secret") {
			t.Fatal("secret leaked")
		}
	}
	if _, err := p.Authorize("youtube", "state", ""); err == nil {
		t.Fatal("unsupported provider accepted")
	}
}
func TestInstagramPublishPollDoesNotFinalize(t *testing.T) {
	finalized := 0
	p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer access" {
			t.Error("missing authorization")
		}
		switch r.URL.Path {
		case "/v23.0/123/media":
			_ = r.ParseForm()
			if r.Form.Get("media_type") != "REELS" || r.Form.Get("caption") != "caption" {
				t.Error("invalid creation")
			}
			io.WriteString(w, `{"id":"456"}`)
		case "/v23.0/456":
			io.WriteString(w, `{"status_code":"FINISHED"}`)
		case "/v23.0/123/media_publish":
			finalized++
			_ = r.ParseForm()
			if r.Form.Get("creation_id") != "456" {
				t.Error("wrong container")
			}
			io.WriteString(w, `{"id":"789"}`)
		case "/v23.0/789":
			io.WriteString(w, `{"permalink":"https://instagram.com/reel/example"}`)
		default:
			t.Error(r.URL.Path)
			w.WriteHeader(404)
		}
	})
	c := Credentials{AccessToken: "access"}
	job, status, err := p.Publish(context.Background(), "instagram", "123", c, "https://media.example/a.mp4", "caption", TikTokOptions{})
	if err != nil || status != "processing" {
		t.Fatalf("%s %v", status, err)
	}
	status, _, err = p.Poll(context.Background(), "instagram", job, c)
	if err != nil || status != "ready" || finalized != 0 {
		t.Fatal("poll performed publication", err)
	}
	id, link, err := p.Finalize(context.Background(), "instagram", job, c)
	if err != nil || id != "789" || link == "" || finalized != 1 {
		t.Fatal(id, link, err)
	}
}
func TestTikTokCreatorConstraintsAndPublishStatus(t *testing.T) {
	initCalls := 0
	p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v2/post/publish/creator_info/query/":
			io.WriteString(w, `{"data":{"privacy_level_options":["SELF_ONLY"],"comment_disabled":true,"max_video_post_duration_sec":60},"error":{"code":"ok"}}`)
		case "/v2/post/publish/video/init/":
			initCalls++
			var v struct {
				Post map[string]any `json:"post_info"`
			}
			_ = json.NewDecoder(r.Body).Decode(&v)
			if v.Post["privacy_level"] != "SELF_ONLY" || v.Post["disable_comment"] != true {
				t.Error(v.Post)
			}
			io.WriteString(w, `{"data":{"publish_id":"job"},"error":{"code":"ok"}}`)
		case "/v2/post/publish/status/fetch/":
			io.WriteString(w, `{"data":{"status":"PUBLISH_COMPLETE"},"error":{"code":"ok"}}`)
		default:
			t.Error(r.URL.Path)
			w.WriteHeader(404)
		}
	})
	ctx := context.Background()
	c := Credentials{AccessToken: "token"}
	_, _, err := p.Publish(ctx, "tiktok", "user", c, "https://media.example/video.mp4", "caption", TikTokOptions{MusicUsageConfirmed: true, PrivacyLevel: "PUBLIC_TO_EVERYONE"})
	if err == nil || initCalls != 0 {
		t.Fatal("privacy selection was not enforced")
	}
	_, _, err = p.Publish(ctx, "tiktok", "user", c, "https://media.example/video.mp4", "caption", TikTokOptions{MusicUsageConfirmed: true, PrivacyLevel: "SELF_ONLY", BrandContentToggle: true})
	if err == nil || initCalls != 0 {
		t.Fatal("private branded post allowed")
	}
	job, _, err := p.Publish(ctx, "tiktok", "user", c, "https://media.example/video.mp4", "caption", TikTokOptions{MusicUsageConfirmed: true, PrivacyLevel: "SELF_ONLY"})
	if err != nil || job != "job" {
		t.Fatal(job, err)
	}
	status, _, err := p.Poll(ctx, "tiktok", job, c)
	if err != nil || status != "published" {
		t.Fatal(status, err)
	}
}
func TestProviderErrorsNeverExposeResponse(t *testing.T) {
	p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, `{"error":{"code":190,"message":"secret-token https://signed.example?secret=foo"}}`)
	})
	_, err := p.Options(context.Background(), Credentials{AccessToken: "secret-token"})
	if err == nil || strings.Contains(err.Error(), "secret") {
		t.Fatal(err)
	}
}
func TestFacebookRejectsUntrustedUploadHost(t *testing.T) {
	count := 0
	p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		count++
		io.WriteString(w, `{"video_id":"123","upload_url":"https://attacker.example/upload"}`)
	})
	_, _, err := p.Publish(context.Background(), "facebook", "123", Credentials{AccessToken: "secret"}, "https://media.example/a.mp4", "", TikTokOptions{})
	if err == nil || count != 1 {
		t.Fatal("untrusted upload accepted", err)
	}
}
func TestFacebookPageDiscoveryFiltersContentPermissionAndPaginates(t *testing.T) {
	p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "oauth/access_token") {
			io.WriteString(w, `{"access_token":"user-token","expires_in":3600}`)
			return
		}
		if r.URL.Query().Get("after") == "next" {
			io.WriteString(w, `{"data":[{"id":"2","name":"Second","access_token":"page2","tasks":["PROFILE_PLUS_CREATE_CONTENT"]}]}`)
			return
		}
		io.WriteString(w, `{"data":[{"id":"1","name":"First","access_token":"page1","tasks":["CREATE_CONTENT"]},{"id":"3","access_token":"no","tasks":["ANALYZE"]}],"paging":{"next":"https://must-not-follow.example/","cursors":{"after":"next"}}}`)
	})
	accounts, err := p.Exchange(context.Background(), "facebook", "code", "")
	if err != nil || len(accounts) != 2 || accounts[1].ID != "2" {
		t.Fatal(accounts, err)
	}
}

func TestVerifiedTikTokMediaURL(t *testing.T) {
	for _, sample := range []struct {
		url   string
		valid bool
	}{
		{"https://media.example/public/a.mp4?signature=x", true},
		{"https://media.example/publicity/a.mp4", false},
		{"https://media.example.attacker.example/public/a.mp4", false},
		{"https://media.example/public/../private.mp4", false},
		{"https://media.example/public/%2e%2e/private.mp4", false},
		{"https://media.example/public/a.mp4#fragment", false},
		{"http://media.example/public/a.mp4", false},
	} {
		if got := verifiedMediaURL("https://media.example/public", sample.url); got != sample.valid {
			t.Errorf("%s: %v", sample.url, got)
		}
	}
}

func TestFacebookFinishAndPoll(t *testing.T) {
	finished := false
	p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v23.0/123/video_reels":
			_ = r.ParseForm()
			if r.Form.Get("upload_phase") == "start" {
				io.WriteString(w, `{"video_id":"456","upload_url":"https://rupload.facebook.com/video-upload/v23.0/456"}`)
				return
			}
			if r.Form.Get("description") != "caption: + accents ă" || r.Form.Get("video_id") != "456" || r.Form.Get("video_state") != "PUBLISHED" {
				t.Error("invalid finish payload", r.Form)
			}
			finished = true
			io.WriteString(w, `{"success":true}`)
		case "/video-upload/v23.0/456":
			if r.Header.Get("Authorization") != "OAuth token" || r.Header.Get("file_url") != "https://media.example/a.mp4" {
				t.Error("invalid upload headers")
			}
			io.WriteString(w, `{"success":true}`)
		case "/v23.0/456":
			if finished {
				io.WriteString(w, `{"status":{"publishing_phase":{"status":"complete"}}}`)
			} else {
				io.WriteString(w, `{"status":{"processing_phase":{"status":"complete"}}}`)
			}
		default:
			w.WriteHeader(404)
		}
	})
	ctx := context.Background()
	c := Credentials{AccessToken: "token"}
	job, _, err := p.Publish(ctx, "facebook", "123", c, "https://media.example/a.mp4", "caption: + accents ă", TikTokOptions{})
	if err != nil {
		t.Fatal(err)
	}
	status, _, err := p.Poll(ctx, "facebook", job, c)
	if err != nil || status != "ready" || finished {
		t.Fatal(status, err)
	}
	_, _, err = p.Finalize(ctx, "facebook", job, c)
	if err != nil {
		t.Fatal(err)
	}
	status, _, err = p.Poll(ctx, "facebook", job, c)
	if err != nil || status != "published" {
		t.Fatal(status, err)
	}
}

func TestTikTokRefreshPreservesRotatedTokens(t *testing.T) {
	p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		if r.Form.Get("refresh_token") != "old" || r.Form.Get("grant_type") != "refresh_token" {
			t.Error("wrong refresh request")
		}
		io.WriteString(w, `{"access_token":"new-access","refresh_token":"new-refresh","expires_in":86400}`)
	})
	c, err := p.Refresh(context.Background(), "tiktok", Credentials{AccessToken: "old-access", RefreshToken: "old"})
	if err != nil || c.AccessToken != "new-access" || c.RefreshToken != "new-refresh" || c.ExpiresAt.IsZero() {
		t.Fatal("refresh did not rotate credentials", err)
	}
}

func TestInstagramExchangeWrappedToken(t *testing.T) {
	p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/oauth/access_token":
			io.WriteString(w, `{"data":[{"access_token":"short","user_id":"123"}]}`)
		case "/access_token":
			if r.URL.Query().Get("grant_type") != "ig_exchange_token" || r.URL.Query().Get("access_token") != "short" {
				t.Error("invalid long token exchange")
			}
			io.WriteString(w, `{"access_token":"long","expires_in":5184000}`)
		case "/v23.0/me":
			io.WriteString(w, `{"user_id":"123","username":"creator"}`)
		default:
			w.WriteHeader(404)
		}
	})
	accounts, err := p.Exchange(context.Background(), "instagram", "code", "")
	if err != nil || len(accounts) != 1 || accounts[0].ID != "123" || accounts[0].Credentials.AccessToken != "long" {
		t.Fatal("wrapped Instagram exchange failed", err)
	}
}
