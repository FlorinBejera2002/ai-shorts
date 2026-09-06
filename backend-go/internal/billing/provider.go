package billing

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// Object accepts Stripe's expandable identifiers and both legacy/current invoice shapes.
type object map[string]any

func (o object) text(key string) string { value, _ := o[key].(string); return value }
func (o object) child(key string) object {
	switch value := o[key].(type) {
	case map[string]any:
		return object(value)
	case object:
		return value
	}
	return object{}
}
func (o object) number(key string) int64 {
	switch v := o[key].(type) {
	case json.Number:
		n, _ := v.Int64()
		return n
	case float64:
		return int64(v)
	case int64:
		return v
	case int:
		return int64(v)
	}
	return 0
}
func (o object) boolean(key string) bool { v, _ := o[key].(bool); return v }
func (o object) list(key string) []object {
	out := []object{}
	if values, ok := o[key].([]any); ok {
		for _, v := range values {
			if item, ok := v.(map[string]any); ok {
				out = append(out, object(item))
			}
		}
	}
	return out
}
func (o object) id(key string) string {
	if value := o.text(key); value != "" {
		return value
	}
	return o.child(key).text("id")
}
func decodeObject(body []byte) (object, error) {
	out := object{}
	d := json.NewDecoder(bytes.NewReader(body))
	d.UseNumber()
	err := d.Decode(&out)
	return out, err
}

type providerError struct {
	Status int
	Code   string
}

func (e *providerError) Error() string { return "billing provider request failed" }
func missingResource(err error) bool {
	var provider *providerError
	return errors.As(err, &provider) && provider.Status == 404 && provider.Code == "resource_missing"
}

func (s *Service) provider(ctx context.Context, method, path string, form url.Values, key string) (object, error) {
	if s.cfg.SecretKey == "" {
		return nil, errors.New("billing provider is not configured")
	}
	endpoint := s.cfg.APIBaseURL + path
	var body io.Reader
	if method == http.MethodGet && len(form) > 0 {
		endpoint += "?" + form.Encode()
	} else if form != nil {
		body = strings.NewReader(form.Encode())
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth(s.cfg.SecretKey, "")
	req.Header.Set("Stripe-Version", "2026-06-24.dahlia")
	if form != nil && method != http.MethodGet {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	if key != "" {
		req.Header.Set("Idempotency-Key", key)
	}
	response, err := s.client.Do(req)
	if err != nil {
		return nil, errors.New("billing provider is unavailable")
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 4*1024*1024+1))
	if err != nil || len(raw) > 4*1024*1024 {
		return nil, errors.New("invalid billing provider response")
	}
	result, err := decodeObject(raw)
	if err != nil {
		return nil, errors.New("invalid billing provider response")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, &providerError{Status: response.StatusCode, Code: result.child("error").text("code")}
	}
	return result, nil
}

func (s *Service) listProvider(ctx context.Context, path string, query url.Values) ([]object, error) {
	if query == nil {
		query = url.Values{}
	}
	query.Set("limit", "100")
	results := []object{}
	last := ""
	for page := 0; page < 1000; page++ {
		data, err := s.provider(ctx, http.MethodGet, path, query, "")
		if err != nil {
			return nil, err
		}
		rows := data.list("data")
		results = append(results, rows...)
		if !data.boolean("has_more") {
			return results, nil
		}
		if len(rows) == 0 {
			return nil, errors.New("incomplete provider listing")
		}
		next := rows[len(rows)-1].text("id")
		if next == "" || next == last {
			return nil, errors.New("invalid provider pagination")
		}
		last = next
		query.Set("starting_after", next)
	}
	return nil, errors.New("provider listing exceeded limit")
}
func (s *Service) subscriptions(ctx context.Context, customer string) ([]object, error) {
	return s.listProvider(ctx, "/subscriptions", url.Values{"customer": {customer}, "status": {"all"}})
}
func (s *Service) session(ctx context.Context, id string) (object, error) {
	return s.provider(ctx, http.MethodGet, "/checkout/sessions/"+url.PathEscape(id), nil, "")
}
func (s *Service) expire(ctx context.Context, id string) error {
	_, err := s.provider(ctx, http.MethodPost, "/checkout/sessions/"+url.PathEscape(id)+"/expire", url.Values{}, "")
	return err
}
func (s *Service) portal(ctx context.Context, customer, locale string) (string, error) {
	response, err := s.provider(ctx, http.MethodPost, "/billing_portal/sessions", url.Values{"customer": {customer}, "return_url": {s.cfg.AppURL + billingPath(locale)}}, "")
	if err != nil {
		return "", err
	}
	result := safeURL(response.text("url"))
	if result == "" {
		return "", errors.New("invalid portal URL")
	}
	return result, nil
}
func (s *Service) createProviderCheckout(ctx context.Context, c claim) (object, error) {
	meta := map[string]string{"userId": c.UserID, "planId": c.PlanID, "priceId": c.PriceID, "locale": c.Locale, "checkoutGeneration": strconv.Itoa(c.Generation)}
	form := url.Values{"mode": {"subscription"}, "line_items[0][price]": {c.PriceID}, "line_items[0][quantity]": {"1"}, "success_url": {c.SuccessURL}, "cancel_url": {c.CancelURL}, "client_reference_id": {c.UserID}, "expires_at": {strconv.FormatInt(c.CheckoutExpiresAt.Unix(), 10)}}
	for key, value := range meta {
		form.Set("metadata["+key+"]", value)
		form.Set("subscription_data[metadata]["+key+"]", value)
	}
	if c.CustomerID != "" {
		form.Set("customer", c.CustomerID)
	} else {
		form.Set("customer_email", c.CustomerEmail)
	}
	return s.provider(ctx, http.MethodPost, "/checkout/sessions", form, checkoutKey(c.UserID, c.Generation))
}
func (s *Service) findProviderCheckout(ctx context.Context, c claim) (object, error) {
	query := url.Values{"created[gte]": {strconv.FormatInt(max(0, c.CreatedAt.Unix()-300), 10)}, "created[lte]": {strconv.FormatInt(c.CheckoutExpiresAt.Unix()+300, 10)}}
	if c.CustomerID != "" {
		query.Set("customer", c.CustomerID)
	}
	sessions, err := s.listProvider(ctx, "/checkout/sessions", query)
	if err != nil {
		return nil, err
	}
	var match object
	for _, session := range sessions {
		if session.text("mode") != "subscription" || session.text("client_reference_id") != c.UserID || session.child("metadata").text("userId") != c.UserID || session.child("metadata").text("checkoutGeneration") != strconv.Itoa(c.Generation) {
			continue
		}
		if match != nil && match.text("id") != session.text("id") {
			return nil, errors.New("multiple checkouts for a generation")
		}
		match = session
	}
	return match, nil
}
func (s *Service) price(ctx context.Context, plan string) (string, object, error) {
	id := s.cfg.PlanPrices[plan]
	if id == "" || s.planForPrice(id) != plan {
		return "", nil, errors.New("billing plan is not configured")
	}
	data, err := s.provider(ctx, http.MethodGet, "/prices/"+url.PathEscape(id), nil, "")
	if err != nil {
		return "", nil, err
	}
	amount, hasAmount := data["unit_amount"].(json.Number)
	amountValue, amountErr := amount.Int64()
	recurring := data.child("recurring")
	currency := strings.ToUpper(data.text("currency"))
	if data.text("id") != id || !data.boolean("active") || data.text("type") != "recurring" || recurring.text("interval") != "month" || recurring.number("interval_count") != 1 || !hasAmount || amountErr != nil || amountValue < 0 || !currencyPattern.MatchString(currency) {
		return "", nil, fmt.Errorf("invalid billing price")
	}
	return id, object{"amount": amountValue, "currency": currency}, nil
}
