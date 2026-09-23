package processing

import (
	"context"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"sort"

	pigo "github.com/esimov/pigo/core"
	"sneepcut/backend-go/internal/story"
)

// A stable framing is safer than inventing motion. Only crop when the entire
// selected excerpt consistently contains one confident face that fits inside
// a fixed crop. Two people, uncertain detection, or moving out of frame -> fit.
func (p *Processor) storyStableCrop(ctx context.Context, dir, file string, interval story.Interval, asset story.Asset, w, h int) string {
	cascade, err := os.ReadFile(p.cfg.FaceModel)
	if err != nil {
		return ""
	}
	detector, err := pigo.NewPigo().Unpack(cascade)
	if err != nil {
		return ""
	}
	ratio := float64(w) / float64(h)
	cropW, cropH := asset.Width, asset.Height
	if float64(cropW)/float64(cropH) > ratio {
		cropW = int(float64(cropH)*ratio) / 2 * 2
	} else {
		cropH = int(float64(cropW)/ratio) / 2 * 2
	}
	if cropW < 16 || cropH < 16 {
		return ""
	}
	raw := filepath.Join(dir, "story-faces.gray")
	if p.ffmpeg(ctx, dir, "-ss", seconds(interval.In), "-t", seconds(interval.Out-interval.In), "-i", file, "-an", "-vf", "fps=2,scale=320:-2", "-pix_fmt", "gray", "-f", "rawvideo", raw) != nil {
		return ""
	}
	f, err := os.Open(raw)
	if err != nil {
		return ""
	}
	defer f.Close()
	rows := int(math.Round(float64(asset.Height)*320/float64(asset.Width)/2)) * 2
	buffer := make([]byte, 320*rows)
	total := 0
	var centers []float64
	left, right, top, bottom := float64(asset.Width), 0.0, float64(asset.Height), 0.0
	for {
		_, err = io.ReadFull(f, buffer)
		if err == io.EOF {
			break
		}
		if err != nil || ctx.Err() != nil {
			return ""
		}
		detections := detector.ClusterDetections(detector.RunCascade(pigo.CascadeParams{MinSize: 20, MaxSize: min(rows, 320), ShiftFactor: .1, ScaleFactor: 1.1, ImageParams: pigo.ImageParams{Pixels: buffer, Rows: rows, Cols: 320, Dim: 320}}, 0), .2)
		count := 0
		for _, d := range detections {
			if d.Q < 7 {
				continue
			}
			count++
			scale := float64(asset.Width) / 320
			x, y, r := float64(d.Col)*scale, float64(d.Row)*scale, float64(d.Scale)*scale*.7
			centers = append(centers, x)
			left = min(left, x-r)
			right = max(right, x+r)
			top = min(top, y-r)
			bottom = max(bottom, y+r)
		}
		if count > 1 {
			return ""
		}
		total++
	}
	if total == 0 || float64(len(centers))/float64(total) < .8 {
		return ""
	}
	sort.Float64s(centers)
	x := max(0, min(asset.Width-cropW, int(centers[len(centers)/2])-cropW/2)) / 2 * 2
	y := (asset.Height - cropH) / 2 / 2 * 2
	if left < float64(x) || right > float64(x+cropW) || top < float64(y) || bottom > float64(y+cropH) {
		return ""
	}
	return fmt.Sprintf("crop=%d:%d:%d:%d", cropW, cropH, x, y)
}
