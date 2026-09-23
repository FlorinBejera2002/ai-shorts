package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/story"
)

func ingestEvaluationNarration(ctx context.Context, filename, project string, inspector story.NarrationInspector, storage *media.LocalStorage) (story.Asset, sourceProvenance, error) {
	var asset story.Asset
	var provenance sourceProvenance
	file, err := filepath.Abs(filename)
	if err != nil {
		return asset, provenance, err
	}
	stat, err := os.Lstat(file)
	if err != nil || !stat.Mode().IsRegular() || stat.Size() <= 0 || stat.Size() > story.MaxNarrationBytes {
		return asset, provenance, errors.New("narration must be a regular audio file up to 32 MiB")
	}
	suffix := strings.ToLower(filepath.Ext(file))
	switch suffix {
	case ".webm", ".m4a", ".mp4", ".mp3", ".wav", ".ogg", ".opus":
	default:
		return asset, provenance, errors.New("unsupported narration audio extension")
	}
	key := "sources/" + project + "/narration" + suffix
	if err = storage.Save(ctx, file, key, "application/octet-stream"); err != nil {
		return asset, provenance, err
	}
	asset, err = inspector.InspectNarration(ctx, key)
	if err != nil {
		return asset, provenance, err
	}
	asset.ID, asset.Kind, asset.Name, asset.Include = "narration", "narration", filepath.Base(file), "auto"
	return asset, sourceProvenance{OriginalPath: file, AssetID: asset.ID, StorageKey: key, SHA256: asset.Hash, Bytes: asset.Size}, nil
}
