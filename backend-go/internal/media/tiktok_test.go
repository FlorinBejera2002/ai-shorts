package media

import (
	"context"
	"encoding/json"
	"image"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestTikTokInspectsLocalCarouselPhotosWithoutFFprobe(t *testing.T) {
	storage, err := NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()
	file, err := os.CreateTemp(t.TempDir(), "photo-*.jpg")
	if err != nil {
		t.Fatal(err)
	}
	if err = jpeg.Encode(file, image.NewRGBA(image.Rect(0, 0, 1080, 1080)), nil); err != nil {
		t.Fatal(err)
	}
	file.Close()
	key := "publishing/" + testUserID + "/photo.jpg"
	if err = storage.Save(context.Background(), file.Name(), key, "image/jpeg"); err != nil {
		t.Fatal(err)
	}
	s := NewService(Config{}, nil, storage, nil, nil)
	for i := 0; i < 35; i++ {
		if _, err := s.TikTokPublishingKey(context.Background(), key); err != nil {
			t.Fatalf("photo %d: %v", i, err)
		}
	}
}

func TestPhotoInspectionSupportsStoredURLAndRejectsRedirect(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/redirect" {
			http.Redirect(w, r, "/photo", http.StatusFound)
			return
		}
		_ = jpeg.Encode(w, image.NewRGBA(image.Rect(0, 0, 40, 80)), nil)
	}))
	defer server.Close()
	metadata, err := inspectPublishingPhoto(context.Background(), server.URL+"/photo")
	if err != nil || len(metadata.Streams) != 1 || metadata.Streams[0].Height != 80 {
		t.Fatalf("inspect remote: %#v %v", metadata, err)
	}
	if _, err = inspectPublishingPhoto(context.Background(), server.URL+"/redirect"); err == nil {
		t.Fatal("redirect followed")
	}
}

func TestPublishingProbeReadsRealVideo(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg is required for real media inspection")
	}
	filename := filepath.Join(t.TempDir(), "fixture.mp4")
	command := exec.Command("ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=360x640:r=30", "-t", "1.2", "-c:v", "libx264", "-pix_fmt", "yuv420p", filename)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("generate fixture: %v %s", err, output)
	}
	metadata, err := runPublishingProbe(context.Background(), filename)
	if err != nil || len(metadata.Streams) != 1 || metadata.Streams[0].Width != 360 || metadata.Format.Duration != "1.200000" {
		t.Fatalf("probe real fixture: %#v %v", metadata, err)
	}
}

func TestScannerCapacityFailureIsExplicitBeforeNetworking(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "large.mp4")
	if err := os.WriteFile(filename, make([]byte, 1025), 0600); err != nil {
		t.Fatal(err)
	}
	scanner := NewClamAV(ClamAVConfig{Enabled: true, MaxBytes: 1024})
	err := scanner.Scan(context.Background(), filename)
	if err == nil || !strings.Contains(err.Error(), "scanner capacity") {
		t.Fatalf("unclear capacity failure: %v", err)
	}
}

func stubPublishingProbe(t *testing.T, s *Service, fixture string) {
	t.Helper()
	var result publishingProbe
	if err := json.Unmarshal([]byte(fixture), &result); err != nil {
		t.Fatal(err)
	}
	s.probe = func(context.Context, string) (publishingProbe, error) { return result, nil }
}

func TestTikTokPhotosUseProviderSpecificFormatAndLimits(t *testing.T) {
	for _, suffix := range []string{".jpg", ".jpeg", ".png", ".webp"} {
		t.Run(suffix, func(t *testing.T) {
			s, _, storage, _ := uploadService(t)
			original := "publishing/" + testUserID + "/photo" + suffix
			prepared := original
			codec := "mjpeg"
			if suffix == ".png" {
				prepared = instagramImageKey(original)
			}
			if suffix == ".webp" {
				codec = "webp"
			}
			storage.data = map[string][]byte{original: {1}, prepared: {2}}
			storage.sizes = map[string]int64{prepared: 20 * 1024 * 1024}
			stubPublishingProbe(t, s, `{"streams":[{"codec_name":"`+codec+`","width":1080,"height":1920}]}`)
			key, err := s.TikTokPublishingKey(context.Background(), original)
			if err != nil || key != prepared {
				t.Fatalf("valid photo rejected or wrong derivative: %q %v", key, err)
			}
			storage.sizes[prepared]++
			if _, err := s.TikTokPublishingKey(context.Background(), original); err == nil || !strings.Contains(err.Error(), "20 MB") {
				t.Fatalf("oversize accepted: %v", err)
			}
			if len(storage.saved) != 0 || len(storage.deleted) != 0 {
				t.Fatal("validation mutated originals")
			}
		})
	}
}

func TestTikTokPhotoDimensionsAndMissingDerivative(t *testing.T) {
	s, _, storage, _ := uploadService(t)
	key := "publishing/" + testUserID + "/photo.png"
	storage.data = map[string][]byte{key: {1}}
	if _, err := s.TikTokPublishingKey(context.Background(), key); err == nil {
		t.Fatal("missing PNG derivative accepted")
	}
	storage.data[instagramImageKey(key)] = []byte{1}
	stubPublishingProbe(t, s, `{"streams":[{"codec_name":"mjpeg","width":1921,"height":1080}]}`)
	if _, err := s.TikTokPublishingKey(context.Background(), key); err == nil || !strings.Contains(err.Error(), "1920") {
		t.Fatalf("oversize dimensions accepted: %v", err)
	}
}

func TestTikTokVideoSizeAndFormats(t *testing.T) {
	for _, suffix := range []string{".mp4", ".mov", ".webm", ".avi", ".mkv"} {
		t.Run(suffix, func(t *testing.T) {
			s, _, storage, _ := uploadService(t)
			key := "publishing/" + testUserID + "/video" + suffix
			storage.data = map[string][]byte{key: {1}}
			storage.sizes = map[string]int64{key: MaxPublishingUploadBytes}
			_, err := s.TikTokPublishingKey(context.Background(), key)
			accepted := suffix != ".avi" && suffix != ".mkv"
			if (err == nil) != accepted {
				t.Fatalf("format result: %v", err)
			}
			storage.sizes[key]++
			if _, err := s.TikTokPublishingKey(context.Background(), key); err == nil {
				t.Fatal("oversize video accepted")
			}
		})
	}
}

func TestPublishingVideoDurationUsesInspectedMedia(t *testing.T) {
	for _, tc := range []struct {
		name, codec, rate, duration string
		width                       int
		valid                       bool
	}{
		{"valid", "h264", "30000/1001", "181.25", 1080, true},
		{"webm", "vp9", "60/1", "3", 360, true},
		{"codec", "mpeg4", "30/1", "3", 1080, false},
		{"low fps", "h264", "22/1", "3", 1080, false},
		{"invalid fps", "h264", "0/0", "3", 1080, false},
		{"dimensions", "h264", "30/1", "3", 359, false},
		{"unknown duration", "h264", "30/1", "N/A", 1080, false},
		{"infinite duration", "h264", "30/1", "Inf", 1080, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, _, _, _ := uploadService(t)
			payload, _ := json.Marshal(map[string]any{"streams": []any{map[string]any{"codec_name": tc.codec, "width": tc.width, "height": 1920, "avg_frame_rate": tc.rate}}, "format": map[string]string{"duration": tc.duration}})
			stubPublishingProbe(t, s, string(payload))
			duration, err := s.PublishingVideoDuration(context.Background(), "publishing/"+testUserID+"/video.mp4")
			if (err == nil) != tc.valid || (tc.valid && duration <= 0) {
				t.Fatalf("duration=%v err=%v", duration, err)
			}
		})
	}
}
