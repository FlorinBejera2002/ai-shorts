package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"sneepcut/backend-go/internal/youtubeimport"
)

func importFormatVideo(t *testing.T, fileName string, contents []byte) youtubeimport.ImportedVideo {
	t.Helper()
	file := filepath.Join(t.TempDir(), "source"+strings.ToLower(filepath.Ext(fileName)))
	if err := os.WriteFile(file, contents, 0600); err != nil {
		t.Fatal(err)
	}
	return youtubeimport.ImportedVideo{Path: file, FileName: fileName, RelativePath: "YouTube/videos/" + fileName, Title: "Un mesaj puternic", VideoID: "_6f6RnHmde0", Size: int64(len(contents))}
}

func TestPrepareYouTubeImportPreservesSupportedFormatsAndDisplayMetadata(t *testing.T) {
	for _, extension := range []string{".MP4", ".MOV", ".AVI", ".MKV", ".WEBM"} {
		t.Run(extension, func(t *testing.T) {
			original := importFormatVideo(t, strings.Repeat("predică", 100)+"\n\t"+extension, []byte("original media bytes"))
			prepared, cleanup, err := prepareYouTubeImportWithFFmpeg(context.Background(), original, 1024, "not-required-for-supported-formats")
			if err != nil {
				t.Fatal(err)
			}
			cleanup()
			if prepared.Path != original.Path || prepared.FileName != "youtube-video"+strings.ToLower(extension) || prepared.Title != original.Title || prepared.VideoID != original.VideoID || prepared.RelativePath != original.RelativePath || prepared.Size != original.Size {
				t.Fatalf("supported video metadata changed: %+v", prepared)
			}
			body, err := os.ReadFile(original.Path)
			if err != nil || string(body) != "original media bytes" {
				t.Fatalf("supported source was modified or deleted: %v", err)
			}
		})
	}
}

func TestPrepareYouTubeImportRejectsInvalidSourcesAndLimits(t *testing.T) {
	original := importFormatVideo(t, "source.mp4", []byte("original media bytes"))
	for _, test := range []struct {
		name  string
		video youtubeimport.ImportedVideo
		limit int64
	}{
		{name: "output limit", video: original, limit: 3},
		{name: "invalid limit", video: original, limit: 0},
		{name: "incorrect source size", video: func() youtubeimport.ImportedVideo { value := original; value.Size++; return value }(), limit: 1024},
		{name: "unsupported format", video: func() youtubeimport.ImportedVideo { value := original; value.FileName = "not-video.txt"; return value }(), limit: 1024},
		{name: "relative path", video: func() youtubeimport.ImportedVideo { value := original; value.Path = "source.mp4"; return value }(), limit: 1024},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, cleanup, err := prepareYouTubeImport(context.Background(), test.video, test.limit)
			cleanup()
			if err == nil {
				t.Fatal("invalid source accepted")
			}
		})
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, cleanup, err := prepareYouTubeImport(ctx, original, 1024)
	cleanup()
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled import continued: %v", err)
	}
}

func importFormatTools(t *testing.T) (string, string) {
	t.Helper()
	ffmpeg := os.Getenv("SNEEPCUT_TEST_FFMPEG")
	if ffmpeg == "" {
		var err error
		ffmpeg, err = exec.LookPath("ffmpeg")
		if err != nil {
			t.Skip("ffmpeg unavailable; set SNEEPCUT_TEST_FFMPEG for native media verification")
		}
	}
	extension := filepath.Ext(ffmpeg)
	ffprobe := filepath.Join(filepath.Dir(ffmpeg), "ffprobe"+extension)
	if _, err := os.Stat(ffprobe); err != nil {
		var lookupErr error
		ffprobe, lookupErr = exec.LookPath("ffprobe")
		if lookupErr != nil {
			t.Skip("ffprobe unavailable for media verification")
		}
	}
	return ffmpeg, ffprobe
}

func runImportFormatTool(t *testing.T, executable string, arguments ...string) []byte {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	result, err := exec.CommandContext(ctx, executable, arguments...).CombinedOutput()
	if err != nil {
		t.Fatalf("media fixture tool failed: %v\n%s", err, result)
	}
	return result
}

func importFormatFixture(t *testing.T, ffmpeg, format string, audio bool) youtubeimport.ImportedVideo {
	t.Helper()
	extension, videoCodec, audioCodec := ".ts", "mpeg2video", "mp2"
	switch format {
	case "mp4":
		extension, videoCodec, audioCodec = ".m4v", "libx264", "aac"
	case "mpeg":
		extension = ".mpeg"
	case "flv":
		extension, videoCodec, audioCodec = ".flv", "libx264", "aac"
	case "asf":
		extension, videoCodec, audioCodec = ".wmv", "wmv2", "wmav2"
	}
	file := filepath.Join(t.TempDir(), "original"+extension)
	arguments := []string{"-nostdin", "-hide_banner", "-loglevel", "error", "-filter_threads", "2", "-f", "lavfi", "-i", "testsrc2=size=96x64:rate=20"}
	if audio {
		arguments = append(arguments, "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100")
	}
	arguments = append(arguments, "-t", "1.2", "-threads", "2", "-c:v", videoCodec)
	if audio {
		arguments = append(arguments, "-c:a", audioCodec, "-b:a", "64k")
	}
	arguments = append(arguments, "-f", format, file)
	runImportFormatTool(t, ffmpeg, arguments...)
	info, err := os.Stat(file)
	if err != nil {
		t.Fatal(err)
	}
	return youtubeimport.ImportedVideo{Path: file, FileName: "Original predică" + extension, RelativePath: "YouTube/videos/original" + extension, Title: "Un mesaj puternic", VideoID: "_6f6RnHmde0", Size: info.Size()}
}

type importFormatProbe struct {
	Streams []struct {
		CodecType string `json:"codec_type"`
		CodecName string `json:"codec_name"`
	} `json:"streams"`
	Format struct {
		Duration string `json:"duration"`
	} `json:"format"`
}

func probeImportFormat(t *testing.T, ffprobe, file string) importFormatProbe {
	t.Helper()
	data := runImportFormatTool(t, ffprobe, "-v", "error", "-show_entries", "stream=codec_type,codec_name:format=duration", "-of", "json", file)
	var probe importFormatProbe
	if err := json.Unmarshal(data, &probe); err != nil {
		t.Fatal(err)
	}
	return probe
}

func TestPrepareYouTubeImportConvertsOriginalFormatsWithoutTruncation(t *testing.T) {
	ffmpeg, ffprobe := importFormatTools(t)
	fixtures := map[string]youtubeimport.ImportedVideo{}
	for _, format := range []string{"mp4", "mpeg", "mpegts", "flv", "asf"} {
		fixtures[format] = importFormatFixture(t, ffmpeg, format, true)
	}
	for _, test := range []struct{ extension, format string }{{".m4v", "mp4"}, {".3gp", "mp4"}, {".mpg", "mpeg"}, {".mpeg", "mpeg"}, {".mts", "mpegts"}, {".m2ts", "mpegts"}, {".ts", "mpegts"}, {".flv", "flv"}, {".wmv", "asf"}} {
		t.Run(test.extension, func(t *testing.T) {
			original := fixtures[test.format]
			original.FileName = "Original predică" + test.extension
			prepared, cleanup, err := prepareYouTubeImportWithFFmpeg(context.Background(), original, 2<<20, ffmpeg)
			if err != nil {
				t.Fatal(err)
			}
			defer cleanup()
			if prepared.FileName != "youtube-video.mp4" || prepared.Path == original.Path || prepared.Size < 1 || prepared.Title != original.Title || prepared.VideoID != original.VideoID {
				t.Fatalf("conversion lost metadata: %+v", prepared)
			}
			info, err := os.Stat(prepared.Path)
			if err != nil || info.Size() != prepared.Size {
				t.Fatalf("converted file size inaccurate: %v", err)
			}
			probe := probeImportFormat(t, ffprobe, prepared.Path)
			videoFound, audioFound := false, false
			for _, stream := range probe.Streams {
				videoFound = videoFound || stream.CodecType == "video" && stream.CodecName == "h264"
				audioFound = audioFound || stream.CodecType == "audio" && stream.CodecName == "aac"
			}
			duration, err := strconv.ParseFloat(probe.Format.Duration, 64)
			if err != nil || duration < 1.1 || duration > 1.5 || !videoFound || !audioFound {
				t.Fatalf("converted media truncated or missing streams: duration=%s streams=%+v", probe.Format.Duration, probe.Streams)
			}
			// Decode the complete result, including final fragments and audio.
			runImportFormatTool(t, ffmpeg, "-nostdin", "-v", "error", "-xerror", "-i", prepared.Path, "-map", "0", "-f", "null", "-")
			cleanup()
			if _, err := os.Stat(prepared.Path); !os.IsNotExist(err) {
				t.Fatal("converted temporary file retained")
			}
			if _, err := os.Stat(original.Path); err != nil {
				t.Fatal("conversion deleted original source")
			}
		})
	}
}

func TestPrepareYouTubeImportConvertsSilentVideo(t *testing.T) {
	ffmpeg, ffprobe := importFormatTools(t)
	original := importFormatFixture(t, ffmpeg, "mpegts", false)
	prepared, cleanup, err := prepareYouTubeImportWithFFmpeg(context.Background(), original, 2<<20, ffmpeg)
	defer cleanup()
	if err != nil {
		t.Fatal(err)
	}
	probe := probeImportFormat(t, ffprobe, prepared.Path)
	if len(probe.Streams) != 1 || probe.Streams[0].CodecType != "video" || probe.Streams[0].CodecName != "h264" {
		t.Fatalf("optional audio handling failed: %+v", probe.Streams)
	}
}

func TestPrepareYouTubeImportConversionLimitsAndCancellationCleanUp(t *testing.T) {
	ffmpeg, _ := importFormatTools(t)
	original := importFormatFixture(t, ffmpeg, "mpegts", true)
	for _, test := range []struct {
		name       string
		limit      int64
		cancelSoon bool
	}{
		{name: "bounded output", limit: 512},
		{name: "cancel conversion", limit: 2 << 20, cancelSoon: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			ctx := context.Background()
			if test.cancelSoon {
				var cancel context.CancelFunc
				ctx, cancel = context.WithTimeout(ctx, 5*time.Millisecond)
				defer cancel()
			}
			prepared, cleanup, err := prepareYouTubeImportWithFFmpeg(ctx, original, test.limit, ffmpeg)
			cleanup()
			if err == nil || prepared.Path != "" {
				t.Fatal("incomplete conversion reported success")
			}
			if test.cancelSoon && !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("cancellation was not preserved: %v", err)
			}
			if !test.cancelSoon && !strings.Contains(err.Error(), "exceeds") {
				t.Fatalf("wrong limit error: %v", err)
			}
			entries, err := os.ReadDir(filepath.Dir(original.Path))
			if err != nil || len(entries) != 1 || entries[0].IsDir() {
				t.Fatalf("failed conversion retained temporary output: %v entries=%v", err, entries)
			}
		})
	}
}

func TestPrepareYouTubeImportDoesNotFollowLocalPlaylists(t *testing.T) {
	ffmpeg, _ := importFormatTools(t)
	original := importFormatFixture(t, ffmpeg, "mpegts", true)
	playlistPath := filepath.Join(filepath.Dir(original.Path), "playlist.m4v")
	playlist := []byte("ffconcat version 1.0\nfile '" + filepath.Base(original.Path) + "'\n")
	if err := os.WriteFile(playlistPath, playlist, 0600); err != nil {
		t.Fatal(err)
	}
	original.Path, original.FileName, original.Size = playlistPath, "playlist.m4v", int64(len(playlist))
	_, cleanup, err := prepareYouTubeImportWithFFmpeg(context.Background(), original, 2<<20, ffmpeg)
	cleanup()
	if err == nil {
		t.Fatal("video conversion followed an uploaded local-file playlist")
	}
	if strings.Contains(err.Error(), playlistPath) {
		t.Fatal("private source path leaked through conversion error")
	}
	entries, err := os.ReadDir(filepath.Dir(original.Path))
	if err != nil || len(entries) != 2 {
		t.Fatalf("rejected playlist retained conversion output: %v", err)
	}
}
