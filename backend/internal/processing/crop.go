package processing

import (
	"context"
	"fmt"
	pigo "github.com/esimov/pigo/core"
	"math"
	"os"
	"path/filepath"
	"strings"
)

// Face tracking replaces the former Python detector. A missing model is an error;
// a frame with no confident face holds the last framing (initially centered).
func (p *Processor) cropFilter(ctx context.Context, dir, source string, info probeInfo, width, height int) (string, error) {
	cascade, e := os.ReadFile(p.cfg.FaceModel)
	if e != nil {
		return "", fmt.Errorf("face model: %w", e)
	}
	detector, e := pigo.NewPigo().Unpack(cascade)
	if e != nil {
		return "", e
	}
	if e = p.ffmpeg(ctx, dir, "-i", source, "-vf", "fps=2,scale=320:-2", "-an", "-f", "rawvideo", "-pix_fmt", "gray", "frames.raw"); e != nil {
		return "", e
	}
	frames, e := os.Open(filepath.Join(dir, "frames.raw"))
	if e != nil {
		return "", e
	}
	defer frames.Close()
	rows := int(math.Round(float64(info.Height)*320/float64(info.Width)/2)) * 2
	pixels := make([]byte, 320*rows)
	x := float64(info.Width-width) / 2
	var commands strings.Builder
	frame := 0
	for {
		n, err := frames.Read(pixels)
		if n == 0 {
			break
		}
		if err != nil {
			return "", err
		}
		if n != len(pixels) {
			return "", fmt.Errorf("incomplete detection frame")
		}
		if err = ctx.Err(); err != nil {
			return "", err
		}
		detections := detector.ClusterDetections(detector.RunCascade(pigo.CascadeParams{MinSize: 20, MaxSize: min(rows, 320), ShiftFactor: .1, ScaleFactor: 1.1, ImageParams: pigo.ImageParams{Pixels: pixels, Rows: rows, Cols: 320, Dim: 320}}, 0), .2)
		best := -1
		bestValue := 0.0
		for i, d := range detections {
			if d.Q < 5 {
				continue
			}
			center := float64(d.Col) * float64(info.Width) / 320
			value := float64(d.Scale) / (1 + math.Abs(center-(x+float64(width)/2))/float64(info.Width))
			if value > bestValue {
				best = i
				bestValue = value
			}
		}
		if best >= 0 {
			target := float64(detections[best].Col)*float64(info.Width)/320 - float64(width)/2
			target = max(0, min(float64(info.Width-width), target))
			x = .65*x + .35*target
		}
		fmt.Fprintf(&commands, "%.3f crop x %d;\n", float64(frame)/2, int(x)/2*2)
		frame++
	}
	if frame == 0 {
		return "", fmt.Errorf("no frames available for tracking")
	}
	if e = os.WriteFile(filepath.Join(dir, "crop.cmd"), []byte(commands.String()), 0600); e != nil {
		return "", e
	}
	return fmt.Sprintf("sendcmd=f=crop.cmd,crop=%d:%d:%d:(ih-oh)/2", width, height, (info.Width-width)/2), nil
}
func dimensions(w, h int, ratio string) (int, int, error) {
	if w < 2 || h < 2 {
		return 0, 0, fmt.Errorf("video dimensions too small")
	}
	switch ratio {
	case "9:16", "":
		return 1080, 1920, nil
	case "1:1":
		return 1080, 1080, nil
	case "16:9":
		return 1920, 1080, nil
	default:
		return 0, 0, fmt.Errorf("unsupported aspect ratio")
	}
}
