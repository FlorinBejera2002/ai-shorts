package media

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

func TestInstagramCropPreservesOriginalCachesJPEGAndHonorsPosition(t *testing.T) {
	root, staging := t.TempDir(), t.TempDir()
	storage, err := NewLocalStorage(root)
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()
	service := NewService(Config{LocalRoot: root, StagingDirectory: staging}, nil, storage, nil, nil)
	original := image.NewNRGBA(image.Rect(0, 0, 300, 100))
	for y := 0; y < 100; y++ {
		for x := 0; x < 300; x++ {
			c := color.NRGBA{R: 255, A: 255}
			if x >= 100 {
				c = color.NRGBA{G: 255, A: 255}
			}
			if x >= 200 {
				c = color.NRGBA{B: 255, A: 255}
			}
			original.SetNRGBA(x, y, c)
		}
	}
	var raw bytes.Buffer
	if err := png.Encode(&raw, original); err != nil {
		t.Fatal(err)
	}
	filename := filepath.Join(t.TempDir(), "source.png")
	if err := os.WriteFile(filename, raw.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	key := "publishing/" + testUserID + "/photo.png"
	if err := storage.Save(context.Background(), filename, key, "image/png"); err != nil {
		t.Fatal(err)
	}
	for _, position := range []float64{0, .5, 1} {
		crop := &InstagramCrop{AspectRatio: "1:1", X: position, Y: .5, Zoom: 1}
		prepared, err := service.PrepareInstagramImage(context.Background(), key, crop)
		if err != nil {
			t.Fatal(err)
		}
		cached, err := service.PrepareInstagramImage(context.Background(), key, crop)
		if err != nil || cached != prepared || prepared == key {
			t.Fatalf("unstable derivative %q %q %v", prepared, cached, err)
		}
		storedPath, _ := storage.Path(prepared)
		file, err := os.Open(storedPath)
		if err != nil {
			t.Fatal(err)
		}
		decoded, format, err := image.Decode(file)
		file.Close()
		if err != nil || format != "jpeg" || decoded.Bounds().Dx() != 100 || decoded.Bounds().Dy() != 100 {
			t.Fatalf("incorrect crop image: %s %v", format, err)
		}
		r, g, b, _ := decoded.At(50, 50).RGBA()
		if position == 0 && (r < 60000 || g > 1000 || b > 1000) || position == .5 && (g < 60000 || r > 1000 || b > 1000) || position == 1 && (b < 60000 || r > 1000 || g > 1000) {
			t.Fatalf("crop position %v produced RGB %d,%d,%d", position, r, g, b)
		}
	}
	landscape := &InstagramCrop{AspectRatio: "1.91:1", X: .5, Y: .5, Zoom: 1}
	prepared, err := service.PrepareInstagramImage(context.Background(), key, landscape)
	if err != nil {
		t.Fatal(err)
	}
	if err := service.ValidateInstagramFeedImage(context.Background(), prepared); err != nil {
		t.Fatalf("rounded landscape crop exceeds supported ratio: %v", err)
	}
	portrait := &InstagramCrop{AspectRatio: "4:5", X: .5, Y: .5, Zoom: 1.3}
	prepared, err = service.PrepareInstagramImage(context.Background(), key, portrait)
	if err != nil {
		t.Fatal(err)
	}
	if err := service.ValidateInstagramFeedImage(context.Background(), prepared); err != nil {
		t.Fatalf("rounded portrait crop exceeds supported ratio: %v", err)
	}
	if err := service.ValidateInstagramFeedImage(context.Background(), key); err == nil {
		t.Fatal("unsupported original 3:1 feed ratio accepted")
	}
	originalPath, _ := storage.Path(key)
	after, _ := os.ReadFile(originalPath)
	if !bytes.Equal(after, raw.Bytes()) {
		t.Fatal("original was modified")
	}
	files, _ := os.ReadDir(staging)
	if len(files) != 0 {
		t.Fatalf("temporary crop files retained: %v", files)
	}
}

func TestInstagramCropGeometryAndValidation(t *testing.T) {
	bounds := image.Rect(0, 0, 2000, 1000)
	crop := InstagramCrop{AspectRatio: "4:5", X: 1, Y: 1, Zoom: 2}
	if got := instagramCropRectangle(bounds, crop); got != image.Rect(1600, 500, 2000, 1000) {
		t.Fatalf("wrong zoom/position rectangle %v", got)
	}
	for _, invalid := range []InstagramCrop{{AspectRatio: "16:9", Zoom: 1}, {AspectRatio: "1:1", X: -.1, Zoom: 1}, {AspectRatio: "1:1", Y: 1.1, Zoom: 1}, {AspectRatio: "1:1", Zoom: 0}, {AspectRatio: "1:1", Zoom: 3.1}} {
		if invalid.Validate() == nil {
			t.Fatalf("accepted invalid crop %+v", invalid)
		}
	}
}
