package media

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

func TestHetznerS3VideoTransfers(t *testing.T) {
	storage := hetznerS3ForTest(t)
	filename := os.Getenv("SNEEPCUT_HETZNER_VIDEO_FIXTURE")
	if filename == "" {
		t.Skip("the opt-in runner supplies a generated video-sized MP4 fixture")
	}
	file, err := os.Open(filename)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() < 8<<20 || info.Size() > 32<<20 {
		t.Fatal("video fixture must be a regular 8–32 MiB file")
	}
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		t.Fatal(err)
	}
	expected := hash.Sum(nil)
	var id [16]byte
	if _, err := rand.Read(id[:]); err != nil {
		t.Fatal(err)
	}
	root := "sneepcut-video-check/" + hex.EncodeToString(id[:])
	t.Logf("synthetic object prefix: %s; fixture_bytes=%d", root, info.Size())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()
		if _, err := storage.DeletePrefix(ctx, root); err != nil {
			t.Errorf("video fixture cleanup: %v", err)
			return
		}
		remaining, err := storage.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{Bucket: aws.String(storage.bucket), Prefix: aws.String(root + "/"), MaxKeys: aws.Int32(1)})
		if err != nil || len(remaining.Contents) != 0 {
			t.Error("video fixture prefix was not confirmed empty")
		}
	})
	transfer := func(t *testing.T, key string) {
		t.Helper()
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		started := time.Now()
		if err := storage.Save(ctx, filename, key, "video/mp4"); err != nil {
			t.Fatalf("video upload after %s: %v", time.Since(started), err)
		}
		upload := time.Since(started)
		size, err := storage.Size(ctx, key)
		if err != nil {
			t.Fatalf("video metadata request failed: %v", err)
		}
		if size != info.Size() {
			t.Fatalf("video metadata size mismatch: got %d, expected %d", size, info.Size())
		}
		link, err := storage.SignedURL(ctx, key, 5*time.Minute)
		if err != nil {
			t.Fatal(err)
		}
		client := &http.Client{Transport: storage.client.(*s3.Client).Options().HTTPClient.(*http.Client).Transport}
		request, _ := http.NewRequestWithContext(ctx, http.MethodGet, link, nil)
		started = time.Now()
		response, err := client.Do(request)
		if err != nil {
			t.Fatal("signed video GET failed")
		}
		if response.StatusCode != http.StatusOK {
			var failure struct {
				Code string `xml:"Code"`
			}
			_ = xml.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&failure)
			response.Body.Close()
			t.Fatalf("signed video GET returned HTTP %d (%s), request_id=%s", response.StatusCode, failure.Code, response.Header.Get("X-Amz-Request-Id"))
		}
		hash := sha256.New()
		count, readErr := io.Copy(hash, io.LimitReader(response.Body, info.Size()+1))
		response.Body.Close()
		download := time.Since(started)
		if readErr != nil || response.StatusCode != 200 || count != info.Size() || !bytes.Equal(hash.Sum(nil), expected) {
			t.Fatal("downloaded video bytes/hash mismatch")
		}
		request, _ = http.NewRequestWithContext(ctx, http.MethodGet, link, nil)
		request.Header.Set("Range", "bytes=1048576-1048831")
		response, err = client.Do(request)
		if err != nil {
			t.Fatal("signed video Range GET failed")
		}
		if response.StatusCode != http.StatusPartialContent {
			response.Body.Close()
			t.Fatalf("signed video Range GET returned HTTP %d, request_id=%s", response.StatusCode, response.Header.Get("X-Amz-Request-Id"))
		}
		ranged, readErr := io.ReadAll(io.LimitReader(response.Body, 257))
		response.Body.Close()
		original := make([]byte, 256)
		if _, err := file.ReadAt(original, 1<<20); err != nil {
			t.Fatal(err)
		}
		if readErr != nil || response.StatusCode != 206 || !bytes.Equal(ranged, original) {
			t.Fatal("video byte range mismatch")
		}
		t.Logf("VIDEO_TRANSFER bytes=%d upload_ms=%d download_ms=%d sha256=%s", count, upload.Milliseconds(), download.Milliseconds(), hex.EncodeToString(expected))
	}
	t.Run("sequential_video", func(t *testing.T) { transfer(t, root+"/sequential.mp4") })
	t.Run("parallel_video", func(t *testing.T) {
		for i := range 2 {
			t.Run(fmt.Sprint(i), func(t *testing.T) { t.Parallel(); transfer(t, fmt.Sprintf("%s/parallel-%d.mp4", root, i)) })
		}
	})
}
