package media

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// This separate opt-in must never relax the normal loopback-only integration tests.
func TestHetznerS3Compatibility(t *testing.T) {
	storage := hetznerS3ForTest(t)
	testS3Compatibility(t, storage, 4*time.Minute)
	if t.Failed() {
		return
	}
	if manifest := os.Getenv("SNEEPCUT_HETZNER_MANIFEST"); manifest != "" {
		t.Run("real_video_cross_client_fixture", func(t *testing.T) { serveHetznerFixture(t, storage, manifest) })
	}
}

func hetznerS3ForTest(t *testing.T) *S3Storage {
	t.Helper()
	if os.Getenv("SNEEPCUT_HETZNER_SMOKE") != "1" {
		t.Skip("run the explicitly opted-in Hetzner smoke runner")
	}
	region := os.Getenv("SNEEPCUT_HETZNER_REGION")
	endpoint := os.Getenv("SNEEPCUT_HETZNER_ENDPOINT")
	bucket := os.Getenv("SNEEPCUT_HETZNER_BUCKET")
	if (region != "hel1" && region != "fsn1" && region != "nbg1") ||
		endpoint != "https://"+region+".your-objectstorage.com" || bucket == "" ||
		bucket != os.Getenv("SNEEPCUT_HETZNER_CONFIRM_BUCKET") {
		t.Fatal("Hetzner smoke requires an HTTPS regional endpoint and an explicitly confirmed bucket")
	}
	storage, err := NewS3Storage(S3Config{
		AccessKey: os.Getenv("AWS_ACCESS_KEY_ID"), SecretKey: os.Getenv("AWS_SECRET_ACCESS_KEY"),
		Region: region, Endpoint: endpoint, Bucket: bucket, PathStyle: false,
	})
	if err != nil {
		t.Fatal(err)
	}
	client := storage.client.(*s3.Client)
	if path := os.Getenv("SNEEPCUT_HETZNER_TRACE"); path != "" {
		trace, err := newS3Trace(path, nil)
		if err != nil {
			t.Fatal(err)
		}
		client.Options().HTTPClient.(*http.Client).Transport = trace
		t.Cleanup(func() {
			if err := trace.close(); err != nil {
				t.Error(err)
			}
		})
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if _, err := client.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(bucket)}); err != nil {
		t.Fatalf("check opted-in bucket: %v", err)
	}
	versioning, err := client.GetBucketVersioning(ctx, &s3.GetBucketVersioningInput{Bucket: aws.String(bucket)})
	if err != nil || versioning.Status != "" {
		t.Fatal("Hetzner smoke requires a bucket that has never enabled versioning")
	}
	return storage
}

func serveHetznerFixture(t *testing.T, storage *S3Storage, manifest string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		t.Fatal(err)
	}
	root := "sneepcut-verification/" + hex.EncodeToString(random[:])
	t.Cleanup(func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if _, err := storage.DeletePrefix(cleanup, root); err != nil {
			t.Errorf("fixture cleanup: %v", err)
		}
	})
	filename := filepath.Join(t.TempDir(), "source.mp4")
	command := exec.CommandContext(ctx, "ffmpeg", "-v", "error", "-nostdin", "-f", "lavfi", "-i",
		"color=c=blue:s=160x90:r=12:d=1", "-an", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", "-movflags", "+faststart", filename)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("create synthetic video: %v: %s", err, output)
	}
	content, err := os.ReadFile(filename)
	if err != nil {
		t.Fatal(err)
	}
	key := root + "/source clip_映像.mp4"
	if err := storage.Save(ctx, filename, key, "video/mp4"); err != nil {
		t.Fatal(err)
	}
	link, err := storage.SignedURL(ctx, key, 5*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(content)
	owner := fmt.Sprintf("%x-%x-%x-%x-%x", random[:4], random[4:6], random[6:8], random[8:10], random[10:])
	value, err := json.Marshal(map[string]string{"source_url": link, "sha256": hex.EncodeToString(hash[:]), "owner": owner})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(manifest, value, 0600); err != nil {
		t.Fatal(err)
	}
	for {
		if data, err := os.ReadFile(manifest + ".done"); err == nil {
			if !bytes.Equal(bytes.TrimSpace(data), []byte("ok")) {
				t.Fatal("cross-client verification failed")
			}
			return
		} else if !os.IsNotExist(err) {
			t.Fatal(err)
		}
		select {
		case <-ctx.Done():
			t.Fatal("cross-client fixture timed out")
		case <-time.After(100 * time.Millisecond):
		}
	}
}
