package media

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"
)

const publishingDeliveryPrefix = "/media/publish/"

var publishingDeliveryClient = func() *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ResponseHeaderTimeout = 30 * time.Second
	return &http.Client{Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}()

func publishingDeliveryKey(key string) bool {
	if !validKey(key) || (!strings.HasPrefix(key, "clips/") && !strings.HasPrefix(key, "publishing/")) {
		return false
	}
	switch strings.ToLower(path.Ext(key)) {
	case ".mp4", ".mov", ".webm", ".jpg", ".jpeg", ".webp":
		return true
	}
	return false
}

// PublishingURL keeps TikTok pulls under the existing owned application prefix.
// Normal previews and other providers continue to use storage-signed URLs.
func (s *Service) PublishingURL(ctx context.Context, provider, reference string) (string, error) {
	if provider != "tiktok" {
		return s.SignedURL(ctx, reference)
	}
	key, err := s.KeyFromReference(reference)
	if err != nil || !publishingDeliveryKey(key) {
		return "", ErrInvalidKey
	}
	origin, err := url.Parse(s.cfg.AppURL)
	if err != nil || origin.Host == "" || (origin.Scheme != "https" && origin.Scheme != "http") || origin.User != nil || origin.RawQuery != "" || origin.Fragment != "" || (origin.Path != "" && origin.Path != "/") {
		return "", errors.New("invalid application media origin")
	}
	if s.cfg.SigningSecret == "" {
		return "", errors.New("media signing secret is required")
	}
	origin.Path = publishingDeliveryPrefix + key
	expires := s.now().Add(4 * time.Hour).Unix()
	origin.RawQuery = url.Values{"expires": {strconv.FormatInt(expires, 10)}, "sig": {SignMediaPath(s.cfg.SigningSecret, origin.Path, expires)}}.Encode()
	return origin.String(), nil
}

// A purpose-bound bearer signature is checked before touching either storage.
// Only the server's configured storage can supply the upstream URL.
func (h *Handler) deliverPublishingMedia(w http.ResponseWriter, r *http.Request) {
	query, err := url.ParseQuery(r.URL.RawQuery)
	key := strings.TrimPrefix(r.URL.Path, publishingDeliveryPrefix)
	if err != nil || len(query) != 2 || len(query["expires"]) != 1 || len(query["sig"]) != 1 || !strings.HasPrefix(r.URL.Path, publishingDeliveryPrefix) || !publishingDeliveryKey(key) || !VerifyMediaSignature(h.service.cfg.SigningSecret, r.URL.Path, query.Get("expires"), query.Get("sig"), h.service.now()) {
		mediaError(w, failure(403, "Invalid or expired URL"))
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Type", publishingContentTypes[strings.ToLower(path.Ext(key))])
	if local, ok := h.service.Storage.(*LocalStorage); ok {
		if err := local.check(key); err != nil {
			mediaError(w, failure(404, "Media was not found"))
			return
		}
		file, err := local.root.Open(key)
		if err != nil {
			mediaError(w, failure(404, "Media was not found"))
			return
		}
		defer file.Close()
		info, err := file.Stat()
		if err != nil || !info.Mode().IsRegular() {
			mediaError(w, failure(404, "Media was not found"))
			return
		}
		http.ServeContent(w, r, path.Base(key), info.ModTime(), file)
		return
	}
	address, err := h.service.Storage.SignedURL(r.Context(), key, 10*time.Minute)
	if err != nil || address == "" {
		mediaError(w, failure(502, "Media storage is temporarily unavailable"))
		return
	}
	// GET signatures also serve HEAD requests; the body is closed without copying.
	ctx, cancel := context.WithTimeout(r.Context(), time.Hour)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		mediaError(w, failure(502, "Media storage is temporarily unavailable"))
		return
	}
	request.Header.Set("Accept-Encoding", "identity")
	for _, name := range []string{"Range", "If-Range"} {
		if value := r.Header.Get(name); value != "" {
			request.Header.Set(name, value)
		}
	}
	response, err := publishingDeliveryClient.Do(request)
	if err != nil {
		mediaError(w, failure(502, "Media storage is temporarily unavailable"))
		return
	}
	defer response.Body.Close()
	switch response.StatusCode {
	case http.StatusNotFound:
		mediaError(w, failure(404, "Media was not found"))
		return
	case http.StatusRequestedRangeNotSatisfiable:
		w.Header().Set("Content-Range", response.Header.Get("Content-Range"))
		w.Header().Set("Content-Length", "0")
		w.WriteHeader(response.StatusCode)
		return
	case http.StatusOK, http.StatusPartialContent:
	default:
		mediaError(w, failure(502, "Media storage is temporarily unavailable"))
		return
	}
	for _, name := range []string{"Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"} {
		if value := response.Header.Get(name); value != "" {
			w.Header().Set(name, value)
		}
	}
	w.WriteHeader(response.StatusCode)
	if r.Method != http.MethodHead {
		if _, err := io.Copy(w, response.Body); err != nil {
			panic(http.ErrAbortHandler)
		}
	}
}
