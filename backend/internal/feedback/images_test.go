package feedback

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"testing"

	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/media"
)

const testUser = "5f0c3c8e-8d7f-4f62-9a6f-2a7e3c1b9d01"

type imageStub struct {
	stored  []string
	removed []string
	fail    error
}

func (s *imageStub) StoreFeedbackImage(_ context.Context, userID, filename, _ string, body io.Reader) (string, error) {
	if _, err := io.Copy(io.Discard, body); err != nil {
		return "", err
	}
	if s.fail != nil {
		return "", s.fail
	}
	key := fmt.Sprintf("uploads/%s/%d-feedback.png", userID, len(s.stored))
	s.stored = append(s.stored, key)
	return key, nil
}

func (s *imageStub) RemoveFeedbackImage(_ context.Context, _ string, key string) error {
	s.removed = append(s.removed, key)
	return nil
}

type part struct{ name, filename, body string }

func multipartRequest(t *testing.T, parts ...part) *http.Request {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for _, p := range parts {
		header := textproto.MIMEHeader{}
		disposition := fmt.Sprintf(`form-data; name=%q`, p.name)
		if p.filename != "" {
			disposition += fmt.Sprintf(`; filename=%q`, p.filename)
			header.Set("Content-Type", "image/png")
		}
		header.Set("Content-Disposition", disposition)
		w, err := writer.CreatePart(header)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = w.Write([]byte(p.body))
	}
	_ = writer.Close()
	r := httptest.NewRequest(http.MethodPost, "/api/feedback", &body)
	r.Header.Set("Content-Type", writer.FormDataContentType())
	return r.WithContext(identity.WithPrincipal(r.Context(), identity.AuthResponse{User: identity.User{ID: testUser}}))
}

const problemPayload = `{"kind":"problem","category":"clips","message":"The export froze"}`

func TestReadWithImagesStoresScreenshots(t *testing.T) {
	store := &imageStub{}
	h := New(nil, nil, store)
	w := httptest.NewRecorder()
	r := multipartRequest(t, part{"payload", "", problemPayload}, part{"image", "a.png", "x"}, part{"image", "b.png", "y"})
	input, images, ok := h.readWithImages(w, r, testUser)
	if !ok || input.Message != "The export froze" || len(images) != 2 || len(store.removed) != 0 {
		t.Fatalf("ok=%v input=%+v images=%v removed=%v body=%s", ok, input, images, store.removed, w.Body.String())
	}
}

func TestReadWithImagesRejectsAndCleansUp(t *testing.T) {
	cases := []struct {
		name    string
		parts   []part
		fail    error
		status  int
		removed int
	}{
		{"payload must come first", []part{{"image", "a.png", "x"}, {"payload", "", problemPayload}}, nil, 400, 0},
		{"invalid message is rejected before storing", []part{{"payload", "", `{"kind":"problem","category":"clips","message":" "}`}, {"image", "a.png", "x"}}, nil, 400, 0},
		{"clip ratings carry no images", []part{{"payload", "", `{"kind":"clip","rating":3,"jobId":"0b7a8a3e-2f7c-4c1a-9a55-3f2a1f6c9d10"}`}, {"image", "a.png", "x"}}, nil, 400, 0},
		{"at most three images", []part{{"payload", "", problemPayload}, {"image", "1.png", "x"}, {"image", "2.png", "x"}, {"image", "3.png", "x"}, {"image", "4.png", "x"}}, nil, 400, 3},
		{"unknown field", []part{{"payload", "", problemPayload}, {"image", "1.png", "x"}, {"other", "", "x"}}, nil, 400, 1},
		{"rejected image keeps the media status", []part{{"payload", "", problemPayload}, {"image", "1.png", "x"}}, &media.HTTPError{Status: 400, Message: "Invalid image file"}, 400, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			store := &imageStub{fail: c.fail}
			h := New(nil, nil, store)
			w := httptest.NewRecorder()
			if _, _, ok := h.readWithImages(w, multipartRequest(t, c.parts...), testUser); ok {
				t.Fatal("request must be rejected")
			}
			if w.Code != c.status || len(store.removed) != c.removed {
				t.Fatalf("status %d removed %v: %s", w.Code, store.removed, w.Body.String())
			}
		})
	}
}
