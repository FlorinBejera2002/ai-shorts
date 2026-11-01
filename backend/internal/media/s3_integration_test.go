package media

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
)

// Exercise the production adapter against a real, private, unversioned bucket.
// Only loopback endpoints and a random test prefix are allowed; user objects
// and configured production credentials are never used by this test.
func TestS3Compatibility(t *testing.T) {
	endpoint := os.Getenv("SNEEPCUT_TEST_S3_ENDPOINT")
	if endpoint == "" {
		t.Skip("run make seaweed-up and make test-s3 for real local S3 verification")
	}
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "http" || u.User != nil || u.RawQuery != "" || u.Fragment != "" ||
		(u.Path != "" && u.Path != "/") || (u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost" && u.Hostname() != "::1") {
		t.Fatal("S3 integration tests require a loopback HTTP endpoint")
	}
	storage, err := NewS3Storage(S3Config{
		AccessKey: os.Getenv("SNEEPCUT_TEST_S3_ACCESS_KEY"),
		SecretKey: os.Getenv("SNEEPCUT_TEST_S3_SECRET_KEY"),
		Bucket:    os.Getenv("SNEEPCUT_TEST_S3_BUCKET"),
		Region:    "us-east-1", Endpoint: endpoint, PathStyle: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	client := storage.client.(*s3.Client)
	deadline := time.Now().Add(20 * time.Second)
	for {
		_, err = client.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(storage.bucket)})
		if err == nil {
			break
		}
		if time.Now().After(deadline) || ctx.Err() != nil {
			t.Fatal("local S3 bucket is unavailable; run make seaweed-up and check its credentials")
		}
		time.Sleep(250 * time.Millisecond)
	}
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		t.Fatal(err)
	}
	root := "sneepcut-contract/" + hex.EncodeToString(random[:])
	prefix := root + "/objects"
	t.Cleanup(func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		if _, err := storage.DeletePrefix(cleanup, root); err != nil {
			t.Errorf("clean synthetic S3 objects: %v", err)
		}
	})
	content := []byte("\x00\x00\x00\x18ftypmp42\x00synthetic storage fixture")
	filename := filepath.Join(t.TempDir(), "fixture.mp4")
	if err := os.WriteFile(filename, content, 0600); err != nil {
		t.Fatal(err)
	}
	key := prefix + "/fixture clip_映像.mp4"
	if err := storage.Save(ctx, filename, key, "video/mp4"); err != nil {
		t.Fatal(err)
	}

	t.Run("private_signed_reads_ranges_and_metadata", func(t *testing.T) {
		if exists, err := storage.Exists(ctx, key); err != nil || !exists {
			t.Fatalf("uploaded object missing: exists=%v error=%v", exists, err)
		}
		if size, err := storage.Size(ctx, key); err != nil || size != int64(len(content)) {
			t.Fatalf("incorrect size: size=%d error=%v", size, err)
		}
		signed, err := storage.SignedURL(ctx, key, time.Minute)
		if err != nil {
			t.Fatal(err)
		}
		httpClient := &http.Client{Timeout: 10 * time.Second}
		read := func(target, byteRange string, status int, expected []byte) {
			t.Helper()
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
			if err != nil {
				t.Fatal(err)
			}
			if byteRange != "" {
				req.Header.Set("Range", byteRange)
			}
			response, err := httpClient.Do(req)
			if err != nil {
				t.Fatal("local S3 download failed")
			}
			defer response.Body.Close()
			body, err := io.ReadAll(io.LimitReader(response.Body, 4096))
			if err != nil || response.StatusCode != status {
				t.Fatalf("read status=%d expected=%d error=%v", response.StatusCode, status, err)
			}
			if expected != nil && (!bytes.Equal(body, expected) || response.Header.Get("Content-Type") != "video/mp4") {
				t.Fatal("download changed the bytes or content type")
			}
		}
		read(signed, "", http.StatusOK, content)
		read(signed, "bytes=4-7", http.StatusPartialContent, content[4:8])
		unsigned, _ := url.Parse(signed)
		unsigned.RawQuery = ""
		read(unsigned.String(), "", http.StatusForbidden, nil)
	})

	t.Run("conditional_create_prevents_concurrent_overwrite", func(t *testing.T) {
		destination := prefix + "/concurrent.mp4"
		results := make(chan error, 4)
		var writers sync.WaitGroup
		for range 4 {
			writers.Add(1)
			go func() {
				defer writers.Done()
				results <- storage.Save(ctx, filename, destination, "video/mp4")
			}()
		}
		writers.Wait()
		close(results)
		successes := 0
		for err := range results {
			if err == nil {
				successes++
				continue
			}
			var api smithy.APIError
			if !errors.As(err, &api) || api.ErrorCode() != "PreconditionFailed" {
				t.Fatalf("conditional upload returned an unexpected error: %v", err)
			}
		}
		if successes != 1 {
			t.Fatalf("conditional upload allowed %d writers, expected exactly one", successes)
		}
	})

	t.Run("prefix_cleanup_paginates_and_preserves_neighbors", func(t *testing.T) {
		neighbor := root + "/objects-neighbor/keep.mp4"
		if err := storage.Save(ctx, filename, neighbor, "video/mp4"); err != nil {
			t.Fatal(err)
		}
		const count = 1003 // S3's default listing page contains at most 1000 keys.
		results := make(chan error, count)
		var writers sync.WaitGroup
		for worker := range 8 {
			writers.Add(1)
			go func(worker int) {
				defer writers.Done()
				for i := worker; i < count; i += 8 {
					results <- storage.Save(ctx, filename, fmt.Sprintf("%s/bulk/%04d.mp4", prefix, i), "video/mp4")
				}
			}(worker)
		}
		writers.Wait()
		close(results)
		for err := range results {
			if err != nil {
				t.Fatal(err)
			}
		}
		if deleted, err := storage.DeletePrefix(ctx, prefix); err != nil || deleted != count+2 {
			t.Fatalf("paginated deletion: count=%d error=%v", deleted, err)
		}
		if exists, err := storage.Exists(ctx, key); err != nil || exists {
			t.Fatalf("deleted object remains: exists=%v error=%v", exists, err)
		}
		if exists, err := storage.Exists(ctx, neighbor); err != nil || !exists {
			t.Fatalf("cleanup touched neighboring prefix: exists=%v error=%v", exists, err)
		}
		if err := storage.Delete(ctx, neighbor); err != nil {
			t.Fatal(err)
		}
	})
}
