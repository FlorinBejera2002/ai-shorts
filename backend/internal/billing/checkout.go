package billing

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"sneepcut/backend-go/internal/identity"
)

const claimLease = 2 * time.Minute
const checkoutLifetime = 2 * time.Hour
const replayMinimum = 35 * time.Minute
const expiryGrace = 2 * time.Minute

type Error struct {
	Status            int
	Code              string
	RetryAfterSeconds int
}

func (e *Error) Error() string   { return e.Code }
func conflict(code string) error { return &Error{Status: 409, Code: code, RetryAfterSeconds: 2} }
func writeFailure(w http.ResponseWriter, err error) {
	var e *Error
	if errors.As(err, &e) {
		if e.RetryAfterSeconds > 0 {
			w.Header().Set("Retry-After", strconv.Itoa(e.RetryAfterSeconds))
		}
		failure(w, e.Status, e.Code)
	} else {
		failure(w, 502, "billing_provider_unavailable")
	}
}
func checkoutKey(userID string, generation int) string {
	sum := sha256.Sum256([]byte(fmt.Sprintf("sneepcut-checkout-v3\x00%s\x00%d", userID, generation)))
	return hex.EncodeToString(sum[:])
}
func newToken() (string, error) {
	var token [32]byte
	if _, err := rand.Read(token[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(token[:]), nil
}

type claim struct {
	UserID, Token, PlanID, PriceID, Locale, CustomerID, CustomerEmail, SuccessURL, CancelURL, SessionID string
	Generation                                                                                          int
	LeaseExpiresAt, CheckoutExpiresAt, CreatedAt                                                        time.Time
}

const claimColumns = `user_id::text,token,plan_id,price_id,locale,COALESCE(customer_id,''),customer_email,success_url,cancel_url,generation,COALESCE(session_id,''),lease_expires_at,checkout_expires_at,created_at`

func scanClaim(row scanner) (claim, error) {
	var c claim
	err := row.Scan(&c.UserID, &c.Token, &c.PlanID, &c.PriceID, &c.Locale, &c.CustomerID, &c.CustomerEmail, &c.SuccessURL, &c.CancelURL, &c.Generation, &c.SessionID, &c.LeaseExpiresAt, &c.CheckoutExpiresAt, &c.CreatedAt)
	return c, err
}
func (s *Service) loadClaim(ctx context.Context, userID string) (claim, error) {
	return scanClaim(s.db.QueryRowContext(ctx, `SELECT `+claimColumns+` FROM billing_checkout_claims WHERE user_id=$1`, userID))
}
func recoveryState(c claim, now time.Time) string {
	if c.LeaseExpiresAt.After(now) {
		return "leased"
	}
	if !now.Before(c.CheckoutExpiresAt.Add(expiryGrace)) {
		return "expired"
	}
	if c.CheckoutExpiresAt.Sub(now) >= replayMinimum {
		return "replayable"
	}
	return "awaiting-expiry"
}
func matchesClaim(session object, c claim) bool {
	meta := session.child("metadata")
	return session.text("mode") == "subscription" && session.text("client_reference_id") == c.UserID && meta.text("userId") == c.UserID && meta.text("checkoutGeneration") == strconv.Itoa(c.Generation) && meta.text("planId") == c.PlanID && meta.text("priceId") == c.PriceID && (c.CustomerID == "" || session.id("customer") == c.CustomerID)
}
func lockUser(ctx context.Context, tx *sql.Tx, userID string) error {
	var id string
	return tx.QueryRowContext(ctx, `SELECT id::text FROM users WHERE id=$1 FOR UPDATE`, userID).Scan(&id)
}
func pendingInTransaction(ctx context.Context, tx *sql.Tx, userID string) (bool, error) {
	var pending bool
	err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM account_deletion_requests WHERE user_id=$1)`, userID).Scan(&pending)
	return pending, err
}
func (s *Service) newClaim(ctx context.Context, tx *sql.Tx, c claim) (claim, error) {
	now := s.now().UTC()
	token, err := newToken()
	if err != nil {
		return claim{}, err
	}
	c.Token = token
	c.CreatedAt = now
	c.LeaseExpiresAt = now.Add(claimLease)
	c.CheckoutExpiresAt = now.Add(checkoutLifetime)
	c.SessionID = ""
	err = tx.QueryRowContext(ctx, `UPDATE users SET stripe_checkout_generation=stripe_checkout_generation+1 WHERE id=$1 RETURNING stripe_checkout_generation`, c.UserID).Scan(&c.Generation)
	return c, err
}
func claimArgs(c claim) []any {
	return []any{c.UserID, c.Token, c.PlanID, c.PriceID, c.Locale, nullable(c.CustomerID), c.CustomerEmail, c.SuccessURL, c.CancelURL, c.Generation, nullable(c.SessionID), c.LeaseExpiresAt, c.CheckoutExpiresAt, c.CreatedAt}
}
func (s *Service) claimOrLoad(ctx context.Context, snapshot claim) (claim, bool, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return claim{}, false, err
	}
	defer tx.Rollback()
	if err = lockUser(ctx, tx, snapshot.UserID); err != nil {
		return claim{}, false, err
	}
	pending, err := pendingInTransaction(ctx, tx, snapshot.UserID)
	if err != nil {
		return claim{}, false, err
	}
	if pending {
		return claim{}, false, conflict("account_deletion_in_progress")
	}
	c, err := scanClaim(tx.QueryRowContext(ctx, `SELECT `+claimColumns+` FROM billing_checkout_claims WHERE user_id=$1 FOR UPDATE`, snapshot.UserID))
	if errors.Is(err, sql.ErrNoRows) {
		c, err = s.newClaim(ctx, tx, snapshot)
		if err != nil {
			return claim{}, false, err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO billing_checkout_claims(user_id,token,plan_id,price_id,locale,customer_id,customer_email,success_url,cancel_url,generation,session_id,lease_expires_at,checkout_expires_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, claimArgs(c)...)
		if err != nil {
			return claim{}, false, err
		}
		return c, true, tx.Commit()
	}
	if err != nil {
		return claim{}, false, err
	}
	if c.SessionID != "" || recoveryState(c, s.now()) == "leased" {
		return c, false, tx.Commit()
	}
	state := recoveryState(c, s.now())
	token, err := newToken()
	if err != nil {
		return claim{}, false, err
	}
	c.Token = token
	c.LeaseExpiresAt = s.now().Add(claimLease)
	_, err = tx.ExecContext(ctx, `UPDATE billing_checkout_claims SET token=$2,lease_expires_at=$3,updated_at=now() WHERE user_id=$1`, c.UserID, c.Token, c.LeaseExpiresAt)
	if err != nil {
		return claim{}, false, err
	}
	if err = tx.Commit(); err != nil {
		return claim{}, false, err
	}
	if state == "replayable" {
		return c, true, nil
	}
	session, err := s.findProviderCheckout(ctx, c)
	if err != nil {
		return claim{}, false, err
	}
	if session != nil {
		if !matchesClaim(session, c) {
			return claim{}, false, conflict("billing_state_invalid")
		}
		if err = s.persistSession(ctx, c, session.text("id")); err != nil {
			return claim{}, false, err
		}
		c.SessionID = session.text("id")
		return c, false, nil
	}
	if state == "expired" {
		next, err := s.rotateClaim(ctx, c, snapshot)
		return next, err == nil, err
	}
	return c, false, nil
}
func (s *Service) rotateClaim(ctx context.Context, previous, snapshot claim) (claim, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return claim{}, err
	}
	defer tx.Rollback()
	if err = lockUser(ctx, tx, previous.UserID); err != nil {
		return claim{}, err
	}
	pending, err := pendingInTransaction(ctx, tx, previous.UserID)
	if err != nil {
		return claim{}, err
	}
	if pending {
		return claim{}, conflict("account_deletion_in_progress")
	}
	current, err := scanClaim(tx.QueryRowContext(ctx, `SELECT `+claimColumns+` FROM billing_checkout_claims WHERE user_id=$1 FOR UPDATE`, previous.UserID))
	if err != nil {
		return claim{}, err
	}
	if current.Token != previous.Token || current.Generation != previous.Generation || current.SessionID != previous.SessionID {
		return claim{}, conflict("checkout_in_progress")
	}
	next, err := s.newClaim(ctx, tx, snapshot)
	if err != nil {
		return claim{}, err
	}
	_, err = tx.ExecContext(ctx, `UPDATE billing_checkout_claims SET token=$2,plan_id=$3,price_id=$4,locale=$5,customer_id=$6,customer_email=$7,success_url=$8,cancel_url=$9,generation=$10,session_id=$11,lease_expires_at=$12,checkout_expires_at=$13,created_at=$14,updated_at=now() WHERE user_id=$1`, claimArgs(next)...)
	if err != nil {
		return claim{}, err
	}
	return next, tx.Commit()
}
func (s *Service) persistSession(ctx context.Context, c claim, id string) error {
	if id == "" {
		return errors.New("provider session has no identifier")
	}
	result, err := s.db.ExecContext(ctx, `UPDATE billing_checkout_claims SET session_id=$4,updated_at=now() WHERE user_id=$1 AND token=$2 AND generation=$3 AND session_id IS NULL`, c.UserID, c.Token, c.Generation, id)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n != 1 {
		return conflict("checkout_in_progress")
	}
	return nil
}
func (s *Service) releaseClaim(ctx context.Context, c claim) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM billing_checkout_claims WHERE user_id=$1 AND token=$2 AND generation=$3 AND COALESCE(session_id,'')=$4`, c.UserID, c.Token, c.Generation, c.SessionID)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n != 1 {
		return conflict("checkout_in_progress")
	}
	return nil
}
func (s *Service) abandonClaim(ctx context.Context, c claim) error {
	if c.SessionID == "" {
		return conflict("checkout_in_progress")
	}
	session, err := s.session(ctx, c.SessionID)
	if err != nil {
		return err
	}
	if !matchesClaim(session, c) {
		return conflict("billing_state_invalid")
	}
	if session.text("status") == "complete" {
		return conflict("checkout_processing")
	}
	if session.text("status") == "open" {
		if err = s.expire(ctx, c.SessionID); err != nil {
			return err
		}
	}
	return s.releaseClaim(ctx, c)
}
func (s *Service) checkout(w http.ResponseWriter, r *http.Request) {
	var input struct {
		PlanID string `json:"planId"`
		Locale string `json:"locale"`
	}
	if !readJSON(w, r, &input) {
		return
	}
	if !paid(input.PlanID) || (input.Locale != "en" && input.Locale != "ro") {
		failure(w, 400, "invalid_checkout_payload")
		return
	}
	result, err := s.startCheckout(r.Context(), identity.Current(r).User.ID, input.PlanID, input.Locale)
	if err != nil {
		writeFailure(w, err)
		return
	}
	write(w, 200, result)
}
func (s *Service) startCheckout(ctx context.Context, userID, plan, locale string) (object, error) {
	a, err := s.account(ctx, userID)
	if err != nil {
		return nil, err
	}
	pending, err := s.deletionPending(ctx, userID)
	if err != nil {
		return nil, err
	}
	if pending {
		return nil, conflict("account_deletion_in_progress")
	}
	if a.SubscriptionID != "" && !terminal(a.SubscriptionStatus) {
		if a.CustomerID == "" {
			return nil, conflict("billing_state_invalid")
		}
		link, e := s.portal(ctx, a.CustomerID, locale)
		return object{"url": link, "kind": "portal"}, e
	}
	if a.CustomerID != "" {
		subscriptions, e := s.subscriptions(ctx, a.CustomerID)
		if e != nil {
			return nil, e
		}
		for _, sub := range subscriptions {
			if !terminal(sub.text("status")) {
				link, e := s.portal(ctx, a.CustomerID, locale)
				return object{"url": link, "kind": "portal"}, e
			}
		}
	}
	rank := map[string]int{"free": 0, "creator": 1, "pro": 2, "agency": 3}
	current := normalizePlan(a.Plan)
	if terminal(a.SubscriptionStatus) {
		current = "free"
	}
	if rank[plan] <= rank[current] {
		return nil, conflict("plan_change_requires_portal")
	}
	price, _, err := s.price(ctx, plan)
	if err != nil {
		return nil, err
	}
	snapshot := claim{UserID: userID, PlanID: plan, PriceID: price, Locale: locale, CustomerID: a.CustomerID, CustomerEmail: a.Email, SuccessURL: s.cfg.AppURL + billingPath(locale) + "?checkout_session_id={CHECKOUT_SESSION_ID}", CancelURL: s.cfg.AppURL + billingPath(locale) + "?canceled=true"}
	c, owned, err := s.claimOrLoad(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	if !owned {
		if c.SessionID == "" {
			return nil, conflict("checkout_in_progress")
		}
		session, e := s.session(ctx, c.SessionID)
		if e != nil {
			return nil, e
		}
		if !matchesClaim(session, c) {
			return nil, conflict("billing_state_invalid")
		}
		switch session.text("status") {
		case "complete":
			return nil, conflict("checkout_processing")
		case "open":
			if c.PlanID == plan && safeURL(session.text("url")) != "" {
				pending, e := s.deletionPending(ctx, userID)
				if e != nil {
					return nil, e
				}
				if pending {
					_ = s.abandonClaim(ctx, c)
					return nil, conflict("account_deletion_in_progress")
				}
				return object{"url": session.text("url"), "kind": "checkout"}, nil
			}
			if err = s.expire(ctx, c.SessionID); err != nil {
				return nil, err
			}
		case "expired":
		default:
			return nil, conflict("billing_state_invalid")
		}
		c, err = s.rotateClaim(ctx, c, snapshot)
		if err != nil {
			return nil, err
		}
	}
	for attempt := 0; attempt < 2; attempt++ {
		pending, err = s.deletionPending(ctx, userID)
		if err != nil {
			return nil, err
		}
		if pending {
			_ = s.abandonClaim(ctx, c)
			return nil, conflict("account_deletion_in_progress")
		}
		if c.CheckoutExpiresAt.Sub(s.now()) < replayMinimum {
			return nil, conflict("checkout_in_progress")
		}
		if !paid(c.PlanID) || (c.Locale != "en" && c.Locale != "ro") {
			return nil, conflict("billing_state_invalid")
		}
		session, e := s.createProviderCheckout(ctx, c)
		if e != nil {
			return nil, e
		}
		if !matchesClaim(session, c) {
			return nil, conflict("billing_state_invalid")
		}
		if e = s.persistSession(ctx, c, session.text("id")); e != nil {
			current, loadErr := s.loadClaim(ctx, userID)
			if loadErr == nil && (current.Generation == c.Generation || current.SessionID == session.text("id")) {
				return nil, e
			}
			if (loadErr == nil || errors.Is(loadErr, sql.ErrNoRows)) && session.text("status") == "open" {
				_ = s.expire(ctx, session.text("id"))
			}
			return nil, e
		}
		c.SessionID = session.text("id")
		if session.text("status") == "complete" {
			return nil, conflict("checkout_processing")
		}
		if session.text("status") == "expired" || (session.text("status") == "open" && c.PlanID != plan) {
			if session.text("status") == "open" {
				if e = s.expire(ctx, c.SessionID); e != nil {
					return nil, e
				}
			}
			c, err = s.rotateClaim(ctx, c, snapshot)
			if err != nil {
				return nil, err
			}
			continue
		}
		if session.text("status") != "open" || safeURL(session.text("url")) == "" {
			return nil, conflict("billing_state_invalid")
		}
		pending, err = s.deletionPending(ctx, userID)
		if err != nil {
			return nil, err
		}
		if pending {
			_ = s.abandonClaim(ctx, c)
			return nil, conflict("account_deletion_in_progress")
		}
		return object{"url": session.text("url"), "kind": "checkout"}, nil
	}
	return nil, conflict("checkout_in_progress")
}
