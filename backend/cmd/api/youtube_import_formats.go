package main

import (
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"sneepcut/backend-go/internal/youtubeimport"
)

// prepareYouTubeImport retains display metadata while giving storage a short,
// safe name. Google can export original formats that ordinary uploads do not
// accept, so those sources are normalized before entering the upload pipeline.
func prepareYouTubeImport(ctx context.Context, video youtubeimport.ImportedVideo, maxBytes int64) (youtubeimport.ImportedVideo, func(), error) {
	return prepareYouTubeImportWithFFmpeg(ctx, video, maxBytes, "ffmpeg")
}

func prepareYouTubeImportWithFFmpeg(ctx context.Context, video youtubeimport.ImportedVideo, maxBytes int64, ffmpegPath string) (youtubeimport.ImportedVideo, func(), error) {
	noop := func() {}
	if err := ctx.Err(); err != nil {
		return youtubeimport.ImportedVideo{}, noop, err
	}
	if maxBytes < 1 || maxBytes >= 1<<60 || !filepath.IsAbs(video.Path) {
		return youtubeimport.ImportedVideo{}, noop, errors.New("invalid YouTube video import limits or path")
	}
	info, err := os.Lstat(video.Path)
	if err != nil || !info.Mode().IsRegular() || info.Size() < 1 || info.Size() != video.Size {
		return youtubeimport.ImportedVideo{}, noop, errors.New("YouTube source video is missing or incomplete")
	}
	extension := strings.ToLower(filepath.Ext(video.FileName))
	prepared := video
	switch extension {
	case ".mp4", ".mov", ".avi", ".mkv", ".webm":
		if video.Size > maxBytes {
			return youtubeimport.ImportedVideo{}, noop, errors.New("YouTube video exceeds the maximum supported import size")
		}
		prepared.FileName = "youtube-video" + extension
		return prepared, noop, nil
	case ".m4v", ".mpg", ".mpeg", ".3gp", ".flv", ".wmv", ".mts", ".m2ts", ".ts":
	default:
		return youtubeimport.ImportedVideo{}, noop, errors.New("YouTube source has an unsupported video format")
	}
	if ffmpegPath == "" {
		return youtubeimport.ImportedVideo{}, noop, errors.New("YouTube video conversion is unavailable")
	}
	directory, err := os.MkdirTemp(filepath.Dir(video.Path), "youtube-format-*")
	if err != nil {
		return youtubeimport.ImportedVideo{}, noop, errors.New("cannot prepare YouTube video conversion storage")
	}
	cleanup := func() { _ = os.RemoveAll(directory) }
	success := false
	defer func() {
		if !success {
			cleanup()
		}
	}()
	outputPath := filepath.Join(directory, "video.mp4")
	output, err := os.OpenFile(outputPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return youtubeimport.ImportedVideo{}, noop, errors.New("cannot create converted YouTube video")
	}
	defer output.Close()
	conversion, cancel := context.WithTimeout(ctx, 20*time.Minute)
	defer cancel()
	command := exec.CommandContext(conversion, ffmpegPath,
		"-nostdin", "-hide_banner", "-loglevel", "error", "-nostats",
		"-threads", "2", "-filter_threads", "2", "-filter_complex_threads", "2",
		"-protocol_whitelist", "file,pipe",
		"-format_whitelist", "mov,m4v,mpeg,mpegts,asf,flv",
		"-i", video.Path,
		"-map", "0:V:0", "-map", "0:a:0?", "-sn", "-dn",
		"-map_metadata", "-1", "-map_chapters", "-1",
		"-threads", "2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
		"-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-pix_fmt", "yuv420p",
		"-c:a", "aac", "-b:a", "160k",
		"-movflags", "+frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", "pipe:1",
	)
	command.Stderr = io.Discard
	command.WaitDelay = 5 * time.Second
	stdout, err := command.StdoutPipe()
	if err != nil {
		return youtubeimport.ImportedVideo{}, noop, errors.New("cannot prepare YouTube video conversion")
	}
	defer stdout.Close()
	if err := command.Start(); err != nil {
		if conversion.Err() != nil {
			return youtubeimport.ImportedVideo{}, noop, conversion.Err()
		}
		return youtubeimport.ImportedVideo{}, noop, errors.New("YouTube video conversion is unavailable")
	}
	written, copyErr := io.Copy(output, io.LimitReader(stdout, maxBytes+1))
	if copyErr != nil || written > maxBytes {
		_ = command.Process.Kill()
	}
	waitErr := command.Wait()
	closeErr := output.Close()
	if conversion.Err() != nil {
		return youtubeimport.ImportedVideo{}, noop, conversion.Err()
	}
	if written > maxBytes {
		return youtubeimport.ImportedVideo{}, noop, errors.New("converted YouTube video exceeds the maximum supported import size")
	}
	if copyErr != nil || waitErr != nil || closeErr != nil || written == 0 {
		return youtubeimport.ImportedVideo{}, noop, errors.New("YouTube video could not be converted to MP4")
	}
	prepared.Path = outputPath
	prepared.FileName = "youtube-video.mp4"
	prepared.Size = written
	success = true
	return prepared, cleanup, nil
}
