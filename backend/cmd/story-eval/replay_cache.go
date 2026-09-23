package main

import (
	"context"
	"errors"
	"io/fs"
	"math"
	"os"
	"path/filepath"
	"strings"

	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/story"
)

// Link immutable caches into a new confined storage root. LocalStorage.Save uses
// exclusive creation and the processor materializes copies before editing, so a
// replay never writes through a link or changes a prior run's artifacts.
func (r *replayRun) hydrate(ctx context.Context, destination *media.LocalStorage) error {
	source, err := media.NewLocalStorage(filepath.Join(r.directory, "media"))
	if err != nil {
		return errors.New("replay media storage could not be opened")
	}
	defer source.Close()
	root := filepath.Join(r.directory, "media")
	files := 0
	for _, namespace := range []string{"sources", "work", "clips"} {
		prefix := namespace + "/" + r.request.ID
		start, err := source.Path(prefix)
		if err != nil {
			return errors.New("replay cache namespace is not confined")
		}
		if _, err := os.Stat(start); os.IsNotExist(err) {
			continue
		}
		err = filepath.WalkDir(start, func(file string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return errors.New("replay cache could not be read")
			}
			if err := ctx.Err(); err != nil {
				return err
			}
			if entry.Type()&os.ModeSymlink != 0 {
				return errors.New("replay caches must not contain symbolic links")
			}
			if entry.IsDir() {
				return nil
			}
			info, err := entry.Info()
			if err != nil || !info.Mode().IsRegular() {
				return errors.New("replay cache must contain regular files")
			}
			files++
			if files > 100000 {
				return errors.New("replay cache exceeds the supported file count")
			}
			relative, err := filepath.Rel(root, file)
			if err != nil {
				return err
			}
			key := filepath.ToSlash(relative)
			original, err := source.Path(key)
			if err != nil {
				return errors.New("replay cache reference escapes its media root")
			}
			target, err := destination.Path(key)
			if err != nil {
				return err
			}
			if err = os.MkdirAll(filepath.Dir(target), 0700); err != nil {
				return err
			}
			if err = os.Link(original, target); err == nil {
				r.linked++
				return nil
			}
			// Different volumes or filesystems may not support hard links. The
			// ordinary storage operation is still exclusive and append-only.
			if err = destination.Save(ctx, original, key, "application/octet-stream"); err != nil {
				return errors.New("replay cache could not be copied exclusively")
			}
			r.copied++
			return nil
		})
		if err != nil {
			return err
		}
	}
	return nil
}

type sourceInspector interface {
	Inspect(context.Context, string) (story.Asset, error)
}

func (r *replayRun) verifiedRequest(ctx context.Context, inspector sourceInspector, cfg evalFlags) (story.Request, error) {
	request := r.request
	request.Options = replayOptions(request.Options, cfg)
	request.Base, request.PreviousAttempts = nil, nil
	request.Action, request.BlockID, request.CandidateID = "", "", ""
	request.VersionStart = r.highestVersion + 1
	for _, asset := range request.Assets {
		if err := ctx.Err(); err != nil {
			return story.Request{}, err
		}
		if asset.ProxyKey != "" && !strings.HasPrefix(asset.ProxyKey, "work/"+request.ID+"/analysis/"+asset.ID+"/") {
			return story.Request{}, errors.New("replay proxy is outside its source analysis namespace")
		}
		if asset.ThumbnailKey != "" && !strings.HasPrefix(asset.ThumbnailKey, "work/"+request.ID+"/analysis/"+asset.ID+"/") {
			return story.Request{}, errors.New("replay thumbnail is outside its source analysis namespace")
		}
		var fresh story.Asset
		var err error
		if asset.Kind == "narration" {
			narrator, ok := inspector.(story.NarrationInspector)
			if !ok {
				return story.Request{}, errors.New("replay inspector does not support narration")
			}
			fresh, err = narrator.InspectNarration(ctx, asset.Key)
		} else {
			fresh, err = inspector.Inspect(ctx, asset.Key)
		}
		if err != nil {
			return story.Request{}, errors.New("replay original media is missing, damaged or unsupported")
		}
		if fresh.Hash != asset.Hash || fresh.Size != asset.Size {
			return story.Request{}, errors.New("replay original media checksum does not match prior validated analysis")
		}
		if math.Abs(fresh.Duration-asset.Duration) > .001 || fresh.Width != asset.Width || fresh.Height != asset.Height || fresh.HasAudio != asset.HasAudio || math.Abs(fresh.Mapping.OriginalStart-asset.Mapping.OriginalStart) > .001 {
			return story.Request{}, errors.New("replay source timing or stream metadata does not match fresh inspection")
		}
	}
	return request, nil
}
