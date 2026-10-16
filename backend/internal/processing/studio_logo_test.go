package processing

import "testing"

func TestStudioLogoOriginMatchesNormalizedPreviewAndKeepsImageInFrame(t *testing.T) {
	for _, tt := range []struct {
		name                                 string
		width, height, logoWidth, logoHeight float64
		brand                                map[string]any
		x, y                                 float64
	}{
		{"portrait center", 1080, 1920, 216, 108, map[string]any{"watermark_x": .25, "watermark_y": .6}, 162, 1098},
		{"landscape center", 1920, 1080, 216, 108, map[string]any{"watermark_x": .25, "watermark_y": .6}, 372, 594},
		{"top left clamp", 1080, 1920, 216, 108, map[string]any{"watermark_x": 0.0, "watermark_y": 0.0}, 0, 0},
		{"bottom right clamp", 1080, 1920, 216, 108, map[string]any{"watermark_x": 1.0, "watermark_y": 1.0}, 864, 1812},
		{"legacy bottom right", 1080, 1920, 216, 108, map[string]any{}, 844, 1792},
		{"reset top left", 1080, 1920, 216, 108, map[string]any{"watermark_x": nil, "watermark_y": nil, "watermark_position": "top-left"}, 20, 20},
	} {
		t.Run(tt.name, func(t *testing.T) {
			x, y := studioLogoOrigin(tt.width, tt.height, tt.logoWidth, tt.logoHeight, 20, tt.brand)
			if x != tt.x || y != tt.y {
				t.Fatalf("logo at %v,%v; want %v,%v", x, y, tt.x, tt.y)
			}
		})
	}
}
