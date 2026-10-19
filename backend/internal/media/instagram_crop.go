package media

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"image"
	"io"
	"math"
	"net/http"
	"os"
	"path"
	"strings"
	"time"

	"golang.org/x/image/draw"
)

// InstagramCrop describes the visible rectangle using CSS object-position
// fractions. Zoom reduces the cover rectangle without changing its ratio.
type InstagramCrop struct {
	AspectRatio string  `json:"aspectRatio"`
	X           float64 `json:"x"`
	Y           float64 `json:"y"`
	Zoom        float64 `json:"zoom"`
}

func (c InstagramCrop) Ratio() float64 {
	switch c.AspectRatio {
	case "1:1":
		return 1
	case "4:5":
		return .8
	case "1.91:1":
		return 1.91
	default:
		return 0
	}
}

func (c InstagramCrop) Validate() error {
	if c.Ratio() == 0 || !finiteRange(c.X, 0, 1) || !finiteRange(c.Y, 0, 1) || !finiteRange(c.Zoom, 1, 3) {
		return errors.New("Choose a valid Instagram crop, position and zoom")
	}
	return nil
}

func finiteRange(value, minimum, maximum float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value >= minimum && value <= maximum
}

func instagramCropKey(key string, crop InstagramCrop) string {
	raw, _ := json.Marshal(crop)
	digest := sha256.Sum256(append([]byte("instagram-crop-v1:"), raw...))
	return strings.TrimSuffix(key, path.Ext(key)) + "-ig-crop-" + hex.EncodeToString(digest[:12]) + ".jpg"
}

// PrepareInstagramImage caches a separate JPEG. Uploads are immutable and the
// derivative key includes every crop value, so retries reuse exactly that crop.
func (s *Service) PrepareInstagramImage(ctx context.Context, reference string, crop *InstagramCrop) (string, error) {
	if crop != nil {
		if err := crop.Validate(); err != nil {
			return "", err
		}
	}
	key, err := s.KeyFromReference(reference)
	if err != nil {
		return "", err
	}
	parts := strings.Split(key, "/")
	if len(parts) != 3 || parts[0] != "publishing" || !uuidPattern.MatchString(parts[1]) || !publishingImageExtensions[strings.ToLower(path.Ext(key))] {
		return "", ErrInvalidKey
	}
	if crop == nil {
		return s.InstagramPublishingKey(ctx, key)
	}
	derivedKey := instagramCropKey(key, *crop)
	exists, err := s.Storage.Exists(ctx, derivedKey)
	if err != nil {
		return "", err
	}
	if exists {
		return s.InstagramPublishingKey(ctx, derivedKey)
	}
	source, err := s.WorkerSource(ctx, key)
	if err != nil {
		return "", err
	}
	input, err := openInstagramSource(ctx, source)
	if err != nil {
		return "", err
	}
	defer input.Close()
	staged, err := os.CreateTemp(s.cfg.StagingDirectory, "sneepcut-instagram-source-*")
	if err != nil {
		return "", err
	}
	defer os.Remove(staged.Name())
	defer staged.Close()
	// Uploaded photos already pass dimension checks; bound the reread as well.
	written, err := io.Copy(staged, io.LimitReader(input, 100*1024*1024+1))
	if err != nil || written > 100*1024*1024 {
		return "", failure(400, "Instagram source image is too large or unreadable")
	}
	if err := staged.Close(); err != nil {
		return "", err
	}
	decoded, err := decodePublishingImage(staged.Name(), strings.ToLower(path.Ext(key)))
	if err != nil {
		return "", err
	}
	rect := instagramCropRectangle(decoded.Bounds(), *crop)
	width := min(1080, rect.Dx())
	// Round towards the API's supported interval at the two boundary ratios.
	// Rounding 1080 / 1.91 down would produce an invalid ratio above 1.91.
	height := max(1, int(math.Ceil(float64(width)/crop.Ratio())))
	if crop.Ratio() < 1 {
		height = max(1, int(math.Floor(float64(width)/crop.Ratio())))
	}
	result := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.CatmullRom.Scale(result, result.Bounds(), decoded, rect, draw.Src, nil)
	prepared, err := prepareInstagramImage(result, s.cfg.StagingDirectory)
	if err != nil {
		return "", err
	}
	defer os.Remove(prepared)
	info, err := os.Stat(prepared)
	if err != nil {
		return "", err
	}
	if info.Size() > 8*1024*1024 {
		return "", failure(400, "Instagram cropped images must be at most 8 MB")
	}
	if err := s.Storage.Save(ctx, prepared, derivedKey, "image/jpeg"); err != nil {
		return "", err
	}
	return derivedKey, nil
}

// ValidateInstagramFeedImage checks originals separately from Reel covers,
// whose 9:16 geometry is intentionally outside the feed photo interval.
func (s *Service) ValidateInstagramFeedImage(ctx context.Context, reference string) error {
	source, err := s.WorkerSource(ctx, reference)
	if err != nil {
		return err
	}
	input, err := openInstagramSource(ctx, source)
	if err != nil {
		return err
	}
	defer input.Close()
	raw, err := io.ReadAll(io.LimitReader(input, 8*1024*1024+1))
	if err != nil || len(raw) > 8*1024*1024 {
		return failure(400, "Instagram images must be readable and at most 8 MB")
	}
	reader := bytes.NewReader(raw)
	config, format, err := image.DecodeConfig(reader)
	if err != nil || config.Width < 1 || config.Height < 1 {
		return failure(400, "Instagram photo dimensions could not be read")
	}
	width, height := config.Width, config.Height
	if readImageOrientation(reader, format) >= 5 {
		width, height = height, width
	}
	ratio := float64(width) / float64(height)
	if ratio < .8 || ratio > 1.91 {
		return failure(400, "This original photo is outside Instagram's supported aspect ratios. Select an Instagram photo format and adjust its crop")
	}
	return nil
}

func instagramCropRectangle(bounds image.Rectangle, crop InstagramCrop) image.Rectangle {
	width, height := float64(bounds.Dx()), float64(bounds.Dy())
	if width/height > crop.Ratio() {
		width = height * crop.Ratio()
	} else {
		height = width / crop.Ratio()
	}
	w, h := max(1, int(math.Round(width/crop.Zoom))), max(1, int(math.Round(height/crop.Zoom)))
	x := bounds.Min.X + int(math.Round(float64(bounds.Dx()-w)*crop.X))
	y := bounds.Min.Y + int(math.Round(float64(bounds.Dy()-h)*crop.Y))
	return image.Rect(x, y, x+w, y+h)
}

func openInstagramSource(ctx context.Context, source string) (io.ReadCloser, error) {
	if !strings.HasPrefix(source, "https://") && !strings.HasPrefix(source, "http://") {
		return os.Open(source)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: 30 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Do(request)
	if err != nil {
		return nil, failure(503, "Instagram image preparation is temporarily unavailable")
	}
	if response.StatusCode != http.StatusOK {
		response.Body.Close()
		return nil, failure(503, "Instagram image preparation is temporarily unavailable")
	}
	return response.Body, nil
}
