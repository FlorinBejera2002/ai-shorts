package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
)

func JSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	data, err := json.Marshal(value)
	if err != nil {
		http.Error(w, "Response encoding failed", 500)
		return
	}
	w.WriteHeader(status)
	_, _ = w.Write(append(data, '\n'))
}
func Error(w http.ResponseWriter, status int, message string) {
	JSON(w, status, map[string]any{"error": message, "detail": message})
}
func Read(w http.ResponseWriter, r *http.Request, value any, limit int64) bool {
	contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || contentType != "application/json" {
		Error(w, 415, "Content-Type must be application/json")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		var max *http.MaxBytesError
		if errors.As(err, &max) {
			Error(w, 413, "Request body is too large")
		} else {
			Error(w, 400, "Request body must contain a valid JSON object")
		}
		return false
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		Error(w, 400, "Request body must contain one JSON object")
		return false
	}
	return true
}
