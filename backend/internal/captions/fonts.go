package captions

import (
	"embed"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"golang.org/x/image/font/sfnt"
	"golang.org/x/image/math/fixed"
	"slices"
	"strconv"
	"strings"
)

//go:embed assets/*
var assets embed.FS

type Font struct {
	ID       string            `json:"id"`
	Family   string            `json:"family"`
	Category string            `json:"category"`
	Weights  []int             `json:"weights"`
	Files    map[string]string `json:"files,omitempty"`
	Style    string            `json:"style,omitempty"`
	Archived bool              `json:"archived,omitempty"`
	Romanian bool              `json:"romanian"`
}

var catalog []Font

func init() {
	b, _ := assets.ReadFile("assets/catalog.json")
	if json.Unmarshal(b, &catalog) != nil {
		panic("invalid bundled font catalog")
	}
	for i := range catalog {
		catalog[i].Romanian = true
	}
}
func Catalog() []Font {
	out := make([]Font, len(catalog))
	copy(out, catalog)
	for i := range out {
		out[i].Files = nil
	}
	return out
}
func Builtin(id string) (Font, bool) {
	for _, f := range catalog {
		if f.ID == id {
			return f, true
		}
	}
	return Font{}, false
}
func IsBuiltin(id string) bool { _, ok := Builtin(id); return ok }
func FontBytes(id string, weight int) ([]byte, error) {
	f, ok := Builtin(id)
	if !ok || !slices.Contains(f.Weights, weight) {
		return nil, errors.New("selected font or weight is unavailable")
	}
	return assets.ReadFile("assets/" + f.Files[strconv.Itoa(weight)])
}
func PrivateKey(user, id string) (string, error) {
	if !resource.MatchString(id) || user == "" || strings.ContainsAny(user, "/\\.\x00") {
		return "", errors.New("invalid private font resource")
	}
	return "fonts/" + user + "/" + id + ".ttf", nil
}

// Inspect validates SFNT tables, family metadata and real outline data. WOFF and
// font collections are intentionally unsupported; no browser-only conversion.
func Inspect(b []byte) (Font, error) {
	var out Font
	if len(b) < 12 || len(b) > 8<<20 {
		return out, errors.New("font must be a TTF or OTF file up to 8 MB")
	}
	if string(b[:4]) != "OTTO" && binary.BigEndian.Uint32(b[:4]) != 0x00010000 {
		return out, errors.New("upload a valid TTF or OTF font")
	}
	f, e := sfnt.Parse(b)
	if e != nil {
		return out, errors.New("font contents could not be read")
	}
	var buf sfnt.Buffer
	out.Family, _ = f.Name(&buf, sfnt.NameIDTypographicFamily)
	if out.Family == "" {
		out.Family, _ = f.Name(&buf, sfnt.NameIDFamily)
	}
	out.Style, _ = f.Name(&buf, sfnt.NameIDTypographicSubfamily)
	if out.Style == "" {
		out.Style, _ = f.Name(&buf, sfnt.NameIDSubfamily)
	}
	if out.Family == "" || len(out.Family) > 100 || strings.ContainsAny(out.Family, "\r\n,{}\\") {
		return out, errors.New("font family metadata is invalid")
	}
	// Extract OS/2 weight class; never infer weight from a filename.
	weight := 400
	count := int(binary.BigEndian.Uint16(b[4:6]))
	if count > 256 || 12+count*16 > len(b) {
		return out, errors.New("font table directory is invalid")
	}
	for i := 0; i < count; i++ {
		t := b[12+i*16 : 28+i*16]
		offset, n := int(binary.BigEndian.Uint32(t[8:12])), int(binary.BigEndian.Uint32(t[12:16]))
		if offset < 0 || n < 0 || offset > len(b)-n {
			return out, errors.New("font table bounds are invalid")
		}
		if string(t[:4]) == "OS/2" && n >= 6 {
			weight = int(binary.BigEndian.Uint16(b[offset+4 : offset+6]))
		}
	}
	if weight < 100 || weight > 900 {
		return out, errors.New("font weight is unsupported")
	}
	out.Weights = []int{weight}
	out.Category = "custom"
	out.Romanian = true
	for _, r := range "ABCabc012ăâîșțĂÂÎȘȚ" {
		g, err := f.GlyphIndex(&buf, r)
		if err != nil || g == 0 {
			if r > 127 {
				out.Romanian = false
				continue
			}
			return out, errors.New("font is missing basic caption characters")
		}
		if _, err = f.LoadGlyph(&buf, g, fixed.I(48), nil); err != nil {
			return out, fmt.Errorf("font glyph data is invalid: %w", err)
		}
	}
	return out, nil
}
