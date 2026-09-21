package media

import (
	"context"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"io"
	"os"
	"path"
	"strings"
	"time"
)

var publishingContentTypes = map[string]string{
	".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
	".mp4": "video/mp4", ".mov": "video/quicktime", ".avi": "video/x-msvideo", ".mkv": "video/x-matroska", ".webm": "video/webm",
}

// Publishing uploads support TikTok's full video allowance independently of
// the processing/source-upload limit.
const MaxPublishingUploadBytes int64 = 4 * 1024 * 1024 * 1024

func instagramImageKey(key string) string {
	return strings.TrimSuffix(key, path.Ext(key)) + "-instagram.jpg"
}

// InstagramPublishingKey resolves the JPEG derivative without changing the
// original reference saved in the post. Callers already authorize the post.
func (s *Service) InstagramPublishingKey(ctx context.Context, reference string) (string, error) {
	key, err := s.KeyFromReference(reference)
	if err != nil {
		return "", err
	}
	suffix := strings.ToLower(path.Ext(key))
	if !publishingImageExtensions[suffix] {
		return key, nil
	}
	parts := strings.Split(key, "/")
	if len(parts) != 3 || parts[0] != "publishing" || !uuidPattern.MatchString(parts[1]) {
		return "", ErrInvalidKey
	}
	if suffix == ".png" || suffix == ".webp" {
		key = instagramImageKey(key)
	}
	exists, err := s.Storage.Exists(ctx, key)
	if err != nil {
		return "", err
	}
	if !exists {
		return "", failure(400, "Upload this image again to prepare it for Instagram")
	}
	size, err := s.Storage.Size(ctx, key)
	if err != nil {
		return "", err
	}
	if size > 8*1024*1024 {
		return "", failure(400, "Instagram images must be at most 8 MB. Choose a smaller image; your original has not been compressed")
	}
	return key, nil
}

// ValidatePublishingMedia checks provider constraints before scheduling, using
// the actual stored file instead of browser-supplied metadata.
func (s *Service) ValidatePublishingMedia(ctx context.Context, provider, reference, kind string) error {
	if provider == "tiktok" {
		key, err := s.TikTokPublishingKey(ctx, reference)
		if err != nil {
			return err
		}
		isImage := publishingImageExtensions[strings.ToLower(path.Ext(key))]
		if (kind == "image") != isImage {
			return failure(400, "TikTok media type does not match the uploaded file")
		}
		return nil
	}
	if provider == "instagram" && kind == "image" {
		_, err := s.InstagramPublishingKey(ctx, reference)
		return err
	}
	return nil
}

func (s *Service) PublishingPreviewURL(ctx context.Context, userID, reference string) (string, error) {
	key, err := s.KeyFromReference(reference)
	if err != nil || !uuidPattern.MatchString(userID) || path.Dir(key) != "publishing/"+userID || strings.HasPrefix(path.Base(key), ".") || publishingContentTypes[strings.ToLower(path.Ext(key))] == "" {
		return "", ErrInvalidKey
	}
	exists, err := s.Storage.Exists(ctx, key)
	if err != nil {
		return "", err
	}
	if !exists {
		return "", failure(404, "Uploaded file was not found")
	}
	return s.SignedURL(ctx, key)
}

func (s *Service) StorePublishingMedia(ctx context.Context, userID string, intent UploadIntent, body io.Reader) (UploadResult, error) {
	if !uuidPattern.MatchString(userID) {
		return UploadResult{}, failure(401, "Authentication required")
	}
	suffix := strings.ToLower(path.Ext(intent.FileName))
	isImage := publishingImageExtensions[suffix]
	if !isImage && !videoExtensions[suffix] {
		return UploadResult{}, failure(400, "Choose a JPG, PNG, WebP or video file")
	}
	filename, size, e := s.stage(ctx, body, MaxPublishingUploadBytes, 0, suffix, !isImage)
	if e != nil {
		return UploadResult{}, e
	}
	defer os.Remove(filename)
	contentType := publishingContentTypes[suffix]
	var derivative string
	if isImage {
		decoded, decodeErr := decodePublishingImage(filename, suffix)
		if decodeErr != nil {
			return UploadResult{}, decodeErr
		}
		if suffix != ".jpg" && suffix != ".jpeg" {
			// Meta requires JPEG, but the user's original remains byte-for-byte
			// intact. TikTok also reuses this copy for unsupported PNG uploads.
			derivative, e = prepareInstagramImage(decoded, s.cfg.StagingDirectory)
			if e != nil {
				return UploadResult{}, e
			}
			defer os.Remove(derivative)
		}
	}
	if e = s.accountActive(ctx, userID, true); e != nil {
		return UploadResult{}, e
	}
	id, e := randomID()
	if e != nil {
		return UploadResult{}, e
	}
	key := "publishing/" + userID + "/" + id + "-" + safeSlug(strings.TrimSuffix(intent.FileName, path.Ext(intent.FileName))) + suffix
	if e = s.Storage.Save(ctx, filename, key, contentType); e != nil {
		return UploadResult{}, failure(503, "Upload could not be stored")
	}
	storedKeys := []string{key}
	complete := false
	defer func() {
		if !complete {
			cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
			defer cancel()
			for _, storedKey := range storedKeys {
				_ = s.Storage.Delete(cleanupCtx, storedKey)
			}
		}
	}()
	if derivative != "" {
		derivativeKey := instagramImageKey(key)
		if e = s.Storage.Save(ctx, derivative, derivativeKey, "image/jpeg"); e != nil {
			return UploadResult{}, failure(503, "Image could not be prepared for publishing")
		}
		storedKeys = append(storedKeys, derivativeKey)
	}
	if e = s.accountActive(ctx, userID, true); e != nil {
		return UploadResult{}, e
	}
	complete = true
	return UploadResult{FilePath: key, FileName: path.Base(key), FileSize: size, ContentType: contentType}, nil
}

func decodePublishingImage(source, suffix string) (image.Image, error) {
	in, e := os.Open(source)
	if e != nil {
		return nil, failure(400, "Image could not be read")
	}
	defer in.Close()
	config, format, e := image.DecodeConfig(in)
	// Current phones commonly produce 48 MP photos. Keep a generous upper
	// bound against decompression bombs without rejecting those normal files.
	if e != nil || format != logoFormats[suffix] || config.Width < 1 || config.Height < 1 || int64(config.Width)*int64(config.Height) > 100_000_000 {
		return nil, failure(400, "Image dimensions are invalid or too large")
	}
	if _, e = in.Seek(0, io.SeekStart); e != nil {
		return nil, failure(400, "Image could not be read")
	}
	decoded, format, e := image.Decode(in)
	if e != nil || format != logoFormats[suffix] || decoded.Bounds().Dx() != config.Width || decoded.Bounds().Dy() != config.Height {
		return nil, failure(400, "Image could not be decoded")
	}
	return decoded, nil
}

func prepareInstagramImage(decoded image.Image, stagingDirectory string) (string, error) {
	// JPEG has no alpha channel. Composite transparent uploads on white so a
	// logo or exported design does not acquire an unexpected black background.
	if opaque, ok := decoded.(interface{ Opaque() bool }); !ok || !opaque.Opaque() {
		flattened := image.NewRGBA(decoded.Bounds())
		draw.Draw(flattened, flattened.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)
		draw.Draw(flattened, flattened.Bounds(), decoded, decoded.Bounds().Min, draw.Over)
		decoded = flattened
	}
	out, e := os.CreateTemp(stagingDirectory, "sneepcut-instagram-*.jpg")
	if e != nil {
		return "", failure(503, "Upload staging is unavailable")
	}
	name := out.Name()
	keep := false
	defer func() {
		_ = out.Close()
		if !keep {
			_ = os.Remove(name)
		}
	}()
	if e = jpeg.Encode(out, decoded, &jpeg.Options{Quality: 100}); e != nil {
		return "", failure(400, "Image could not be prepared for publishing")
	}
	if e = out.Sync(); e != nil {
		return "", e
	}
	if e = out.Close(); e != nil {
		return "", e
	}
	keep = true
	return name, nil
}
