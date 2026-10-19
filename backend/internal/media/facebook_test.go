package media

import (
	"context"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

func TestFacebookReusesCachedCropAndKeepsUncroppedOriginal(t *testing.T) {
	root, staging := t.TempDir(), t.TempDir()
	storage, err := NewLocalStorage(root)
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()
	service := NewService(Config{LocalRoot: root, StagingDirectory: staging}, nil, storage, nil, nil)
	source := filepath.Join(staging, "source.png")
	file, err := os.Create(source)
	if err != nil {
		t.Fatal(err)
	}
	if err := png.Encode(file, image.NewRGBA(image.Rect(0, 0, 200, 100))); err != nil {
		t.Fatal(err)
	}
	file.Close()
	key := "publishing/" + testUserID + "/image.png"
	if err := storage.Save(context.Background(), source, key, "image/png"); err != nil {
		t.Fatal(err)
	}
	crop := &InstagramCrop{AspectRatio: "1:1", X: .75, Y: .5, Zoom: 1.5}
	facebook, err := service.PrepareFacebookImage(context.Background(), key, crop)
	if err != nil {
		t.Fatal(err)
	}
	instagram, err := service.PrepareInstagramImage(context.Background(), key, crop)
	if err != nil || facebook != instagram || facebook == key {
		t.Fatalf("crop was not shared %q %q %v", facebook, instagram, err)
	}
	if original, err := service.PrepareFacebookImage(context.Background(), key, nil); err != nil || original != key {
		t.Fatalf("Facebook original was changed %q %v", original, err)
	}
	if tiktok, err := service.PrepareTikTokImage(context.Background(), key, crop); err != nil || tiktok != instagram {
		t.Fatalf("TikTok crop was not prepared and validated %q %v", tiktok, err)
	}
}
