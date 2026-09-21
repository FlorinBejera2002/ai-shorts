package email

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/mail"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	"sneepcut/backend-go/internal/identity"
)

type Config struct {
	From, ResendKey, SMTPHost, SMTPUsername, SMTPPassword string
	SMTPPort                                              int
	SMTPRequireTLS                                        bool
}
type Delivery struct {
	config   Config
	client   *http.Client
	endpoint string
}

func New(cfg Config) (identity.Mailer, error) {
	if cfg.ResendKey == "" && cfg.SMTPHost == "" {
		return nil, nil
	}
	if _, err := mail.ParseAddress(cfg.From); err != nil {
		return nil, errors.New("AUTH_EMAIL_FROM must be a valid mail address")
	}
	if cfg.SMTPPort == 0 {
		cfg.SMTPPort = 587
	}
	return &Delivery{config: cfg, client: &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, endpoint: "https://api.resend.com/emails"}, nil
}

func (d *Delivery) Send(ctx context.Context, message identity.Mail) error {
	if _, err := mail.ParseAddress(message.To); err != nil {
		return errors.New("invalid recipient")
	}
	if strings.ContainsAny(message.Subject+message.To+d.config.From, "\r\n") {
		return errors.New("invalid mail headers")
	}
	if d.config.ResendKey != "" {
		return d.resend(ctx, message)
	}
	return d.smtp(ctx, message)
}
func (d *Delivery) resend(ctx context.Context, m identity.Mail) error {
	body, err := json.Marshal(map[string]any{"from": d.config.From, "to": []string{m.To}, "subject": m.Subject, "text": m.Text})
	if err != nil {
		return err
	}
	r, err := http.NewRequestWithContext(ctx, http.MethodPost, d.endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	r.Header.Set("Authorization", "Bearer "+d.config.ResendKey)
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Idempotency-Key", m.Key)
	response, err := d.client.Do(r)
	if err != nil {
		return errors.New("email delivery unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return errors.New("email delivery rejected")
	}
	var result struct {
		ID string `json:"id"`
	}
	const limit = 64 * 1024
	raw, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil || len(raw) > limit || json.Unmarshal(raw, &result) != nil || result.ID == "" {
		return errors.New("email delivery not acknowledged")
	}
	return nil
}
func (d *Delivery) smtp(ctx context.Context, m identity.Mail) error {
	address := net.JoinHostPort(d.config.SMTPHost, strconv.Itoa(d.config.SMTPPort))
	connection, err := (&net.Dialer{Timeout: 10 * time.Second}).DialContext(ctx, "tcp", address)
	if err != nil {
		return errors.New("mail server unavailable")
	}
	defer connection.Close()
	stopCancellation := context.AfterFunc(ctx, func() { _ = connection.Close() })
	defer stopCancellation()
	deadline := time.Now().Add(10 * time.Second)
	if contextDeadline, ok := ctx.Deadline(); ok && contextDeadline.Before(deadline) {
		deadline = contextDeadline
	}
	_ = connection.SetDeadline(deadline)
	client, err := smtp.NewClient(connection, d.config.SMTPHost)
	if err != nil {
		return errors.New("mail server handshake failed")
	}
	defer client.Close()
	if ok, _ := client.Extension("STARTTLS"); ok {
		if err = client.StartTLS(&tls.Config{ServerName: d.config.SMTPHost, MinVersion: tls.VersionTLS12}); err != nil {
			return errors.New("mail server TLS failed")
		}
	} else if d.config.SMTPRequireTLS {
		return errors.New("mail server requires TLS")
	}
	if d.config.SMTPUsername != "" {
		if err = client.Auth(smtp.PlainAuth("", d.config.SMTPUsername, d.config.SMTPPassword, d.config.SMTPHost)); err != nil {
			return errors.New("mail server authentication failed")
		}
	}
	from, _ := mail.ParseAddress(d.config.From)
	if err = client.Mail(from.Address); err != nil {
		return errors.New("mail sender rejected")
	}
	to, _ := mail.ParseAddress(m.To)
	if err = client.Rcpt(to.Address); err != nil {
		return errors.New("mail recipient rejected")
	}
	writer, err := client.Data()
	if err != nil {
		return errors.New("mail delivery failed")
	}
	_, err = fmt.Fprintf(writer, "From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n%s\r\n", d.config.From, m.To, m.Subject, strings.ReplaceAll(strings.ReplaceAll(m.Text, "\r\n", "\n"), "\n", "\r\n"))
	if err != nil {
		return errors.New("mail body delivery failed")
	}
	if err = writer.Close(); err != nil {
		return errors.New("mail delivery not acknowledged")
	}
	if err = client.Quit(); err != nil {
		return errors.New("mail server close failed")
	}
	return nil
}
