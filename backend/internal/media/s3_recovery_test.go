package media

import (
	"context"
	"crypto/rand"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/aws/retry"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type loseUploadAcknowledgement struct {
	client aws.HTTPClient
	lost   bool
}

func (c *loseUploadAcknowledgement) Do(request *http.Request) (*http.Response, error) {
	response, err := c.client.Do(request)
	if err == nil && request.Method == http.MethodPut && response.StatusCode == 200 && !c.lost {
		c.lost = true
		_ = response.Body.Close()
		body := "<Error><Code>ServiceUnavailable</Code><Message>synthetic lost acknowledgement</Message></Error>"
		response.StatusCode = 503
		response.Body = io.NopCloser(strings.NewReader(body))
		response.ContentLength = int64(len(body))
		response.Header.Set("Content-Length", strconv.Itoa(len(body)))
		response.Header.Set("Content-Type", "application/xml")
	}
	return response, err
}

func TestS3RecoveryAfterLostAcknowledgement(t *testing.T) {
	storage := localS3ForTest(t)
	options := storage.client.(*s3.Client).Options()
	loss := &loseUploadAcknowledgement{client: options.HTTPClient}
	options.HTTPClient = loss
	storage.client = s3.New(options)
	key := "sneepcut-contract/" + rand.Text() + "/recovered.mp4"
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := storage.Delete(ctx, key); err != nil {
			t.Error(err)
		}
	})
	file := filepath.Join(t.TempDir(), "video.mp4")
	if err := os.WriteFile(file, videoBytes, 0600); err != nil {
		t.Fatal(err)
	}
	if err := storage.Save(context.Background(), file, key, "video/mp4"); err != nil {
		t.Fatalf("could not reconcile the committed local S3 upload: %v", err)
	}
	if !loss.lost {
		t.Fatal("did not inject acknowledgement loss")
	}
	if err := storage.Save(context.Background(), file, key, "video/mp4"); err == nil {
		t.Fatal("acknowledged another upload identity for identical existing bytes")
	}
}

func TestS3UploadReconcilesOnlyItsOwnCommittedOperation(t *testing.T) {
	for _, scenario := range []string{"lost-ack", "head-retry", "existing", "wrong-size", "unavailable", "denied", "cancelled"} {
		t.Run(scenario, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			var mu sync.Mutex
			puts, heads := 0, 0
			writeID := ""
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				mu.Lock()
				defer mu.Unlock()
				switch r.Method {
				case http.MethodPut:
					puts++
					bytes, err := io.ReadAll(r.Body)
					if err != nil || string(bytes) != string(videoBytes) || r.Header.Get("If-None-Match") != "*" {
						t.Errorf("unsafe/replayed upload: %v", err)
					}
					id := r.Header.Get("X-Amz-Meta-Sneepcut-Write-Id")
					if id == "" || (writeID != "" && id != writeID) {
						t.Error("upload identity changed between SDK attempts")
					}
					writeID = id
					status, code := 412, "PreconditionFailed"
					if scenario == "unavailable" || (puts == 1 && scenario != "existing" && scenario != "denied") {
						status, code = 503, "ServiceUnavailable"
					}
					if scenario == "denied" {
						status, code = 403, "AccessDenied"
					}
					if scenario == "cancelled" {
						cancel()
					}
					w.Header().Set("Content-Type", "application/xml")
					w.WriteHeader(status)
					fmt.Fprintf(w, "<Error><Code>%s</Code></Error>", code)
				case http.MethodHead:
					heads++
					if scenario == "unavailable" {
						w.WriteHeader(404)
						return
					}
					if scenario == "head-retry" && heads == 1 {
						w.WriteHeader(503)
						return
					}
					id := writeID
					if scenario == "existing" {
						id = "another-upload-with-identical-bytes"
					}
					size := len(videoBytes)
					if scenario == "wrong-size" {
						size++
					}
					w.Header().Set("X-Amz-Meta-Sneepcut-Write-Id", id)
					w.Header().Set("Content-Length", strconv.Itoa(size))
					w.WriteHeader(200)
				}
			}))
			defer server.Close()
			storage, err := NewS3Storage(S3Config{AccessKey: "synthetic", SecretKey: "synthetic", Bucket: "synthetic", Endpoint: server.URL, Region: "us-east-1", PathStyle: true})
			if err != nil {
				t.Fatal(err)
			}
			options := storage.client.(*s3.Client).Options()
			options.Retryer = retry.NewStandard(func(o *retry.StandardOptions) { o.MaxBackoff = time.Millisecond })
			storage.client = s3.New(options)
			file := filepath.Join(t.TempDir(), "media.mp4")
			if err := os.WriteFile(file, videoBytes, 0600); err != nil {
				t.Fatal(err)
			}
			err = storage.Save(ctx, file, "uploads/synthetic/video.mp4", "video/mp4")
			mu.Lock()
			defer mu.Unlock()
			success := scenario == "lost-ack" || scenario == "head-retry"
			if (err == nil) != success {
				t.Fatalf("unexpected reconciliation: %v", err)
			}
			expectedPuts := 2
			if scenario == "unavailable" {
				expectedPuts = 3
			}
			if scenario == "existing" || scenario == "denied" || scenario == "cancelled" {
				expectedPuts = 1
			}
			if puts != expectedPuts {
				t.Fatalf("unbounded or missing retry: %d PUTs", puts)
			}
			skipHead := scenario == "denied" || scenario == "cancelled"
			if (skipHead && heads != 0) || (!skipHead && heads == 0) {
				t.Fatalf("incorrect reconciliation reads: %d", heads)
			}
		})
	}
}
