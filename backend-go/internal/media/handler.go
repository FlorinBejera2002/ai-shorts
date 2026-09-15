package media

import (
	"encoding/json"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/identity"
)

type Authentication interface {
	Require(http.HandlerFunc) http.Handler
	RequireMember(http.HandlerFunc) http.Handler
}
type Handler struct {
	service *Service
	auth    Authentication
}

func NewHandler(service *Service, auth Authentication) *Handler {
	return &Handler{service: service, auth: auth}
}
func (h *Handler) Register(router *httprouter.Router) {
	router.HandlerFunc(http.MethodGet, "/api/media/verify", h.verify)
	router.HandlerFunc(http.MethodGet, "/api/media/verify-request", h.verifyRequest)
	router.Handler(http.MethodPost, "/api/upload/authorize", h.auth.RequireMember(h.authorize))
	router.Handler(http.MethodPost, "/api/upload", h.auth.RequireMember(h.uploadMultipart))
	router.Handler(http.MethodPost, "/api/publishing/media", h.auth.RequireMember(h.uploadPublishingMedia))
	// Direct bodies use purpose-bound single-use upload credentials, not an
	// access token. Global origin policy is applied by the public router.
	router.HandlerFunc(http.MethodPut, "/api/upload/direct", h.uploadDirect)
	for _, route := range []string{"/api/brand/logo", "/api/user/brand/logo"} {
		router.Handler(http.MethodGet, route, h.auth.Require(h.getLogo))
		router.Handler(http.MethodPost, route, h.auth.RequireMember(h.uploadLogo))
		router.Handler(http.MethodDelete, route, h.auth.RequireMember(h.deleteLogo))
	}
}

func (h *Handler) uploadPublishingMedia(w http.ResponseWriter, r *http.Request) {
	user := identity.Current(r).User
	if e := h.service.allow(r.Context(), user.ID, "publishing-upload", 60); e != nil {
		mediaError(w, e)
		return
	}
	part, e := firstFile(w, r, h.service.cfg.MaxUploadBytes)
	if e != nil {
		mediaError(w, e)
		return
	}
	defer part.Close()
	contentType := part.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	result, e := h.service.StorePublishingMedia(r.Context(), user.ID, UploadIntent{FileName: part.FileName(), FileSize: 1, ContentType: contentType}, part)
	if e != nil {
		mediaError(w, e)
		return
	}
	kind := "video"
	if strings.HasPrefix(contentType, "image/") {
		kind = "image"
	}
	writeMedia(w, 201, map[string]any{"reference": result.FilePath, "name": part.FileName(), "type": kind, "size": result.FileSize})
}
func writeMedia(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	if status != 204 {
		_ = json.NewEncoder(w).Encode(body)
	}
}
func mediaError(w http.ResponseWriter, err error) {
	status, message := statusFor(err)
	if status == 429 {
		w.Header().Set("Retry-After", "3600")
	}
	writeMedia(w, status, map[string]string{"error": message, "detail": message})
}
func (h *Handler) verify(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if len(q["path"]) != 1 || len(q["expires"]) != 1 || len(q["sig"]) != 1 || !VerifyMediaSignature(h.service.cfg.SigningSecret, q.Get("path"), q.Get("expires"), q.Get("sig"), h.service.now()) {
		mediaError(w, failure(403, "Invalid or expired URL"))
		return
	}
	writeMedia(w, 200, map[string]bool{"valid": true})
}
func (h *Handler) verifyRequest(w http.ResponseWriter, r *http.Request) {
	original := r.Header.Get("X-Original-URI")
	parsed, e := url.ParseRequestURI(original)
	if e != nil || original == "" || len(original) > 4096 || parsed.IsAbs() || parsed.Host != "" {
		mediaError(w, failure(403, "Invalid or expired URL"))
		return
	}
	q, e := url.ParseQuery(parsed.RawQuery)
	if e != nil || len(q["expires"]) != 1 || len(q["sig"]) != 1 || !VerifyMediaSignature(h.service.cfg.SigningSecret, parsed.EscapedPath(), q.Get("expires"), q.Get("sig"), h.service.now()) {
		mediaError(w, failure(403, "Invalid or expired URL"))
		return
	}
	writeMedia(w, 204, nil)
}
func (h *Handler) authorize(w http.ResponseWriter, r *http.Request) {
	user := identity.Current(r).User
	if e := h.service.allow(r.Context(), user.ID, "authorize", 24); e != nil {
		mediaError(w, e)
		return
	}
	contentType, _, e := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if e != nil || contentType != "application/json" {
		mediaError(w, failure(415, "Content-Type must be application/json"))
		return
	}
	var intent UploadIntent
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192))
	dec.DisallowUnknownFields()
	if e := dec.Decode(&intent); e != nil {
		mediaError(w, failure(400, "Request body must be valid JSON"))
		return
	}
	if e := dec.Decode(&struct{}{}); e != io.EOF {
		mediaError(w, failure(400, "Request body must contain one object"))
		return
	}
	if e = intent.Validate(h.service.cfg.MaxUploadBytes); e != nil {
		mediaError(w, failure(400, e.Error()))
		return
	}
	if e = h.service.accountActive(r.Context(), user.ID, true); e != nil {
		mediaError(w, e)
		return
	}
	token, e := SignUploadIntent(h.service.cfg.UploadSecret, user.ID, intent, h.service.now())
	if e != nil {
		mediaError(w, failure(503, "Direct upload is temporarily unavailable"))
		return
	}
	writeMedia(w, 200, map[string]any{"uploadUrl": h.service.cfg.DirectUploadURL, "token": token})
}
func (h *Handler) uploadDirect(w http.ResponseWriter, r *http.Request) {
	scheme, token, ok := strings.Cut(r.Header.Get("Authorization"), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		mediaError(w, failure(401, "Invalid upload authorization"))
		return
	}
	claims, e := VerifyUploadToken(h.service.cfg.UploadSecret, token, h.service.cfg.MaxUploadBytes, h.service.now())
	if e != nil {
		mediaError(w, failure(401, "Invalid upload authorization"))
		return
	}
	if e = h.service.accountActive(r.Context(), claims.UserID, true); e != nil {
		mediaError(w, e)
		return
	}
	if e = h.service.allow(r.Context(), claims.UserID, "upload", 12); e != nil {
		mediaError(w, e)
		return
	}
	if r.ContentLength < 0 {
		mediaError(w, failure(400, "Content-Length is required"))
		return
	}
	if r.ContentLength != claims.FileSize {
		mediaError(w, failure(400, "Upload size does not match authorization"))
		return
	}
	contentType, _, e := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if e != nil || contentType != claims.ContentType {
		mediaError(w, failure(400, "Upload content type does not match authorization"))
		return
	}
	consumed, e := h.service.nonce.Consume(r.Context(), claims.Nonce, claims.UserID, time.Duration(claims.ExpiresAt-h.service.now().Unix())*time.Second)
	if e != nil {
		mediaError(w, failure(503, "Upload authorization is temporarily unavailable"))
		return
	}
	if !consumed {
		mediaError(w, failure(401, "Upload authorization was already used"))
		return
	}
	result, e := h.service.storeVideo(r.Context(), claims.UserID, claims.UploadIntent, http.MaxBytesReader(w, r.Body, claims.FileSize+1), claims.FileSize)
	if e != nil {
		mediaError(w, e)
		return
	}
	writeMedia(w, 201, result)
}
func firstFile(w http.ResponseWriter, r *http.Request, maximum int64) (*multipart.Part, error) {
	if r.ContentLength > maximum+1024*1024 {
		return nil, failure(413, "File too large")
	}
	r.Body = http.MaxBytesReader(w, r.Body, maximum+1024*1024)
	reader, e := r.MultipartReader()
	if e != nil {
		return nil, failure(400, "A file is required")
	}
	// A single file field is the existing browser contract. Do not parse/spool
	// arbitrary multipart fields before authentication or into unbounded memory.
	part, e := reader.NextPart()
	if e != nil || part.FormName() != "file" || part.FileName() == "" {
		return nil, failure(400, "A file is required")
	}
	return part, nil
}
func (h *Handler) uploadMultipart(w http.ResponseWriter, r *http.Request) {
	user := identity.Current(r).User
	if e := h.service.allow(r.Context(), user.ID, "upload", 12); e != nil {
		mediaError(w, e)
		return
	}
	if r.ContentLength < 0 {
		mediaError(w, failure(411, "Content-Length is required"))
		return
	}
	part, e := firstFile(w, r, h.service.cfg.MaxUploadBytes)
	if e != nil {
		mediaError(w, e)
		return
	}
	defer part.Close()
	intent := UploadIntent{FileName: part.FileName(), FileSize: 1, ContentType: part.Header.Get("Content-Type")}
	if intent.ContentType == "" {
		intent.ContentType = "application/octet-stream"
	}
	if e = intent.Validate(h.service.cfg.MaxUploadBytes); e != nil {
		mediaError(w, failure(400, e.Error()))
		return
	}
	result, e := h.service.storeVideo(r.Context(), user.ID, intent, part, 0)
	if e != nil {
		mediaError(w, e)
		return
	}
	writeMedia(w, 201, result)
}
