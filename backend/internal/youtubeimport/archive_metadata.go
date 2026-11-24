package youtubeimport

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"regexp"
	"strings"
)

// videoIDPattern finds a YouTube id at the end of a file stem, such as
// "Title [dQw4w9WgXcQ]" or "dQw4w9WgXcQ".
var videoIDPattern = regexp.MustCompile(`(?:^|[\[ (\-])([A-Za-z0-9_-]{11})(?:[\])])?$`)

// unsafeFileNameChars are replaced when a title becomes a file name stem.
var unsafeFileNameChars = regexp.MustCompile(`[/\:*?"<>|\x00-\x1f\x7f]`)

// fileStemFor is the file-name stem Google's export is assumed to use for a
// title: unsafe characters become underscores. Titles are matched by this stem.
func fileStemFor(title string) string {
	return strings.TrimSpace(unsafeFileNameChars.ReplaceAllString(title, "_"))
}

// describe resolves an archive entry to its video metadata without reading its
// bytes, so callers can skip unselected videos. Order of precedence: the
// metadata's own file reference, a YouTube id in the file name, then a unique
// title match. A title shared by several metadata rows is marked Ambiguous and
// keeps no id, so nothing is guessed.
func (i *archiveIngest) describe(name string, size int64) ImportedVideo {
	fileName := path.Base(name)
	stem := strings.TrimSuffix(fileName, path.Ext(fileName))
	video := ImportedVideo{RelativePath: name, FileName: fileName, Title: stem, Size: size}
	if found, exists := i.byFile[fileName]; exists {
		video.VideoID, video.Title = found.id, found.title
	} else if found, exists := i.metadataIDInStem(stem); exists {
		video.VideoID, video.Title = found.id, found.title
	} else if found := i.byTitle[stem]; len(found) == 1 {
		video.VideoID, video.Title = found[0].id, found[0].title
	} else if len(found) > 1 {
		video.Ambiguous = true
	} else if match := videoIDPattern.FindStringSubmatch(stem); len(match) == 2 {
		// An id-shaped name with no metadata row keeps the id, as before.
		video.VideoID = match[1]
	}
	if strings.TrimSpace(video.Title) == "" {
		video.Title = "YouTube video"
	}
	return video
}

// metadataIDInStem returns the metadata row named by a YouTube id at the end of
// the stem. The id is trusted only when the export's metadata has that row, so a
// title that ends in an 11-letter word is not mistaken for an id.
func (i *archiveIngest) metadataIDInStem(stem string) (videoMetadata, bool) {
	match := videoIDPattern.FindStringSubmatch(stem)
	if len(match) != 2 {
		return videoMetadata{}, false
	}
	found, exists := i.metadata[match[1]]
	return found, exists
}

// wants reports whether the selector chose this video. Without a selector every
// video is wanted.
func (i *archiveIngest) wants(video ImportedVideo) bool {
	return i.selector == nil || i.selector.Wants(video)
}

// describeCandidates resolves every video entry seen during inspection. It runs
// once all metadata is read, so titles and ids are final.
func (i *archiveIngest) describeCandidates() []ImportedVideo {
	videos := make([]ImportedVideo, 0, len(i.candidates))
	for _, candidate := range i.candidates {
		videos = append(videos, i.describe(candidate.name, candidate.size))
	}
	return videos
}

// copyVideo streams one selected video into a temporary file, checking its size
// against the archive's declared size, then hands it to emit.
func (i *archiveIngest) copyVideo(video ImportedVideo, input io.Reader) error {
	if err := i.ctx.Err(); err != nil {
		return err
	}
	file, err := os.CreateTemp(i.work, "video-*"+strings.ToLower(path.Ext(video.FileName)))
	if err != nil {
		return errors.New("cannot create imported video temporary file")
	}
	defer os.Remove(file.Name())
	written, copyErr := io.Copy(file, io.LimitReader(contextReader{i.ctx, input}, i.limits.MaxVideoBytes+1))
	closeErr := file.Close()
	if i.ctx.Err() != nil {
		return i.ctx.Err()
	}
	if copyErr != nil || closeErr != nil || written != video.Size {
		return errors.New("a video in the Google export is incomplete or corrupt")
	}
	if written > i.limits.MaxVideoBytes {
		return errors.New("a YouTube video exceeds the maximum supported import size")
	}
	video.Path, video.Size = file.Name(), written
	if err := i.emit(i.ctx, video); err != nil {
		return fmt.Errorf("cannot save imported YouTube video: %w", err)
	}
	return nil
}

func normalizeCSVHeader(value string) string {
	value = strings.TrimPrefix(value, string(rune(0xFEFF)))
	return strings.ToLower(strings.Join(strings.Fields(strings.NewReplacer("_", " ", "-", " ").Replace(value)), " "))
}

// fileReferenceColumns name a metadata column that gives the export file a row
// describes. Google's layout is not verified here; the column is used only when present.
var fileReferenceColumns = map[string]bool{"file name": true, "filename": true, "video file": true, "video file name": true}

// readMetadata records id and title rows from a video metadata CSV. Rows with an
// unusable id or an empty title are ignored.
func (i *archiveIngest) readMetadata(input io.Reader) {
	reader := csv.NewReader(input)
	reader.FieldsPerRecord = -1
	header, err := reader.Read()
	if err != nil {
		return
	}
	idIndex, titleIndex, fileIndex := -1, -1, -1
	for index, column := range header {
		normalized := normalizeCSVHeader(column)
		switch {
		case normalized == "video id":
			idIndex = index
		case normalized == "video title (original)" || normalized == "video title" || normalized == "title":
			titleIndex = index
		case fileReferenceColumns[normalized]:
			fileIndex = index
		}
	}
	if idIndex < 0 || titleIndex < 0 {
		return
	}
	for count := 0; count < i.limits.MaxEntries; count++ {
		row, err := reader.Read()
		if err != nil {
			return
		}
		if idIndex >= len(row) || titleIndex >= len(row) {
			continue
		}
		id, title := strings.TrimSpace(row[idIndex]), strings.TrimSpace(row[titleIndex])
		if len(id) != 11 || !videoIDPattern.MatchString(id) || title == "" || len(title) > 4096 {
			continue
		}
		if len(i.metadata) >= i.limits.MaxEntries {
			return
		}
		metadata := videoMetadata{id: id, title: title}
		if _, exists := i.metadata[id]; !exists {
			stem := fileStemFor(title)
			i.byTitle[stem] = append(i.byTitle[stem], metadata)
		}
		i.metadata[id] = metadata
		if fileIndex >= 0 && fileIndex < len(row) {
			if base := path.Base(strings.TrimSpace(row[fileIndex])); base != "." && base != "/" {
				if _, exists := i.byFile[base]; !exists {
					i.byFile[base] = metadata
				}
			}
		}
	}
}
