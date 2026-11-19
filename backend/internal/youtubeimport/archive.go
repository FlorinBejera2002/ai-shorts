package youtubeimport

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"encoding/binary"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// Limits cover the entire export, including ignored non-video entries. Defaults
// are intentionally bounded; deployments may lower them to their upload quota.
type ArchiveLimits struct {
	MaxArchiveBytes  int64
	MaxDownloadBytes int64
	MaxTotalBytes    int64
	MaxVideoBytes    int64
	MaxEntries       int
	MaxVideos        int
	MaxArchives      int
}

type ImportedVideo struct {
	Path         string
	RelativePath string
	FileName     string
	Title        string
	VideoID      string
	Size         int64
}

const maxMetadataBytes int64 = 2 << 20

func (limits ArchiveLimits) normalized() (ArchiveLimits, error) {
	defaults := ArchiveLimits{MaxArchiveBytes: 5 << 30, MaxDownloadBytes: 20 << 30, MaxTotalBytes: 20 << 30, MaxVideoBytes: 5 << 30, MaxEntries: 10000, MaxVideos: 500, MaxArchives: 64}
	if limits.MaxArchiveBytes == 0 {
		limits.MaxArchiveBytes = defaults.MaxArchiveBytes
	}
	if limits.MaxDownloadBytes == 0 {
		limits.MaxDownloadBytes = defaults.MaxDownloadBytes
	}
	if limits.MaxTotalBytes == 0 {
		limits.MaxTotalBytes = defaults.MaxTotalBytes
	}
	if limits.MaxVideoBytes == 0 {
		limits.MaxVideoBytes = defaults.MaxVideoBytes
	}
	if limits.MaxEntries == 0 {
		limits.MaxEntries = defaults.MaxEntries
	}
	if limits.MaxVideos == 0 {
		limits.MaxVideos = defaults.MaxVideos
	}
	if limits.MaxArchives == 0 {
		limits.MaxArchives = defaults.MaxArchives
	}
	if limits.MaxArchiveBytes < 1 || limits.MaxDownloadBytes < 1 || limits.MaxTotalBytes < 1 || limits.MaxVideoBytes < 1 || limits.MaxEntries < 1 || limits.MaxEntries > 100000 || limits.MaxVideos < 1 || limits.MaxVideos > 10000 || limits.MaxArchives < 1 || limits.MaxArchives > 256 || limits.MaxArchiveBytes >= 1<<60 || limits.MaxDownloadBytes >= 1<<60 || limits.MaxTotalBytes >= 1<<60 || limits.MaxVideoBytes >= 1<<60 {
		return ArchiveLimits{}, errors.New("invalid YouTube import limits")
	}
	return limits, nil
}

func newArchiveHTTPClient(injected *http.Client) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	transport.DialContext = archivePublicDial
	transport.ResponseHeaderTimeout = 45 * time.Second
	client := &http.Client{Transport: transport, Timeout: 30 * time.Minute}
	if injected != nil && injected.Transport != nil {
		// Tests may inject a transport serving synthetic archives. Production
		// supplies nil, retaining DNS pinning and public-address checks.
		client.Transport = injected.Transport
	}
	client.Jar = nil
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return client
}

func archivePublicDial(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil || port != "443" {
		return nil, errors.New("invalid Google archive address")
	}
	ips, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
	if err != nil || len(ips) == 0 {
		return nil, errors.New("Google archive address is unavailable")
	}
	for _, ip := range ips {
		if !publicArchiveIP(ip) {
			return nil, errors.New("Google archive address is not public")
		}
	}
	dialer := net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}
	for _, ip := range ips {
		connection, dialErr := dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
		if dialErr == nil {
			return connection, nil
		}
	}
	return nil, errors.New("cannot connect to Google archive storage")
}

func publicArchiveIP(ip netip.Addr) bool {
	ip = ip.Unmap()
	if !ip.IsValid() || !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
		return false
	}
	for _, prefix := range []string{"0.0.0.0/8", "100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "240.0.0.0/4", "2001:db8::/32"} {
		if netip.MustParsePrefix(prefix).Contains(ip) {
			return false
		}
	}
	return true
}

func validArchiveURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Fragment != "" || u.Opaque != "" || (u.Port() != "" && u.Port() != "443") || u.Path == "" || u.Path == "/" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if host == "storage.googleapis.com" {
		return true
	}
	if !strings.HasSuffix(host, ".storage.googleapis.com") {
		return false
	}
	bucket := strings.TrimSuffix(host, ".storage.googleapis.com")
	if bucket == "" || len(bucket) > 222 {
		return false
	}
	for _, label := range strings.Split(bucket, ".") {
		if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for _, char := range label {
			if !(char >= 'a' && char <= 'z' || char >= '0' && char <= '9' || char == '-') {
				return false
			}
		}
	}
	return true
}

type downloadedArchive struct {
	file string
	size int64
	kind string
}

type boundedZIP struct {
	*zip.Reader
	file *os.File
}

func (reader *boundedZIP) Close() error { return reader.file.Close() }

// archive/zip allocates directory entries before callers can count them. Check
// the bounded end records first, including ZIP64 used for large Google exports.
func openBoundedZIP(archive downloadedArchive, maxEntries int) (*boundedZIP, error) {
	file, err := os.Open(archive.file)
	if err != nil {
		return nil, err
	}
	failed := true
	defer func() {
		if failed {
			_ = file.Close()
		}
	}()
	tail := make([]byte, min(archive.size, int64(22+65535)))
	if _, err := file.ReadAt(tail, archive.size-int64(len(tail))); err != nil {
		return nil, errors.New("invalid ZIP end record")
	}
	end := -1
	for offset := len(tail) - 22; offset >= 0; offset-- {
		if binary.LittleEndian.Uint32(tail[offset:]) == 0x06054b50 && offset+22+int(binary.LittleEndian.Uint16(tail[offset+20:])) == len(tail) {
			end = offset
			break
		}
	}
	if end < 0 || binary.LittleEndian.Uint16(tail[end+4:]) != 0 || binary.LittleEndian.Uint16(tail[end+6:]) != 0 {
		return nil, errors.New("invalid or split ZIP archive")
	}
	count := uint64(binary.LittleEndian.Uint16(tail[end+10:]))
	directorySize := uint64(binary.LittleEndian.Uint32(tail[end+12:]))
	directoryOffset := uint64(binary.LittleEndian.Uint32(tail[end+16:]))
	if count == 0xffff || directorySize == 0xffffffff || binary.LittleEndian.Uint32(tail[end+16:]) == 0xffffffff {
		var locator [20]byte
		endOffset := archive.size - int64(len(tail)) + int64(end)
		if endOffset < 20 {
			return nil, errors.New("invalid ZIP64 locator")
		}
		if _, err := file.ReadAt(locator[:], endOffset-20); err != nil || binary.LittleEndian.Uint32(locator[:]) != 0x07064b50 || binary.LittleEndian.Uint32(locator[4:]) != 0 || binary.LittleEndian.Uint32(locator[16:]) != 1 {
			return nil, errors.New("invalid ZIP64 locator")
		}
		position := binary.LittleEndian.Uint64(locator[8:])
		if archive.size < 56 || position > uint64(archive.size-56) {
			return nil, errors.New("invalid ZIP64 end record")
		}
		var record [56]byte
		if _, err := file.ReadAt(record[:], int64(position)); err != nil || binary.LittleEndian.Uint32(record[:]) != 0x06064b50 || binary.LittleEndian.Uint32(record[16:]) != 0 || binary.LittleEndian.Uint32(record[20:]) != 0 {
			return nil, errors.New("invalid ZIP64 end record")
		}
		count = binary.LittleEndian.Uint64(record[32:])
		directorySize = binary.LittleEndian.Uint64(record[40:])
		directoryOffset = binary.LittleEndian.Uint64(record[48:])
	}
	if count > uint64(maxEntries) || directorySize > 64<<20 || directorySize > uint64(archive.size) || directoryOffset > uint64(archive.size)-directorySize {
		return nil, errors.New("ZIP directory exceeds import limits")
	}
	// A forged record count must not evade the cap: zip.NewReader intentionally
	// reads past the advertised count to support older ZIP writers.
	actualCount, cursor := uint64(0), directoryOffset
	for cursor < directoryOffset+directorySize {
		var header [46]byte
		if _, err := file.ReadAt(header[:], int64(cursor)); err != nil || binary.LittleEndian.Uint32(header[:]) != 0x02014b50 {
			return nil, errors.New("invalid ZIP directory entry")
		}
		nameBytes := uint64(binary.LittleEndian.Uint16(header[28:]))
		length := uint64(len(header)) + nameBytes + uint64(binary.LittleEndian.Uint16(header[30:])) + uint64(binary.LittleEndian.Uint16(header[32:]))
		actualCount++
		if actualCount > uint64(maxEntries) || nameBytes > 4096 || length > directoryOffset+directorySize-cursor {
			return nil, errors.New("ZIP directory exceeds import limits")
		}
		cursor += length
	}
	if actualCount != count {
		return nil, errors.New("inconsistent ZIP directory record count")
	}
	reader, err := zip.NewReader(file, archive.size)
	if err != nil {
		return nil, err
	}
	if len(reader.File) > maxEntries {
		return nil, errors.New("ZIP directory exceeds import limits")
	}
	failed = false
	return &boundedZIP{Reader: reader, file: file}, nil
}

// ImportArchives copies supported uploaded-video files from Google ZIP/tar.gz
// archives. Archive names are never used as filesystem paths. The callback must
// consume or copy each Path before returning; all temporary files are removed
// even on cancellation, malformed archives or callback failure. Successfully
// emitted videos are not rolled back when a later archive fails.
func (c *Client) ImportArchives(ctx context.Context, urls []string, tempRoot string, limits ArchiveLimits, emit func(context.Context, ImportedVideo) error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	limits, err := limits.normalized()
	if err != nil {
		return err
	}
	if len(urls) == 0 || len(urls) > limits.MaxArchives || emit == nil {
		return errors.New("invalid Google data import archive list")
	}
	for _, archiveURL := range urls {
		if !validArchiveURL(archiveURL) {
			return errors.New("Google data import returned an unsupported archive location")
		}
	}
	if !filepath.IsAbs(tempRoot) {
		return errors.New("Google data import temporary directory must be absolute")
	}
	work, err := os.MkdirTemp(tempRoot, "youtube-import-*")
	if err != nil {
		return errors.New("cannot prepare YouTube import temporary storage")
	}
	defer os.RemoveAll(work)
	archives := make([]downloadedArchive, 0, len(urls))
	var downloaded int64
	for _, archiveURL := range urls {
		archive, err := c.downloadArchive(ctx, archiveURL, work, min(limits.MaxArchiveBytes, limits.MaxDownloadBytes-downloaded))
		if err != nil {
			return err
		}
		downloaded += archive.size
		archives = append(archives, archive)
	}
	ingest := archiveIngest{ctx: ctx, work: work, limits: limits, metadata: make(map[string]videoMetadata), byTitle: make(map[string][]videoMetadata), emit: emit}
	// Gather metadata before importing video, including when Google's export is
	// split across multiple archive objects.
	for _, archive := range archives {
		if err := ingest.inspect(archive); err != nil {
			return err
		}
	}
	for _, archive := range archives {
		if err := ingest.importVideos(archive); err != nil {
			return err
		}
	}
	return nil
}

func (c *Client) downloadArchive(ctx context.Context, rawURL, work string, limit int64) (downloadedArchive, error) {
	if limit < 1 {
		return downloadedArchive{}, errors.New("YouTube export exceeds the archive download limit")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return downloadedArchive{}, errors.New("cannot prepare Google archive download")
	}
	// This deliberately uses a separate client with no cookie jar and carries no
	// OAuth Authorization header. The URL is Google's download authorization.
	response, err := c.archiveClient.Do(request)
	if err != nil {
		if ctx.Err() != nil {
			return downloadedArchive{}, ctx.Err()
		}
		return downloadedArchive{}, errors.New("Google archive download is unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return downloadedArchive{}, errors.New("Google archive download failed; authorize a new import if the export expired")
	}
	if response.ContentLength > limit {
		return downloadedArchive{}, errors.New("YouTube export exceeds the archive download limit")
	}
	file, err := os.CreateTemp(work, "archive-*")
	if err != nil {
		return downloadedArchive{}, errors.New("cannot create YouTube import temporary file")
	}
	defer file.Close()
	written, err := io.Copy(file, io.LimitReader(contextReader{ctx, response.Body}, limit+1))
	if err != nil {
		if ctx.Err() != nil {
			return downloadedArchive{}, ctx.Err()
		}
		return downloadedArchive{}, errors.New("Google archive download was interrupted")
	}
	if written > limit {
		return downloadedArchive{}, errors.New("YouTube export exceeds the archive download limit")
	}
	var magic [4]byte
	n, _ := file.ReadAt(magic[:], 0)
	kind := ""
	if n >= 4 && magic[0] == 'P' && magic[1] == 'K' && (magic[2] == 3 && magic[3] == 4 || magic[2] == 5 && magic[3] == 6) {
		kind = "zip"
	} else if n >= 2 && magic[0] == 0x1f && magic[1] == 0x8b {
		kind = "gzip"
	} else {
		return downloadedArchive{}, errors.New("Google export has an unsupported archive format")
	}
	if err := file.Close(); err != nil {
		return downloadedArchive{}, errors.New("cannot finish YouTube archive download")
	}
	return downloadedArchive{file: file.Name(), size: written, kind: kind}, nil
}

type contextReader struct {
	ctx context.Context
	r   io.Reader
}

func (reader contextReader) Read(buffer []byte) (int, error) {
	if err := reader.ctx.Err(); err != nil {
		return 0, err
	}
	return reader.r.Read(buffer)
}

type videoMetadata struct {
	id    string
	title string
}

type archiveIngest struct {
	ctx      context.Context
	work     string
	limits   ArchiveLimits
	entries  int
	videos   int
	total    int64
	metadata map[string]videoMetadata
	byTitle  map[string][]videoMetadata
	emit     func(context.Context, ImportedVideo) error
}

func safeArchiveName(name string) bool {
	if name == "" || len(name) > 4096 || strings.ContainsAny(name, "\\\x00:") || strings.HasPrefix(name, "/") {
		return false
	}
	trimmed := strings.TrimSuffix(name, "/")
	return trimmed != "" && trimmed != "." && path.Clean(trimmed) == trimmed && trimmed != ".." && !strings.HasPrefix(trimmed, "../")
}

func (i *archiveIngest) accountEntry(name string, size int64, mode os.FileMode, seen map[string]bool) error {
	if err := i.ctx.Err(); err != nil {
		return err
	}
	if !safeArchiveName(name) || (!mode.IsRegular() && !mode.IsDir()) || seen[name] {
		return errors.New("Google export contains an unsafe or duplicate archive entry")
	}
	seen[name] = true
	i.entries++
	if i.entries > i.limits.MaxEntries || size < 0 || size > i.limits.MaxTotalBytes-i.total {
		return errors.New("YouTube export exceeds the expanded archive limit")
	}
	i.total += size
	if isVideo(name) && !mode.IsDir() {
		i.videos++
		if i.videos > i.limits.MaxVideos {
			return errors.New("YouTube export contains too many videos for one import")
		}
		if size > i.limits.MaxVideoBytes {
			return errors.New("a YouTube video exceeds the maximum supported import size")
		}
	}
	return nil
}

func isVideo(name string) bool {
	switch strings.ToLower(path.Ext(name)) {
	case ".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".mpg", ".mpeg", ".3gp", ".flv", ".wmv", ".mts", ".m2ts", ".ts":
		return true
	default:
		return false
	}
}

func (i *archiveIngest) inspect(archive downloadedArchive) error {
	if archive.kind == "gzip" {
		return i.walkTar(archive, true)
	}
	reader, err := openBoundedZIP(archive, i.limits.MaxEntries)
	if err != nil {
		return errors.New("Google export ZIP archive is invalid")
	}
	defer reader.Close()
	seen := make(map[string]bool)
	for _, entry := range reader.File {
		if entry.UncompressedSize64 > uint64(i.limits.MaxTotalBytes) || entry.UncompressedSize64 > 1<<60 || entry.CompressedSize64 == 0 && entry.UncompressedSize64 > 0 || entry.CompressedSize64 > 0 && entry.UncompressedSize64/entry.CompressedSize64 > 1000 {
			return errors.New("Google export exceeds the safe archive expansion limit")
		}
		if err := i.accountEntry(entry.Name, int64(entry.UncompressedSize64), entry.Mode(), seen); err != nil {
			return err
		}
		if strings.EqualFold(path.Ext(entry.Name), ".csv") && entry.UncompressedSize64 <= uint64(maxMetadataBytes) && !entry.FileInfo().IsDir() {
			data, err := entry.Open()
			if err != nil {
				return errors.New("cannot read Google export metadata")
			}
			i.readMetadata(io.LimitReader(contextReader{i.ctx, data}, maxMetadataBytes+1))
			_ = data.Close()
		}
	}
	return nil
}

func (i *archiveIngest) importVideos(archive downloadedArchive) error {
	if archive.kind == "gzip" {
		return i.walkTar(archive, false)
	}
	reader, err := openBoundedZIP(archive, i.limits.MaxEntries)
	if err != nil {
		return errors.New("Google export ZIP archive is invalid")
	}
	defer reader.Close()
	for _, entry := range reader.File {
		if !entry.Mode().IsRegular() || !isVideo(entry.Name) {
			continue
		}
		data, err := entry.Open()
		if err != nil {
			return errors.New("cannot read a video in the Google export")
		}
		err = i.copyVideo(entry.Name, int64(entry.UncompressedSize64), data)
		_ = data.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func (i *archiveIngest) walkTar(archive downloadedArchive, inspect bool) error {
	file, err := os.Open(archive.file)
	if err != nil {
		return errors.New("cannot read Google archive temporary file")
	}
	defer file.Close()
	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		return errors.New("Google export gzip archive is invalid")
	}
	defer gzipReader.Close()
	// Include bounded tar headers/padding. This also bounds data discarded by
	// tar.Reader.Next and validates gzip checksums when the stream is drained.
	overhead := int64(i.limits.MaxEntries)*1024 + 1<<20
	maxExpanded := i.limits.MaxTotalBytes + overhead
	if archive.size < maxExpanded/1000 {
		maxExpanded = archive.size * 1000
	}
	limited := &io.LimitedReader{R: contextReader{i.ctx, gzipReader}, N: maxExpanded + 1}
	reader := tar.NewReader(limited)
	seen := make(map[string]bool)
	for {
		entry, err := reader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return errors.New("Google export tar archive is invalid")
		}
		if entry.Typeflag != tar.TypeReg && entry.Typeflag != tar.TypeRegA && entry.Typeflag != tar.TypeDir {
			return errors.New("Google export contains unsupported linked or special files")
		}
		if inspect {
			if err := i.accountEntry(entry.Name, entry.Size, entry.FileInfo().Mode(), seen); err != nil {
				return err
			}
			if strings.EqualFold(path.Ext(entry.Name), ".csv") && entry.Size <= maxMetadataBytes && entry.Typeflag != tar.TypeDir {
				i.readMetadata(io.LimitReader(reader, maxMetadataBytes+1))
			}
		} else if entry.Typeflag != tar.TypeDir && isVideo(entry.Name) {
			if err := i.copyVideo(entry.Name, entry.Size, reader); err != nil {
				return err
			}
		}
	}
	if _, err := io.Copy(io.Discard, limited); err != nil {
		return errors.New("Google export gzip stream is invalid")
	}
	if limited.N == 0 {
		return errors.New("Google export exceeds the safe archive expansion limit")
	}
	return nil
}

var videoIDPattern = regexp.MustCompile(`(?:^|[\[ (\-])([A-Za-z0-9_-]{11})(?:[\])])?$`)

func (i *archiveIngest) copyVideo(name string, expectedSize int64, input io.Reader) error {
	if err := i.ctx.Err(); err != nil {
		return err
	}
	file, err := os.CreateTemp(i.work, "video-*"+strings.ToLower(path.Ext(name)))
	if err != nil {
		return errors.New("cannot create imported video temporary file")
	}
	defer os.Remove(file.Name())
	written, copyErr := io.Copy(file, io.LimitReader(contextReader{i.ctx, input}, i.limits.MaxVideoBytes+1))
	closeErr := file.Close()
	if i.ctx.Err() != nil {
		return i.ctx.Err()
	}
	if copyErr != nil || closeErr != nil || written != expectedSize {
		return errors.New("a video in the Google export is incomplete or corrupt")
	}
	if written > i.limits.MaxVideoBytes {
		return errors.New("a YouTube video exceeds the maximum supported import size")
	}
	fileName := path.Base(name)
	stem := strings.TrimSuffix(fileName, path.Ext(fileName))
	metadata := videoMetadata{title: stem}
	if match := videoIDPattern.FindStringSubmatch(stem); len(match) == 2 {
		metadata.id = match[1]
		if found, exists := i.metadata[metadata.id]; exists {
			metadata = found
		}
	} else if found := i.byTitle[stem]; len(found) == 1 {
		metadata = found[0]
	}
	if strings.TrimSpace(metadata.title) == "" {
		metadata.title = "YouTube video"
	}
	video := ImportedVideo{Path: file.Name(), RelativePath: name, FileName: fileName, Title: metadata.title, VideoID: metadata.id, Size: written}
	if err := i.emit(i.ctx, video); err != nil {
		return fmt.Errorf("cannot save imported YouTube video: %w", err)
	}
	return nil
}

func normalizeCSVHeader(value string) string {
	value = strings.TrimPrefix(value, "\ufeff")
	return strings.ToLower(strings.Join(strings.Fields(strings.NewReplacer("_", " ", "-", " ").Replace(value)), " "))
}

func (i *archiveIngest) readMetadata(input io.Reader) {
	reader := csv.NewReader(input)
	reader.FieldsPerRecord = -1
	header, err := reader.Read()
	if err != nil {
		return
	}
	idIndex, titleIndex := -1, -1
	for index, column := range header {
		switch normalizeCSVHeader(column) {
		case "video id":
			idIndex = index
		case "video title (original)", "video title", "title":
			titleIndex = index
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
		metadata := videoMetadata{id: id, title: title}
		if _, exists := i.metadata[id]; !exists {
			if len(i.metadata) >= i.limits.MaxEntries {
				return
			}
			i.byTitle[title] = append(i.byTitle[title], metadata)
		}
		i.metadata[id] = metadata
	}
}
