package main

import (
	"context"
	"errors"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/processing"
	"sneepcut/backend-go/internal/studiocomposition"
)

// An isolated namespace, never a real account. The matching local Studio
// service must be configured for evaluation; production credentials are not a
// substitute for permission to read the user's evaluation files.
const evaluationOwner = "6d6f79b4-d721-4c71-98e6-227b9f49608c"

func evaluationStudio(ctx context.Context, storage *media.LocalStorage, cfg processing.Config, getenv func(string) string) (func(), error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	client, err := studiocomposition.New(cfg.StudioURL, cfg.StudioSecret)
	if err != nil || client == nil {
		return nil, errors.New("evaluation requires the configured Studio compositor (STUDIO_AGENT_URL and STUDIO_AGENT_SECRET)")
	}
	address := getenv("STORY_EVAL_MEDIA_LISTEN")
	host, rawPort, err := net.SplitHostPort(address)
	ip := net.ParseIP(host)
	port, portErr := strconv.Atoi(rawPort)
	if err != nil || ip == nil || !ip.IsLoopback() || portErr != nil || port < 1 || port > 65535 || len(cfg.MediaSigningSecret) < 32 {
		return nil, errors.New("evaluation requires STORY_EVAL_MEDIA_LISTEN with a fixed loopback port and INTERNAL_API_KEY; point Studio's SNEEPCUT_MEDIA_INTERNAL_ORIGIN at that listener")
	}
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return nil, errors.New("evaluation media listener is unavailable")
	}
	server := &http.Server{ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 30 * time.Second, Handler: evaluationMedia(storage, cfg.MediaSigningSecret)}
	go func() { _ = server.Serve(listener) }()
	stop := func() {
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}
	return stop, nil
}

func evaluationMedia(storage *media.LocalStorage, secret string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || !media.VerifyMediaSignature(secret, r.URL.Path, r.URL.Query().Get("expires"), r.URL.Query().Get("sig"), time.Now()) {
			http.Error(w, "Invalid evaluation media authorization", http.StatusForbidden)
			return
		}
		key := strings.TrimPrefix(r.URL.Path, "/media/")
		file, err := storage.Path(key)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "private, no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		http.ServeFile(w, r, file)
	})
}
