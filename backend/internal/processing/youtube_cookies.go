package processing

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// maximumCookieJarBytes bounds a cookie jar read back from yt-dlp.
const maximumCookieJarBytes = 1 << 20

// youtubeCookieStateMu serializes writes to the refreshed cookie state file
// between concurrent downloads in this worker.
var youtubeCookieStateMu sync.Mutex

type youtubeCookieSnapshot struct {
	info      os.FileInfo
	digest    [sha256.Size]byte
	oversized bool
}

type youtubeCookieSession struct {
	path           string
	fromState      bool
	exportSnapshot *youtubeCookieSnapshot
	stateSnapshot  *youtubeCookieSnapshot
}

// privateYouTubeCookies copies the current YouTube session into the job
// directory because yt-dlp rewrites its cookie jar on exit; the provisioned
// export stays read-only. The refreshed state file is preferred unless the
// export was replaced after it was written. It returns nil when no session is
// available, so downloads fall back to public access. The snapshots fence
// subsequent invalidation and persistence against concurrent replacements.
func (p *Processor) privateYouTubeCookies(dir string) (*youtubeCookieSession, error) {
	export, state := p.cfg.YouTubeCookiesFile, p.cfg.YouTubeCookiesStateFile
	if export == "" {
		return nil, nil
	}
	youtubeCookieStateMu.Lock()
	defer youtubeCookieStateMu.Unlock()
	exportData, exportSnapshot, exportErr := readYouTubeCookieJar(export)
	stateData, stateSnapshot, stateErr := readYouTubeCookieJar(state)
	session := &youtubeCookieSession{
		path:           filepath.Join(dir, "youtube-cookies.txt"),
		exportSnapshot: exportSnapshot,
		stateSnapshot:  stateSnapshot,
	}
	data := exportData
	if stateErr == nil && hasYouTubeSession(stateData) && (exportErr != nil || !exportSnapshot.info.ModTime().After(stateSnapshot.info.ModTime())) {
		data = stateData
		session.fromState = true
	} else if errors.Is(exportErr, fs.ErrNotExist) {
		return nil, nil
	} else if exportErr != nil {
		return nil, exportErr
	}
	if err := copyBounded(bytes.NewReader(data), session.path); err != nil {
		return nil, err
	}
	return session, nil
}

// privateYouTubeExportAfterRejection discards only the saved session actually
// rejected by this attempt, then reads the latest provisioned export for one retry.
func (p *Processor) privateYouTubeExportAfterRejection(dir string, rejected *youtubeCookieSession) (*youtubeCookieSession, error) {
	if !rejected.fromState {
		return nil, nil
	}
	youtubeCookieStateMu.Lock()
	defer youtubeCookieStateMu.Unlock()
	stateSnapshot := rejected.stateSnapshot
	if matchesYouTubeCookieSnapshot(p.cfg.YouTubeCookiesStateFile, stateSnapshot) {
		if err := os.Remove(p.cfg.YouTubeCookiesStateFile); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return nil, err
		}
		stateSnapshot = &youtubeCookieSnapshot{}
	}
	data, exportSnapshot, err := readYouTubeCookieJar(p.cfg.YouTubeCookiesFile)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	session := &youtubeCookieSession{
		path:           filepath.Join(dir, "youtube-cookies-retry.txt"),
		exportSnapshot: exportSnapshot,
		stateSnapshot:  stateSnapshot,
	}
	if err := copyBounded(bytes.NewReader(data), session.path); err != nil {
		return nil, err
	}
	return session, nil
}

func readYouTubeCookieJar(path string) ([]byte, *youtubeCookieSnapshot, error) {
	f, err := os.Open(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, &youtubeCookieSnapshot{}, err
		}
		return nil, nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, maximumCookieJarBytes+1))
	if err != nil {
		return nil, nil, err
	}
	info, err := f.Stat()
	if err != nil {
		return nil, nil, err
	}
	snapshot := &youtubeCookieSnapshot{info: info, digest: sha256.Sum256(data), oversized: len(data) > maximumCookieJarBytes}
	if snapshot.oversized {
		return nil, snapshot, fmt.Errorf("cookie jar exceeds %d bytes", maximumCookieJarBytes)
	}
	return data, snapshot, nil
}

func matchesYouTubeCookieSnapshot(path string, expected *youtubeCookieSnapshot) bool {
	if expected == nil {
		return false
	}
	_, current, err := readYouTubeCookieJar(path)
	if expected.info == nil {
		return errors.Is(err, fs.ErrNotExist)
	}
	return current != nil && (err == nil || expected.oversized && current.oversized) && current.info != nil &&
		os.SameFile(expected.info, current.info) && expected.info.Size() == current.info.Size() &&
		expected.info.ModTime().Equal(current.info.ModTime()) && expected.digest == current.digest
}

// saveRefreshedYouTubeCookies atomically replaces the state file with the
// job's cookie jar when it still holds an authenticated YouTube session.
func (p *Processor) saveRefreshedYouTubeCookies(session *youtubeCookieSession) error {
	state := p.cfg.YouTubeCookiesStateFile
	if state == "" || p.cfg.YouTubeCookiesFile == "" {
		return nil
	}
	data, _, err := readYouTubeCookieJar(session.path)
	if err != nil {
		return err
	}
	if !hasYouTubeSession(data) {
		return nil
	}
	youtubeCookieStateMu.Lock()
	defer youtubeCookieStateMu.Unlock()
	// An older in-flight request must not supersede a new export or another
	// request's refreshed session, even if both jars still look authenticated.
	if !matchesYouTubeCookieSnapshot(p.cfg.YouTubeCookiesFile, session.exportSnapshot) ||
		!matchesYouTubeCookieSnapshot(state, session.stateSnapshot) {
		return nil
	}
	temp, err := os.CreateTemp(filepath.Dir(state), ".youtube-cookies-*")
	if err != nil {
		return err
	}
	defer os.Remove(temp.Name())
	if err := temp.Chmod(0600); err != nil {
		temp.Close()
		return err
	}
	if _, err := temp.Write(data); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	return os.Rename(temp.Name(), state)
}

// hasYouTubeSession follows yt-dlp's authentication check: LOGIN_INFO and an
// APISID-family cookie must apply to https://www.youtube.com/ and be unexpired.
func hasYouTubeSession(data []byte) bool {
	var loginInfo, apiSID bool
	now := time.Now().Unix()
	scanner := bufio.NewScanner(bytes.NewReader(data))
	scanner.Buffer(make([]byte, 0, 64<<10), maximumCookieJarBytes)
	for scanner.Scan() {
		// yt-dlp writes HttpOnly cookies with a "#HttpOnly_" domain prefix.
		line := strings.TrimPrefix(scanner.Text(), "#HttpOnly_")
		fields := strings.Split(line, "\t")
		if len(fields) != 7 || strings.HasPrefix(line, "#") {
			continue
		}
		if (fields[1] != "TRUE" && fields[1] != "FALSE") || (fields[3] != "TRUE" && fields[3] != "FALSE") {
			continue
		}
		domain := strings.TrimPrefix(strings.ToLower(fields[0]), ".")
		if (domain != "youtube.com" && domain != "www.youtube.com") || fields[2] != "/" || strings.TrimSpace(fields[6]) == "" {
			continue
		}
		// yt-dlp treats an empty expiry or zero as a session cookie.
		if fields[4] != "" {
			expires, err := strconv.ParseInt(fields[4], 10, 64)
			if err != nil || (expires != 0 && expires <= now) {
				continue
			}
		}
		switch fields[5] {
		case "LOGIN_INFO":
			loginInfo = true
		case "SAPISID", "__Secure-1PAPISID", "__Secure-3PAPISID":
			apiSID = true
		}
	}
	return scanner.Err() == nil && loginInfo && apiSID
}
