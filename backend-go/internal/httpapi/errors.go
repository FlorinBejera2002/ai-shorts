package httpapi

import (
	"fmt"
	"net/http"

	"sneepcut/backend-go/internal/jsonutil"
)

func (app *application) errorResponse(w http.ResponseWriter, status int, message string) {
	if err := jsonutil.Write(w, status, jsonutil.Envelope{"error": message}, nil); err != nil {
		app.logger.Error("writing HTTP error response", "error", err)
	}
}

func (app *application) notFoundResponse(w http.ResponseWriter, _ *http.Request) {
	app.errorResponse(w, http.StatusNotFound, "the requested resource could not be found")
}

func (app *application) methodNotAllowedResponse(w http.ResponseWriter, r *http.Request) {
	app.errorResponse(w, http.StatusMethodNotAllowed, fmt.Sprintf("the %s method is not supported for this resource", r.Method))
}
