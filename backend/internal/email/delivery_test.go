package email

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	"sneepcut/backend-go/internal/identity"
)

type mailTransport func(*http.Request) (*http.Response, error)

func (f mailTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func resendResponse(r *http.Request, status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header), Request: r}
}
func resendDelivery(t *testing.T) *Delivery {
	t.Helper()
	mailer, err := New(Config{From: "Sneepcut <from@example.invalid>", ResendKey: "synthetic-api-key"})
	if err != nil {
		t.Fatal(err)
	}
	return mailer.(*Delivery)
}
func syntheticMail() identity.Mail {
	return identity.Mail{To: "person@example.invalid", Subject: "Verify your account", Text: "https://app.example.invalid/activate?token=synthetic-reset-token\n\n.Line after blank line", Key: "activation/synthetic-digest"}
}
func assertPrivateDeliveryError(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("delivery failure accepted")
	}
	for _, secret := range []string{"synthetic-api-key", "synthetic-reset-token", "synthetic-smtp-password"} {
		if strings.Contains(err.Error(), secret) {
			t.Fatal("provider error exposed secret")
		}
	}
}
func TestMailConfiguration(t *testing.T) {
	if mailer, err := New(Config{}); err != nil || mailer != nil {
		t.Fatal("disabled mail configured", err)
	}
	if _, err := New(Config{ResendKey: "synthetic-api-key", From: "invalid"}); err == nil {
		t.Fatal("invalid sender accepted")
	}
	mailer, err := New(Config{From: "from@example.invalid", SMTPHost: "localhost"})
	if err != nil || mailer.(*Delivery).config.SMTPPort != 587 {
		t.Fatal("SMTP default missing", err)
	}
}
func TestResendDeliveryContract(t *testing.T) {
	d := resendDelivery(t)
	m := syntheticMail()
	calls := 0
	d.client.Transport = mailTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Method != http.MethodPost || r.URL.String() != d.endpoint || r.Header.Get("Authorization") != "Bearer synthetic-api-key" || r.Header.Get("Idempotency-Key") != m.Key || r.Header.Get("Content-Type") != "application/json" {
			t.Error("incorrect Resend request")
		}
		var body struct {
			From    string   `json:"from"`
			To      []string `json:"to"`
			Subject string   `json:"subject"`
			Text    string   `json:"text"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if body.From != d.config.From || len(body.To) != 1 || body.To[0] != m.To || body.Subject != m.Subject || body.Text != m.Text {
			t.Error("email content changed")
		}
		return resendResponse(r, 201, `{"id":"synthetic-message"}`), nil
	})
	if err := d.Send(context.Background(), m); err != nil || calls != 1 {
		t.Fatal("delivery failed", err, calls)
	}
}
func TestResendRejectsProviderFailuresAndRedirects(t *testing.T) {
	for _, tc := range []struct {
		name, body     string
		status         int
		transportError bool
	}{
		{name: "status", status: 429, body: "synthetic-api-key synthetic-reset-token"},
		{name: "missing acknowledgment", body: `{}`}, {name: "malformed", body: `{"id":`},
		{name: "oversized", body: `{"id":"synthetic-message"}` + strings.Repeat(" ", 64*1024)},
		{name: "trailing JSON", body: `{"id":"synthetic-message"} {}`},
		{name: "transport", transportError: true}, {name: "redirect", status: 307},
	} {
		t.Run(tc.name, func(t *testing.T) {
			d := resendDelivery(t)
			calls := 0
			d.client.Transport = mailTransport(func(r *http.Request) (*http.Response, error) {
				calls++
				if tc.transportError {
					return nil, errors.New("synthetic-api-key synthetic-reset-token")
				}
				status := tc.status
				if status == 0 {
					status = 200
				}
				response := resendResponse(r, status, tc.body)
				if tc.status == 307 {
					response.Header.Set("Location", "https://attacker.invalid/capture")
				}
				return response, nil
			})
			assertPrivateDeliveryError(t, d.Send(context.Background(), syntheticMail()))
			if calls != 1 {
				t.Fatalf("provider redirect was followed: %d", calls)
			}
		})
	}
}
func TestMailRejectsHeaderInjectionBeforeProvider(t *testing.T) {
	for _, field := range []string{"recipient", "subject", "sender"} {
		t.Run(field, func(t *testing.T) {
			d := resendDelivery(t)
			m := syntheticMail()
			called := false
			d.client.Transport = mailTransport(func(r *http.Request) (*http.Response, error) {
				called = true
				return resendResponse(r, 200, `{"id":"synthetic-message"}`), nil
			})
			switch field {
			case "recipient":
				m.To += "\r\nBcc: victim@example.invalid"
			case "subject":
				m.Subject += "\r\nBcc: victim@example.invalid"
			case "sender":
				d.config.From += "\r\nBcc: victim@example.invalid"
			}
			if err := d.Send(context.Background(), m); err == nil || called {
				t.Fatal("unsafe headers reached provider")
			}
		})
	}
}

type smtpCapture struct {
	commands, lines []string
	err             error
}

func mockSMTP(t *testing.T, fail string) (Config, <-chan smtpCapture) {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	result := make(chan smtpCapture, 1)
	go func() {
		capture := smtpCapture{}
		defer func() { result <- capture }()
		conn, err := listener.Accept()
		if err != nil {
			capture.err = err
			return
		}
		defer conn.Close()
		_ = conn.SetDeadline(time.Now().Add(3 * time.Second))
		reader := bufio.NewReader(conn)
		write := func(s string) bool {
			_, err := io.WriteString(conn, s+"\r\n")
			if err != nil {
				capture.err = err
				return false
			}
			return true
		}
		reject := "550 synthetic-api-key synthetic-reset-token synthetic-smtp-password"
		if fail == "greeting" {
			write(reject)
			return
		}
		if !write("220 localhost ESMTP") {
			return
		}
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				if err != io.EOF {
					capture.err = err
				}
				return
			}
			line = strings.TrimSuffix(strings.TrimSuffix(line, "\n"), "\r")
			capture.commands = append(capture.commands, line)
			command := strings.SplitN(line, " ", 2)[0]
			switch command {
			case "EHLO":
				if fail == "tls-handshake" {
					if !write("250-localhost\r\n250 STARTTLS") {
						return
					}
				} else if !write("250-localhost\r\n250 AUTH PLAIN") {
					return
				}
			case "HELO":
				if !write("250 localhost") {
					return
				}
			case "STARTTLS":
				write("454 synthetic-reset-token")
				return
			case "AUTH":
				if fail == "auth" {
					write(reject)
					return
				}
				if !write("235 authenticated") {
					return
				}
			case "MAIL":
				if fail == "sender" {
					write(reject)
					return
				}
				if !write("250 OK") {
					return
				}
			case "RCPT":
				if fail == "recipient" {
					write(reject)
					return
				}
				if !write("250 OK") {
					return
				}
			case "DATA":
				if fail == "data" {
					write(reject)
					return
				}
				if !write("354 send message") {
					return
				}
				for {
					line, err := reader.ReadString('\n')
					if err != nil {
						capture.err = err
						return
					}
					line = strings.TrimSuffix(strings.TrimSuffix(line, "\n"), "\r")
					if line == "." {
						break
					}
					capture.lines = append(capture.lines, line)
				}
				if fail == "acknowledgment" {
					write(reject)
					return
				}
				if !write("250 accepted") {
					return
				}
			case "QUIT":
				if fail == "quit" {
					write(reject)
					return
				}
				write("221 bye")
				return
			default:
				capture.err = fmt.Errorf("unexpected command %s", command)
				return
			}
		}
	}()
	host, portText, err := net.SplitHostPort(listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	port, _ := strconv.Atoi(portText)
	return Config{From: "Sneepcut <from@example.invalid>", SMTPHost: host, SMTPPort: port, SMTPUsername: "synthetic-user", SMTPPassword: "synthetic-smtp-password"}, result
}
func awaitSMTP(t *testing.T, result <-chan smtpCapture) smtpCapture {
	t.Helper()
	select {
	case capture := <-result:
		if capture.err != nil {
			t.Fatal(capture.err)
		}
		return capture
	case <-time.After(4 * time.Second):
		t.Fatal("mock SMTP server did not finish")
		return smtpCapture{}
	}
}
func TestSMTPDeliveryContract(t *testing.T) {
	cfg, result := mockSMTP(t, "")
	mailer, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	m := syntheticMail()
	m.To = "Recipient <person@example.invalid>"
	if err = mailer.Send(context.Background(), m); err != nil {
		t.Fatal(err)
	}
	capture := awaitSMTP(t, result)
	commands := strings.Join(capture.commands, "\n")
	if !strings.Contains(commands, "MAIL FROM:<from@example.invalid>") || !strings.Contains(commands, "RCPT TO:<person@example.invalid>") || !strings.Contains(commands, "AUTH PLAIN ") {
		t.Fatal("incorrect SMTP envelope or authentication")
	}
	content := strings.Join(capture.lines, "\n")
	for _, want := range []string{"From: " + cfg.From, "To: " + m.To, "Subject: " + m.Subject, "Content-Type: text/plain; charset=utf-8", "token=synthetic-reset-token", "..Line after blank line"} {
		if !strings.Contains(content, want) {
			t.Errorf("SMTP content missing %q", want)
		}
	}
}
func TestSMTPFailuresDoNotExposeProviderReplies(t *testing.T) {
	for _, stage := range []string{"greeting", "tls-required", "tls-handshake", "auth", "sender", "recipient", "data", "acknowledgment", "quit"} {
		t.Run(stage, func(t *testing.T) {
			cfg, result := mockSMTP(t, stage)
			if stage == "tls-required" {
				cfg.SMTPRequireTLS = true
			}
			mailer, err := New(cfg)
			if err != nil {
				t.Fatal(err)
			}
			assertPrivateDeliveryError(t, mailer.Send(context.Background(), syntheticMail()))
			awaitSMTP(t, result)
		})
	}
}
func TestSMTPCancellationStopsHandshake(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	accepted := make(chan net.Conn, 1)
	go func() {
		connection, err := listener.Accept()
		if err == nil {
			accepted <- connection
		}
	}()
	host, portText, _ := net.SplitHostPort(listener.Addr().String())
	port, _ := strconv.Atoi(portText)
	mailer, err := New(Config{From: "from@example.invalid", SMTPHost: host, SMTPPort: port})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	result := make(chan error, 1)
	go func() { result <- mailer.Send(ctx, syntheticMail()) }()
	select {
	case connection := <-accepted:
		defer connection.Close()
	case <-time.After(time.Second):
		t.Fatal("SMTP did not connect")
	}
	cancel()
	select {
	case err := <-result:
		assertPrivateDeliveryError(t, err)
	case <-time.After(time.Second):
		t.Fatal("SMTP ignored context cancellation after connecting")
	}
}
