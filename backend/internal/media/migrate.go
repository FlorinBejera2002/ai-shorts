package media

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path"
	"strings"
	"time"
)

type MigrationResult struct {
	Copied, Existing int
	Bytes            int64
}

// MigrateLocal preserves keys and originals. A retry accepts existing objects
// only after verifying their bytes; it never replaces a conflicting object.
// Callers must stop local file writers for the duration of the migration.
func MigrateLocal(ctx context.Context, source *LocalStorage, destination Storage) (MigrationResult, error) {
	var result MigrationResult
	var keys []string
	err := fs.WalkDir(source.root.FS(), ".", func(key string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if key == "." {
			return nil
		}
		if !validKey(key) || entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("unsupported local media entry: %q", key)
		}
		if entry.IsDir() {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("unsupported local media entry: %q", key)
		}
		keys = append(keys, key)
		return nil
	})
	if err != nil {
		return result, err
	}
	client := &http.Client{
		Timeout: 10 * time.Minute,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return errors.New("unexpected storage redirect")
		},
	}
	for _, key := range keys {
		if err := ctx.Err(); err != nil {
			return result, err
		}
		filename, err := source.Path(key)
		if err != nil {
			return result, err
		}
		before, size, err := hashLocal(ctx, source, key)
		if err != nil {
			return result, err
		}
		exists, err := destination.Exists(ctx, key)
		if err != nil {
			return result, fmt.Errorf("inspect destination for %q: %w", key, err)
		}
		if !exists {
			contentType := mime.TypeByExtension(strings.ToLower(path.Ext(key)))
			if contentType == "" {
				contentType = "application/octet-stream"
			}
			if err := destination.Save(ctx, filename, key, contentType); err != nil {
				return result, fmt.Errorf("copy %q without overwrite: %w", key, err)
			}
		}
		address, err := destination.SignedURL(ctx, key, 10*time.Minute)
		if err != nil || address == "" {
			return result, fmt.Errorf("cannot verify destination for %q", key)
		}
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
		if err != nil {
			return result, fmt.Errorf("cannot verify destination for %q", key)
		}
		response, err := client.Do(request)
		if err != nil {
			// Do not expose presigned credentials through an HTTP URL error.
			return result, fmt.Errorf("destination download failed for %q", key)
		}
		hash := sha256.New()
		n, copyErr := io.Copy(hash, io.LimitReader(response.Body, size+1))
		response.Body.Close()
		if response.StatusCode != http.StatusOK || copyErr != nil || n != size || hex.EncodeToString(hash.Sum(nil)) != before {
			return result, fmt.Errorf("destination bytes differ for %q; originals were preserved", key)
		}
		after, afterSize, err := hashLocal(ctx, source, key)
		if err != nil || before != after || size != afterSize {
			return result, fmt.Errorf("local media changed during migration: %q", key)
		}
		if exists {
			result.Existing++
		} else {
			result.Copied++
		}
		result.Bytes += size
	}
	return result, nil
}

func hashLocal(ctx context.Context, source *LocalStorage, key string) (string, int64, error) {
	if err := source.check(key); err != nil {
		return "", 0, err
	}
	file, err := source.root.Open(key)
	if err != nil {
		return "", 0, err
	}
	defer file.Close()
	hash := sha256.New()
	size, err := io.Copy(hash, &contextReader{ctx: ctx, r: file})
	return hex.EncodeToString(hash.Sum(nil)), size, err
}
