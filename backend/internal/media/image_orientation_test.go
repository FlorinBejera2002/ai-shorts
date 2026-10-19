package media

import (
	"bytes"
	"context"
	"encoding/binary"
	"image"
	"image/color"
	"image/jpeg"
	"os"
	"path/filepath"
	"testing"
)

func orientationTIFF(orientation uint16) []byte {
	raw := []byte{'I', 'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}
	binary.LittleEndian.PutUint16(raw[18:20], orientation)
	return raw
}

func TestDecodePublishingJPEGMatchesBrowserEXIFOrientation(t *testing.T) {
	original := image.NewNRGBA(image.Rect(0, 0, 30, 10))
	for y := 0; y < 10; y++ {
		for x := 0; x < 30; x++ {
			c := color.NRGBA{R: 255, A: 255}
			if x >= 15 {
				c = color.NRGBA{B: 255, A: 255}
			}
			original.SetNRGBA(x, y, c)
		}
	}
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, original, &jpeg.Options{Quality: 100}); err != nil {
		t.Fatal(err)
	}
	exif := append([]byte("Exif\x00\x00"), orientationTIFF(6)...)
	app1 := []byte{0xff, 0xe1, 0, byte(len(exif) + 2)}
	raw := append(append(append(append([]byte{}, encoded.Bytes()[:2]...), app1...), exif...), encoded.Bytes()[2:]...)
	filename := filepath.Join(t.TempDir(), "rotated.jpg")
	if err := os.WriteFile(filename, raw, 0600); err != nil {
		t.Fatal(err)
	}
	decoded, err := decodePublishingImage(filename, ".jpg")
	if err != nil {
		t.Fatal(err)
	}
	if decoded.Bounds() != image.Rect(0, 0, 10, 30) {
		t.Fatalf("orientation not applied: %v", decoded.Bounds())
	}
	r, _, b, _ := decoded.At(5, 25).RGBA()
	if b < 60000 || r > 1500 {
		t.Fatalf("rotated bottom should be blue: r=%d b=%d", r, b)
	}
	after, _ := os.ReadFile(filename)
	if !bytes.Equal(after, raw) {
		t.Fatal("EXIF normalization changed original bytes")
	}
}

func TestInstagramOriginalRatioUsesEXIFOrientationAndDoesNotRestrictCovers(t *testing.T) {
	root, staging := t.TempDir(), t.TempDir()
	storage, err := NewLocalStorage(root)
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()
	service := NewService(Config{LocalRoot: root, StagingDirectory: staging}, nil, storage, nil, nil)
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, image.NewRGBA(image.Rect(0, 0, 160, 90)), &jpeg.Options{Quality: 100}); err != nil {
		t.Fatal(err)
	}
	exif := append([]byte("Exif\x00\x00"), orientationTIFF(6)...)
	raw := append(append(append(append([]byte{}, encoded.Bytes()[:2]...), []byte{0xff, 0xe1, 0, byte(len(exif) + 2)}...), exif...), encoded.Bytes()[2:]...)
	filename := filepath.Join(staging, "source.jpg")
	if err := os.WriteFile(filename, raw, 0600); err != nil {
		t.Fatal(err)
	}
	key := "publishing/" + testUserID + "/portrait.jpg"
	if err := storage.Save(context.Background(), filename, key, "image/jpeg"); err != nil {
		t.Fatal(err)
	}
	if err := service.ValidateInstagramFeedImage(context.Background(), key); err == nil {
		t.Fatal("9:16 oriented original feed image accepted")
	}
	if _, err := service.PrepareInstagramImage(context.Background(), key, nil); err != nil {
		t.Fatalf("9:16 Reel cover rejected: %v", err)
	}
}

func TestOrientationMetadataSupportsPNGAndWebPAndRejectsInvalidOffsets(t *testing.T) {
	tiff := orientationTIFF(8)
	for _, format := range []string{"png", "webp"} {
		var encoded []byte
		if format == "png" {
			encoded = make([]byte, 16)
			binary.BigEndian.PutUint32(encoded[8:12], uint32(len(tiff)))
			copy(encoded[12:16], "eXIf")
		} else {
			encoded = make([]byte, 20)
			copy(encoded[12:16], "EXIF")
			binary.LittleEndian.PutUint32(encoded[16:20], uint32(len(tiff)))
		}
		encoded = append(encoded, tiff...)
		if got := readImageOrientation(bytes.NewReader(encoded), format); got != 8 {
			t.Fatalf("%s orientation=%d", format, got)
		}
	}
	for _, raw := range [][]byte{nil, []byte("II"), {'I', 'I', 42, 0, 255, 255, 255, 255}, orientationTIFF(42)} {
		if got := exifOrientation(raw); got != 1 {
			t.Fatalf("invalid EXIF returned %d", got)
		}
	}
}

func TestAllEXIFOrientationTransforms(t *testing.T) {
	original := image.NewGray(image.Rect(0, 0, 2, 3))
	for y := 0; y < 3; y++ {
		for x := 0; x < 2; x++ {
			original.SetGray(x, y, color.Gray{Y: uint8(y*2 + x + 1)})
		}
	}
	for orientation, want := range map[uint16][]uint8{1: {1, 2, 3, 4, 5, 6}, 2: {2, 1, 4, 3, 6, 5}, 3: {6, 5, 4, 3, 2, 1}, 4: {5, 6, 3, 4, 1, 2}, 5: {1, 3, 5, 2, 4, 6}, 6: {5, 3, 1, 6, 4, 2}, 7: {6, 4, 2, 5, 3, 1}, 8: {2, 4, 6, 1, 3, 5}} {
		got := orientImage(original, orientation)
		index := 0
		for y := 0; y < got.Bounds().Dy(); y++ {
			for x := 0; x < got.Bounds().Dx(); x++ {
				value := color.GrayModel.Convert(got.At(x, y)).(color.Gray).Y
				if value != want[index] {
					t.Fatalf("orientation %d pixel%d=%d want%d", orientation, index, value, want[index])
				}
				index++
			}
		}
	}
}
