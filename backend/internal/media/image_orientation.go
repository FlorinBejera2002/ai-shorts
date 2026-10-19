package media

import (
	"bytes"
	"encoding/binary"
	"image"
	"io"
)

// Browsers display EXIF orientation before users choose a crop. Apply the same
// transform before computing server-side crop coordinates. Only metadata is
// parsed here; image decoding and dimension limits remain in the upload layer.
func readImageOrientation(source io.ReadSeeker, format string) uint16 {
	_, _ = source.Seek(0, io.SeekStart)
	read := func(size int) ([]byte, bool) {
		b := make([]byte, size)
		_, err := io.ReadFull(source, b)
		return b, err == nil
	}
	metadata := func(size int64) uint16 {
		if size < 8 || size > 1<<20 {
			return 1
		}
		b, ok := read(int(size))
		if !ok {
			return 1
		}
		return exifOrientation(bytes.TrimPrefix(b, []byte("Exif\x00\x00")))
	}
	switch format {
	case "jpeg":
		if b, ok := read(2); !ok || !bytes.Equal(b, []byte{0xff, 0xd8}) {
			return 1
		}
		for i := 0; i < 256; i++ {
			marker, ok := read(2)
			if !ok || marker[0] != 0xff || marker[1] == 0xda || marker[1] == 0xd9 {
				return 1
			}
			length, ok := read(2)
			if !ok {
				return 1
			}
			size := int64(binary.BigEndian.Uint16(length)) - 2
			if size < 0 {
				return 1
			}
			if marker[1] == 0xe1 {
				start, _ := source.Seek(0, io.SeekCurrent)
				if orientation := metadata(size); orientation != 1 {
					return orientation
				}
				_, _ = source.Seek(start+size, io.SeekStart)
			} else {
				_, _ = source.Seek(size, io.SeekCurrent)
			}
		}
	case "png", "webp":
		start := int64(8)
		if format == "webp" {
			start = 12
		}
		_, _ = source.Seek(start, io.SeekStart)
		for i := 0; i < 256; i++ {
			header, ok := read(8)
			if !ok {
				return 1
			}
			var size int64
			var name string
			if format == "png" {
				size = int64(binary.BigEndian.Uint32(header[:4]))
				name = string(header[4:])
			} else {
				size = int64(binary.LittleEndian.Uint32(header[4:]))
				name = string(header[:4])
			}
			if name == "eXIf" || name == "EXIF" {
				return metadata(size)
			}
			if name == "IEND" {
				return 1
			}
			if format == "png" {
				size += 4
			} else {
				size += size % 2
			}
			if _, err := source.Seek(size, io.SeekCurrent); err != nil {
				return 1
			}
		}
	}
	return 1
}

func exifOrientation(tiff []byte) uint16 {
	if len(tiff) < 8 {
		return 1
	}
	var order binary.ByteOrder
	switch string(tiff[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return 1
	}
	if order.Uint16(tiff[2:4]) != 42 {
		return 1
	}
	offset := uint64(order.Uint32(tiff[4:8]))
	if offset+2 > uint64(len(tiff)) {
		return 1
	}
	entries := uint64(order.Uint16(tiff[offset : offset+2]))
	for i := uint64(0); i < entries; i++ {
		pos := offset + 2 + i*12
		if pos+12 > uint64(len(tiff)) {
			return 1
		}
		entry := tiff[pos : pos+12]
		if order.Uint16(entry[:2]) == 0x112 && order.Uint16(entry[2:4]) == 3 && order.Uint32(entry[4:8]) == 1 {
			value := order.Uint16(entry[8:10])
			if value >= 1 && value <= 8 {
				return value
			}
			return 1
		}
	}
	return 1
}

func orientImage(source image.Image, orientation uint16) image.Image {
	if orientation <= 1 || orientation > 8 {
		return source
	}
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	outWidth, outHeight := width, height
	if orientation >= 5 {
		outWidth, outHeight = height, width
	}
	result := image.NewNRGBA(image.Rect(0, 0, outWidth, outHeight))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			var dx, dy int
			switch orientation {
			case 2:
				dx, dy = width-1-x, y
			case 3:
				dx, dy = width-1-x, height-1-y
			case 4:
				dx, dy = x, height-1-y
			case 5:
				dx, dy = y, x
			case 6:
				dx, dy = height-1-y, x
			case 7:
				dx, dy = height-1-y, width-1-x
			case 8:
				dx, dy = y, width-1-x
			}
			result.Set(dx, dy, source.At(bounds.Min.X+x, bounds.Min.Y+y))
		}
	}
	return result
}
