// Package media owns stable media references, secure upload ingestion and storage.
package media

import (
	"context"
	"errors"
	"io"
	"io/fs"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

var ErrInvalidKey = errors.New("invalid storage reference")

type Storage interface {
	Save(context.Context, string, string, string) error // staged local filename, stable key, content type
	Exists(context.Context, string) (bool, error)
	Size(context.Context, string) (int64, error)
	Delete(context.Context, string) error
	DeletePrefix(context.Context, string) (int, error)
	SignedURL(context.Context, string, time.Duration) (string, error)
}

// Keys are unambiguous relative paths. Reject escaped separators and dot paths
// rather than cleaning them into another user's namespace.
func validKey(key string) bool {
	if key == "" || len(key) > 2048 || strings.ContainsAny(key, "\\%?#:\x00") || strings.HasPrefix(key, "/") {
		return false
	}
	for _, c := range key {
		if c < 32 || c == 127 {
			return false
		}
	}
	for _, part := range strings.Split(key, "/") {
		if part == "" || part == "." || part == ".." {
			return false
		}
	}
	return true
}

func keyFromReference(reference, localRoot, publicBase, appURL string) (string, error) {
	if reference == "" || strings.TrimSpace(reference) != reference {
		return "", ErrInvalidKey
	}
	value := reference
	// Native Windows upload responses contain an absolute drive path. Convert
	// only a path inside this exact configured root; relative backslashes,
	// traversal and foreign drives must never become accepted storage keys.
	if filepath.IsAbs(value) && filepath.VolumeName(value) != "" && filepath.IsAbs(localRoot) && filepath.VolumeName(localRoot) != "" {
		root := strings.TrimRight(filepath.ToSlash(localRoot), "/") + "/"
		absolute := filepath.ToSlash(value)
		if len(absolute) <= len(root) || !strings.EqualFold(absolute[:len(root)], root) {
			return "", ErrInvalidKey
		}
		value = absolute[len(root):]
		if !validKey(value) {
			return "", ErrInvalidKey
		}
		return value, nil
	}
	if strings.Contains(value, "\\") {
		return "", ErrInvalidKey
	}
	if strings.HasPrefix(value, "http://") || strings.HasPrefix(value, "https://") {
		u, err := url.Parse(value)
		if err != nil || u.User != nil || u.Fragment != "" {
			return "", ErrInvalidKey
		}
		matched := false
		for _, baseValue := range []string{publicBase, strings.TrimRight(appURL, "/") + "/media"} {
			base, err := url.Parse(baseValue)
			if err != nil || base.Host == "" || u.Scheme != base.Scheme || u.Host != base.Host {
				continue
			}
			prefix := strings.TrimRight(base.EscapedPath(), "/") + "/"
			if !strings.HasPrefix(u.EscapedPath(), prefix) {
				continue
			}
			value = strings.TrimPrefix(u.EscapedPath(), prefix)
			matched = true
			break
		}
		if !matched {
			return "", ErrInvalidKey
		}
	} else if strings.HasPrefix(value, "/media/") || strings.HasPrefix(value, "media/") {
		value = strings.SplitN(value, "?", 2)[0]
		value = strings.TrimPrefix(strings.TrimPrefix(value, "/"), "media/")
	} else if localRoot != "" && strings.HasPrefix(value, strings.TrimRight(localRoot, "/")+"/") {
		value = strings.TrimPrefix(value, strings.TrimRight(localRoot, "/")+"/")
	}
	if !validKey(value) {
		return "", ErrInvalidKey
	}
	return value, nil
}

type LocalStorage struct {
	root      *os.Root
	directory string
}

func NewLocalStorage(directory string) (*LocalStorage, error) {
	absolute, err := filepath.Abs(directory)
	if err != nil || directory == "" {
		return nil, ErrInvalidKey
	}
	if err := os.MkdirAll(absolute, 0750); err != nil {
		return nil, err
	}
	absolute, err = filepath.EvalSymlinks(absolute)
	if err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(absolute)
	if err != nil {
		return nil, err
	}
	return &LocalStorage{root: root, directory: absolute}, nil
}
func (s *LocalStorage) Close() error { return s.root.Close() }

func (s *LocalStorage) check(key string) error {
	if !validKey(key) {
		return ErrInvalidKey
	}
	parts := strings.Split(key, "/")
	for i := range parts {
		info, err := s.root.Lstat(strings.Join(parts[:i+1], "/"))
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return ErrInvalidKey
		}
	}
	return nil
}
func (s *LocalStorage) Path(key string) (string, error) {
	if err := s.check(key); err != nil {
		return "", err
	}
	return filepath.Join(s.directory, filepath.FromSlash(key)), nil
}

func (s *LocalStorage) Save(ctx context.Context, source, key, contentType string) (err error) {
	if err = ctx.Err(); err != nil {
		return err
	}
	if err = s.check(key); err != nil {
		return err
	}
	parts := strings.Split(path.Dir(key), "/")
	for i := range parts {
		if parts[i] == "." {
			continue
		}
		if err = s.root.Mkdir(strings.Join(parts[:i+1], "/"), 0750); err != nil && !errors.Is(err, fs.ErrExist) {
			return err
		}
	}
	if err = s.check(key); err != nil {
		return err
	}
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	// Source is scanned before publication. Exclusive creation prevents overwrite
	// of an existing key, and failed copies remove their inaccessible random key.
	out, err := s.root.OpenFile(key, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0640)
	if err != nil {
		return err
	}
	defer func() {
		out.Close()
		if err != nil {
			_ = s.root.Remove(key)
		}
	}()
	_, err = io.Copy(out, &contextReader{ctx: ctx, r: in})
	if err != nil {
		return err
	}
	if err = out.Sync(); err != nil {
		return err
	}
	return out.Close()
}
func (s *LocalStorage) Exists(ctx context.Context, key string) (bool, error) {
	if err := s.check(key); err != nil {
		return false, err
	}
	info, err := s.root.Stat(key)
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return info.Mode().IsRegular(), ctx.Err()
}
func (s *LocalStorage) Size(ctx context.Context, key string) (int64, error) {
	if err := ctx.Err(); err != nil {
		return 0, err
	}
	if err := s.check(key); err != nil {
		return 0, err
	}
	info, err := s.root.Stat(key)
	if err != nil {
		return 0, err
	}
	if !info.Mode().IsRegular() {
		return 0, ErrInvalidKey
	}
	return info.Size(), nil
}
func (s *LocalStorage) Delete(ctx context.Context, key string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := s.check(key); err != nil {
		return err
	}
	err := s.root.Remove(key)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	return err
}
func (s *LocalStorage) DeletePrefix(ctx context.Context, prefix string) (int, error) {
	prefix = strings.TrimSuffix(prefix, "/")
	if err := s.check(prefix); err != nil {
		return 0, err
	}
	var names []string
	count := 0
	err := fs.WalkDir(s.root.FS(), prefix, func(name string, entry fs.DirEntry, err error) error {
		if errors.Is(err, fs.ErrNotExist) && name == prefix {
			return nil
		}
		if err != nil {
			return err
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return ErrInvalidKey
		}
		names = append(names, name)
		if !entry.IsDir() {
			count++
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	for i := len(names) - 1; i >= 0; i-- {
		if err := s.root.Remove(names[i]); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return 0, err
		}
	}
	return count, nil
}
func (s *LocalStorage) SignedURL(ctx context.Context, key string, ttl time.Duration) (string, error) {
	return "", s.check(key)
}

type contextReader struct {
	ctx context.Context
	r   io.Reader
}

func (r *contextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.r.Read(p)
}
