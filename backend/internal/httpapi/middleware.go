package httpapi

import "net/http"

func (app *application) recoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				// Preserve net/http's explicit request-abort behavior for streaming.
				if recovered == http.ErrAbortHandler {
					panic(recovered)
				}
				app.logger.Error("HTTP handler panic", "panic", recovered, "method", r.Method, "path", r.URL.Path)
				w.Header().Set("Connection", "close")
				app.errorResponse(w, http.StatusInternalServerError, "the server encountered a problem and could not process your request")
			}
		}()
		next.ServeHTTP(w, r)
	})
}
