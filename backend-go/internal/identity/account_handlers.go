package identity

import (
	"errors"
	"mime"
	"net/http"
	"time"

	"github.com/julienschmidt/httprouter"
	"sneepcut/backend-go/internal/jsonutil"
)

func (h *Handler) registerAccounts(router *httprouter.Router) {
	if h.accounts == nil {
		return
	}
	for _, prefix := range []string{"/v1/auth", "/api/auth"} {
		router.Handler(http.MethodPost, prefix+"/register", h.originPolicy(h.Limit(h.registerAccount, "register", 10, time.Hour)))
		router.Handler(http.MethodPost, prefix+"/forgot-password", h.originPolicy(h.Limit(h.forgotPassword, "forgot-password", 5, time.Hour)))
		router.Handler(http.MethodPost, prefix+"/reset-password", h.originPolicy(h.Limit(h.resetPassword, "reset-password", 10, time.Hour)))
	}
	router.Handler(http.MethodPost, "/v1/auth/resend-activation", h.originPolicy(h.Limit(h.resendActivation, "activation", 5, time.Hour)))
	router.Handler(http.MethodPost, "/v1/auth/activate", h.originPolicy(h.Limit(h.activate, "activate", 10, time.Hour)))
	router.Handler(http.MethodPost, "/api/user/password", h.Require(h.Limit(h.changePassword, "password", 8, time.Hour)))
}

func (h *Handler) readAccount(w http.ResponseWriter, r *http.Request, value any) bool {
	contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || contentType != "application/json" {
		h.writeError(w, 415, "Content-Type must be application/json")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
	if err := jsonutil.Read(w, r, value); err != nil {
		h.writeError(w, 400, err.Error())
		return false
	}
	return true
}
func (h *Handler) accountError(w http.ResponseWriter, err error) {
	var invalid *AccountError
	if errors.As(err, &invalid) {
		h.writeError(w, invalid.Status, invalid.Message)
		return
	}
	h.authError(w, err)
}
func (h *Handler) registerAccount(w http.ResponseWriter, r *http.Request) {
	var input Registration
	if !h.readAccount(w, r, &input) {
		return
	}
	user, err := h.accounts.Register(r.Context(), input)
	if err != nil {
		h.accountError(w, err)
		return
	}
	// Registration is durable even when delivery fails; resend can recover it.
	if h.accounts.mailer != nil {
		err = h.accounts.RequestToken(r.Context(), user.Email, "email-activation")
		if err != nil {
			h.logger.Error("registration verification could not be requested")
		}
	}
	h.write(w, 201, jsonutil.Envelope{"user": user, "verificationRequired": user.ActivationRequired})
}
func (h *Handler) requestAccountToken(w http.ResponseWriter, r *http.Request, kind string) {
	var input struct {
		Email string `json:"email"`
	}
	if !h.readAccount(w, r, &input) {
		return
	}
	if err := h.accounts.RequestToken(r.Context(), input.Email, kind); err != nil {
		h.accountError(w, err)
		return
	}
	h.write(w, 200, jsonutil.Envelope{"sent": true})
}
func (h *Handler) forgotPassword(w http.ResponseWriter, r *http.Request) {
	h.requestAccountToken(w, r, "password-reset")
}
func (h *Handler) resendActivation(w http.ResponseWriter, r *http.Request) {
	h.requestAccountToken(w, r, "email-activation")
}
func (h *Handler) resetPassword(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email    string `json:"email"`
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if !h.readAccount(w, r, &input) {
		return
	}
	if err := h.accounts.ConsumeToken(r.Context(), input.Email, input.Token, input.Password, "password-reset"); err != nil {
		h.accountError(w, err)
		return
	}
	h.clearRefreshCookie(w)
	h.write(w, 200, jsonutil.Envelope{"reset": true})
}
func (h *Handler) activate(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email string `json:"email"`
		Token string `json:"token"`
	}
	if !h.readAccount(w, r, &input) {
		return
	}
	if err := h.accounts.ConsumeToken(r.Context(), input.Email, input.Token, "", "email-activation"); err != nil {
		h.accountError(w, err)
		return
	}
	h.write(w, 200, jsonutil.Envelope{"activated": true})
}
func (h *Handler) changePassword(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Current      string `json:"currentPassword"`
		Password     string `json:"newPassword"`
		Confirmation string `json:"confirmPassword"`
	}
	if !h.readAccount(w, r, &input) {
		return
	}
	if err := h.accounts.ChangePassword(r.Context(), Current(r).User, input.Current, input.Password, input.Confirmation); err != nil {
		h.accountError(w, err)
		return
	}
	h.clearRefreshCookie(w)
	h.write(w, 200, jsonutil.Envelope{"changed": true, "signInRequired": true})
}
