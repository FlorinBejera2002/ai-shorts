package processing

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sneepcut/backend-go/internal/story"
	"strings"
)

const storyAssemblyBatchSize = 16

// A fixed number of native decoders is opened at once. Video is rounded on the
// global frame clock, audio on the global sample clock; neither clock accumulates
// per-clip rounding. Intermediate audio is lossless and video is encoded losslessly.
// The final concat demuxers open one chunk at a time instead of every original.
func (p *Processor) prepareStoryAssembly(ctx context.Context, dir string, parts []string, timeline []story.Entry, narration bool, hdrOutput ...bool) (string, string, error) {
	hdr := len(hdrOutput) > 0 && hdrOutput[0]
	var videoFiles, audioFiles []string
	for start := 0; start < len(parts); start += storyAssemblyBatchSize {
		if err := ctx.Err(); err != nil {
			return "", "", err
		}
		end := min(start+storyAssemblyBatchSize, len(parts))
		var args, filters []string
		var videoInputs, audioInputs strings.Builder
		videoCount := 0
		for i := start; i < end; i++ {
			input := i - start
			args = append(args, "-threads", "1", "-i", parts[i])
			entry := timeline[i]
			first, last := int(math.Round(entry.OutputIn*30)), int(math.Round(entry.OutputOut*30))
			if i == len(parts)-1 {
				last = max(1, last)
			}
			if frames := last - first; frames > 0 {
				visual := fmt.Sprintf("[%d:v]tpad=stop_mode=clone:stop_duration=0.034,trim=end_frame=%d,setpts=PTS-STARTPTS", input, frames)
				if i > 0 && entry.Transition == "fade" {
					visual += fmt.Sprintf(",fade=t=in:st=0:d=%s", seconds(storyFadeSeconds))
				}
				if i+1 < len(timeline) && timeline[i+1].Transition == "fade" {
					visual += fmt.Sprintf(",fade=t=out:st=%s:d=%s", seconds(max(0, float64(frames)/30-storyFadeSeconds)), seconds(storyFadeSeconds))
				}
				filters = append(filters, visual+fmt.Sprintf("[v%d]", input))
				fmt.Fprintf(&videoInputs, "[v%d]", input)
				videoCount++
			}
			if !narration {
				samples := int64(math.Round(entry.OutputOut*48000)) - int64(math.Round(entry.OutputIn*48000))
				filters = append(filters, fmt.Sprintf("[%d:a]apad,atrim=end_sample=%d,asetpts=PTS-STARTPTS[a%d]", input, samples, input))
				fmt.Fprintf(&audioInputs, "[a%d]", input)
			}
		}
		if videoCount > 0 {
			filters = append(filters, fmt.Sprintf("%sconcat=n=%d:v=1:a=0[v]", videoInputs.String(), videoCount))
		}
		if !narration {
			filters = append(filters, fmt.Sprintf("%sconcat=n=%d:v=0:a=1[a]", audioInputs.String(), end-start))
		}
		if len(filters) == 0 {
			continue
		}
		args = append(args, "-filter_complex", strings.Join(filters, ";"))
		if videoCount > 0 {
			file := fmt.Sprintf("assembly-video-%06d.mp4", start)
			args = append(args, "-map", "[v]", "-an")
			if hdr {
				args = append(args, "-c:v", "libx265", "-preset", "ultrafast", "-pix_fmt", "yuv420p10le", "-color_primaries", "bt2020", "-color_trc", "smpte2084", "-colorspace", "bt2020nc", "-x265-params", "lossless=1:pools=2:frame-threads=1:log-level=error:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc")
			} else {
				args = append(args, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "0", "-pix_fmt", "yuv420p")
			}
			args = append(args, "-threads", "1", filepath.Join(dir, file))
			videoFiles = append(videoFiles, file)
		}
		if !narration {
			file := fmt.Sprintf("assembly-audio-%06d.wav", start)
			args = append(args, "-map", "[a]", "-vn", "-c:a", "pcm_s16le", "-ar", "48000", filepath.Join(dir, file))
			audioFiles = append(audioFiles, file)
		}
		if err := p.ffmpeg(ctx, dir, args...); err != nil {
			return "", "", storyWorkError("bounded timeline assembly")
		}
	}
	writeManifest := func(name string, files []string) (string, error) {
		file := filepath.Join(dir, name)
		var lines strings.Builder
		lines.WriteString("ffconcat version 1.0\n")
		// Names are generated internally, never provided by the user or model.
		for _, part := range files {
			fmt.Fprintf(&lines, "file '%s'\n", part)
		}
		return file, os.WriteFile(file, []byte(lines.String()), 0600)
	}
	video, err := writeManifest("assembly-video.ffconcat", videoFiles)
	if err != nil {
		return "", "", err
	}
	audio := ""
	if !narration {
		audio, err = writeManifest("assembly-audio.ffconcat", audioFiles)
	}
	return video, audio, err
}
