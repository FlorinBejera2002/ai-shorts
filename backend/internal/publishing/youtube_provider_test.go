package publishing

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/netip"
	"strings"
	"testing"
)

func TestYouTubeMediaRejectsInternalAndReservedIPs(t *testing.T) {
	for _, raw := range []string{"127.0.0.1", "10.1.1.1", "169.254.169.254", "100.64.0.1", "192.0.2.1", "198.18.0.1", "224.0.0.1", "::1", "::ffff:127.0.0.1", "fd00::1", "2001:db8::1"} {
		if youtubePublicIP(netip.MustParseAddr(raw)) {
			t.Errorf("accepted %s", raw)
		}
	}
	if !youtubePublicIP(netip.MustParseAddr("8.8.8.8")) {
		t.Error("rejected public address")
	}
}

func youtubeTestOptions() YouTubeOptions {
	no := false
	return YouTubeOptions{Title: "Test video", PrivacyStatus: "private", MadeForKids: &no, ContainsSyntheticMedia: &no, TermsAccepted: true}
}

func TestYouTubeOptionsRequireExplicitChoices(t *testing.T) {
	for _, mutate := range []func(*YouTubeOptions){
		func(o *YouTubeOptions) { o.Title = "" },
		func(o *YouTubeOptions) { o.Title = strings.Repeat("a", 101) },
		func(o *YouTubeOptions) { o.Description = strings.Repeat("é", 2501) },
		func(o *YouTubeOptions) { o.PrivacyStatus = "public" },
		func(o *YouTubeOptions) { o.MadeForKids = nil },
		func(o *YouTubeOptions) { o.ContainsSyntheticMedia = nil },
		func(o *YouTubeOptions) { o.TermsAccepted = false },
	} {
		o := youtubeTestOptions()
		mutate(&o)
		if ValidateYouTubeOptions(o, false) == nil {
			t.Fatalf("accepted invalid options: %+v", o)
		}
	}
	o := youtubeTestOptions()
	o.PrivacyStatus = "unlisted"
	if err := ValidateYouTubeOptions(o, true); err != nil {
		t.Fatal(err)
	}
}

func TestYouTubeStreamsResumableUploadAndPolls(t *testing.T) {
	var uploads int
	p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/video.mp4":
			if r.Header.Get("Authorization") != "" {
				t.Error("token leaked to media storage")
			}
			w.Header().Set("Content-Type", "video/mp4")
			io.WriteString(w, "video")
		case "/upload/youtube/v3/videos":
			if r.Header.Get("Authorization") != "Bearer access" {
				t.Error("missing token")
			}
			if r.Method == http.MethodPost {
				var body struct {
					Snippet struct{ Title string }
					Status  struct {
						PrivacyStatus           string
						SelfDeclaredMadeForKids bool
						ContainsSyntheticMedia  bool
					}
				}
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Fatal(err)
				}
				if body.Snippet.Title != "Test video" || body.Status.PrivacyStatus != "private" || r.Header.Get("X-Upload-Content-Length") != "5" || r.URL.Query().Get("notifySubscribers") != "false" {
					t.Error("wrong upload metadata")
				}
				w.Header().Set("Location", "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=session")
				return
			}
			uploads++
			data, _ := io.ReadAll(r.Body)
			if string(data) != "video" || r.ContentLength != 5 {
				t.Error("wrong uploaded media")
			}
			w.WriteHeader(http.StatusCreated)
			io.WriteString(w, `{"id":"video-id"}`)
		case "/youtube/v3/videos":
			io.WriteString(w, `{"items":[{"id":"video-id","status":{"uploadStatus":"processed"}}]}`)
		default:
			t.Errorf("unexpected request %s", r.URL.Path)
			http.NotFound(w, r)
		}
	})
	p.config.YouTubeMediaURLPrefix = "https://media.example/"
	id, status, err := p.PublishYouTube(context.Background(), Credentials{AccessToken: "access"}, []PublishMedia{{Type: "video", URL: "https://media.example/video.mp4?signature=secret"}}, youtubeTestOptions())
	if err != nil || id != "video-id" || status != "processing" || uploads != 1 {
		t.Fatalf("%s %s %v uploads=%d", id, status, err, uploads)
	}
	status, link, err := p.Poll(context.Background(), "youtube", id, Credentials{AccessToken: "access"})
	if err != nil || status != "published" || link != "https://www.youtube.com/shorts/video-id" {
		t.Fatalf("%s %s %v", status, link, err)
	}
}

func TestYouTubeRejectsUnsafeSessionsAndMediaRedirects(t *testing.T) {
	for _, location := range []string{"https://attacker.example/upload", "https://www.googleapis.com.attacker.example/upload", "http://www.googleapis.com/upload/youtube/v3/videos", "https://www.googleapis.com:443/upload/youtube/v3/videos"} {
		t.Run(location, func(t *testing.T) {
			calls := 0
			p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
				calls++
				if r.URL.Path == "/video.mp4" {
					w.Header().Set("Content-Type", "video/mp4")
					io.WriteString(w, "video")
					return
				}
				w.Header().Set("Location", location)
			})
			p.config.YouTubeMediaURLPrefix = "https://media.example/"
			_, status, err := p.PublishYouTube(context.Background(), Credentials{}, []PublishMedia{{Type: "video", URL: "https://media.example/video.mp4"}}, youtubeTestOptions())
			if err == nil || status != "unknown" || calls != 2 {
				t.Fatalf("status=%s err=%v calls=%d", status, err, calls)
			}
		})
	}
	p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Location", "https://attacker.example/video")
		w.WriteHeader(302)
	})
	p.config.YouTubeMediaURLPrefix = "https://media.example/"
	_, status, err := p.PublishYouTube(context.Background(), Credentials{}, []PublishMedia{{Type: "video", URL: "https://media.example/video.mp4"}}, youtubeTestOptions())
	if err == nil || status != "failed" {
		t.Fatalf("%s %v", status, err)
	}
}

func TestYouTubeDeniedScopeAndRefreshRevocation(t *testing.T) {
	p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/token" {
			fmt.Fprintf(w, `{"access_token":"access","refresh_token":"refresh","scope":%q}`, "https://www.googleapis.com/auth/youtube.readonly")
			return
		}
		if r.URL.Path == "/revoke" {
			r.ParseForm()
			if r.Form.Get("token") != "refresh" {
				t.Error("did not revoke refresh token")
			}
			w.WriteHeader(http.StatusOK)
			return
		}
		t.Error("unexpected request")
	})
	if _, err := p.Exchange(context.Background(), "youtube", "code", "verifier"); err == nil {
		t.Fatal("partial consent accepted")
	}
	if err := p.Revoke(context.Background(), "youtube", Credentials{AccessToken: "access", RefreshToken: "refresh"}); err != nil {
		t.Fatal(err)
	}
}

func TestYouTubeAmbiguousUploadIsNotRetried(t *testing.T) {
	uploads := 0
	p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			w.Header().Set("Content-Type", "video/mp4")
			io.WriteString(w, "video")
			return
		}
		if r.Method == http.MethodPost {
			w.Header().Set("Location", "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=session")
			return
		}
		uploads++
		w.WriteHeader(503)
		io.WriteString(w, `{"error":{"code":503,"message":"secret-token"}}`)
	})
	p.config.YouTubeMediaURLPrefix = "https://media.example/"
	_, state, err := p.PublishYouTube(context.Background(), Credentials{AccessToken: "secret-token"}, []PublishMedia{{Type: "video", URL: "https://media.example/video.mp4"}}, youtubeTestOptions())
	if err == nil || state != "unknown" || uploads != 1 || strings.Contains(err.Error(), "secret-token") {
		t.Fatalf("state=%s uploads=%d err=%v", state, uploads, err)
	}
}

func TestYouTubeRejectsOversizedMediaBeforeCreatingSession(t *testing.T) {
	calls := 0
	p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "video/mp4")
		w.Header().Set("Content-Length", fmt.Sprint(youtubeMaxUploadBytes+1))
		w.WriteHeader(200)
	})
	p.config.YouTubeMediaURLPrefix = "https://media.example/"
	_, state, err := p.PublishYouTube(context.Background(), Credentials{}, []PublishMedia{{Type: "video", URL: "https://media.example/video.mp4"}}, youtubeTestOptions())
	if err == nil || state != "failed" || calls != 1 {
		t.Fatalf("state=%s calls=%d err=%v", state, calls, err)
	}
}

func TestYouTubePermanentAuthorizationErrors(t *testing.T) {
	for _, tc := range []struct {
		body    string
		status  int
		revoked bool
	}{
		{`{"error":"invalid_grant"}`, 400, true},
		{`{"error":{"code":403,"errors":[{"reason":"quotaExceeded"}]}}`, 403, false},
		{`{"error":{"code":403,"errors":[{"reason":"insufficientPermissions"}]}}`, 403, true},
	} {
		p := mockProvider(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(tc.status); io.WriteString(w, tc.body) })
		_, err := p.Refresh(context.Background(), "youtube", Credentials{RefreshToken: "refresh"})
		if YouTubeAuthorizationRevoked(err) != tc.revoked {
			t.Fatalf("wrong classification %s: %v", tc.body, err)
		}
	}
}
