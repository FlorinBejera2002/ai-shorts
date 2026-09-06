package media

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
var noncePattern = regexp.MustCompile(`^[0-9a-f]{32}$`)
var videoExtensions = map[string]bool{".mp4": true, ".mov": true, ".avi": true, ".mkv": true, ".webm": true}
var videoContentTypes = map[string]bool{"video/mp4": true, "video/quicktime": true, "video/x-msvideo": true, "video/x-matroska": true, "video/webm": true, "application/octet-stream": true}

func SignMediaPath(secret, mediaPath string, expires int64) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = io.WriteString(mac, mediaPath+":"+strconv.FormatInt(expires, 10))
	return hex.EncodeToString(mac.Sum(nil))[:32]
}
func VerifyMediaSignature(secret, mediaPath, expires, signature string, now time.Time) bool {
	exp, err := strconv.ParseInt(expires, 10, 64)
	if err != nil || now.After(time.Unix(exp, 0)) || secret == "" || !strings.HasPrefix(mediaPath, "/media/") || !validKey(strings.TrimPrefix(mediaPath, "/media/")) {
		return false
	}
	return hmac.Equal([]byte(signature), []byte(SignMediaPath(secret, mediaPath, exp)))
}

type UploadIntent struct {
	FileName    string `json:"fileName"`
	FileSize    int64  `json:"fileSize"`
	ContentType string `json:"contentType"`
}
type UploadClaims struct {
	Version   int    `json:"version"`
	UserID    string `json:"userId"`
	Nonce     string `json:"nonce"`
	ExpiresAt int64  `json:"expiresAt"`
	UploadIntent
}

func (i UploadIntent) Validate(maximum int64) error {
	if i.FileName == "" || strings.TrimSpace(i.FileName) != i.FileName || len(i.FileName) > 255 || strings.ContainsAny(i.FileName, "/\\") || !videoExtensions[strings.ToLower(path.Ext(i.FileName))] {
		return errors.New("Unsupported file name")
	}
	for _, c := range i.FileName {
		if c < 32 || c == 127 {
			return errors.New("Unsupported file name")
		}
	}
	if i.FileSize < 1 || i.FileSize > maximum {
		return errors.New("File size is outside the supported range")
	}
	if !videoContentTypes[i.ContentType] {
		return errors.New("Unsupported content type")
	}
	return nil
}
func randomID() (string, error) {
	b := make([]byte, 16)
	if _, e := rand.Read(b); e != nil {
		return "", e
	}
	return hex.EncodeToString(b), nil
}
func randomUUID() (string, error) {
	id, e := randomID()
	if e != nil {
		return "", e
	}
	return id[:8] + "-" + id[8:12] + "-4" + id[13:16] + "-a" + id[17:20] + "-" + id[20:], nil
}
func SignUploadIntent(secret, userID string, intent UploadIntent, now time.Time) (string, error) {
	if len(secret) < 32 || !uuidPattern.MatchString(userID) {
		return "", errors.New("invalid upload authorization configuration")
	}
	nonce, e := randomID()
	if e != nil {
		return "", e
	}
	claims := UploadClaims{Version: 1, UserID: userID, Nonce: nonce, ExpiresAt: now.Unix() + 300, UploadIntent: intent}
	payload, e := json.Marshal(claims)
	if e != nil {
		return "", e
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = io.WriteString(mac, encoded)
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}
func VerifyUploadToken(secret, token string, maximum int64, now time.Time) (UploadClaims, error) {
	var claims UploadClaims
	invalid := errors.New("Invalid upload authorization")
	if len(secret) < 32 || len(token) > 4096 {
		return claims, invalid
	}
	pieces := strings.Split(token, ".")
	if len(pieces) != 2 {
		return claims, invalid
	}
	signature, e := base64.RawURLEncoding.Strict().DecodeString(pieces[1])
	if e != nil {
		return claims, invalid
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = io.WriteString(mac, pieces[0])
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return claims, invalid
	}
	payload, e := base64.RawURLEncoding.Strict().DecodeString(pieces[0])
	if e != nil {
		return claims, invalid
	}
	// Explicit property accounting rejects unknown and duplicate token fields.
	dec := json.NewDecoder(strings.NewReader(string(payload)))
	opening, e := dec.Token()
	if e != nil || opening != json.Delim('{') {
		return claims, invalid
	}
	seen := map[string]bool{}
	for dec.More() {
		name, e := dec.Token()
		key, ok := name.(string)
		if e != nil || !ok || seen[key] {
			return claims, invalid
		}
		seen[key] = true
		var value json.RawMessage
		if dec.Decode(&value) != nil {
			return claims, invalid
		}
	}
	if _, e = dec.Token(); e != nil {
		return claims, invalid
	}
	if _, e = dec.Token(); e != io.EOF {
		return claims, invalid
	}
	for _, key := range []string{"version", "userId", "nonce", "expiresAt", "fileName", "fileSize", "contentType"} {
		if !seen[key] {
			return claims, invalid
		}
	}
	if len(seen) != 7 {
		return claims, invalid
	}
	if json.Unmarshal(payload, &claims) != nil || claims.Version != 1 || !uuidPattern.MatchString(claims.UserID) || !noncePattern.MatchString(claims.Nonce) || claims.ExpiresAt <= now.Unix() || claims.ExpiresAt > now.Unix()+600 || claims.UploadIntent.Validate(maximum) != nil {
		return UploadClaims{}, invalid
	}
	return claims, nil
}
func LooksLikeVideo(header []byte, suffix string) bool {
	if len(header) < 12 {
		return false
	}
	switch suffix {
	case ".mp4", ".mov":
		return string(header[4:8]) == "ftyp"
	case ".mkv", ".webm":
		return string(header[:4]) == "\x1a\x45\xdf\xa3"
	case ".avi":
		return string(header[:4]) == "RIFF" && string(header[8:12]) == "AVI "
	}
	return false
}
