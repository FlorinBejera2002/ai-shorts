package captions

import (
	"fmt"
	"golang.org/x/image/font"
	"golang.org/x/image/font/sfnt"
	"golang.org/x/image/math/fixed"
	"math"
	"strconv"
	"strings"
)

type Word struct {
	Text       string
	Start, End float64
}
type line struct {
	words []Word
	width float64
}

func assColor(h string, opacity float64) string {
	n, _ := strconv.ParseUint(strings.TrimPrefix(h, "#"), 16, 32)
	return fmt.Sprintf("&H%02X%02X%02X%02X", int(math.Round((1-opacity)*255)), n&255, (n>>8)&255, (n>>16)&255)
}
func assTime(t float64) string {
	n := int(math.Round(math.Max(0, t) * 100))
	return fmt.Sprintf("%d:%02d:%02d.%02d", n/360000, n/6000%60, n/100%60, n%100)
}
func clean(text string) string {
	return strings.NewReplacer("\\", "＼", "{", "(", "}", ")", "\r", " ", "\n", " ").Replace(text)
}

// ASS emits the same actual font bytes used by the browser. Explicit script
// resolution, glyph metrics and normalized center anchoring avoid SRT scaling.
// Cue is either aligned words, or a static phrase with genuine segment bounds.
// Phrase cues never synthesize word timestamps and never run word animations.
type Cue struct {
	Words      []Word
	Text       string
	Start, End float64
}

func ASS(s Style, fontData []byte, groups [][]Word, w, h int) (string, error) {
	cues := make([]Cue, 0, len(groups))
	for _, words := range groups {
		cues = append(cues, Cue{Words: words})
	}
	return ASSCues(s, fontData, cues, w, h)
}
func ASSCues(s Style, fontData []byte, cues []Cue, w, h int) (string, error) {
	groups := make([][]Word, 0, len(cues))
	static := make([]bool, 0, len(cues))
	for _, cue := range cues {
		if len(cue.Words) > 0 {
			groups = append(groups, cue.Words)
			static = append(static, false)
			continue
		}
		if strings.TrimSpace(cue.Text) == "" || !finiteRange(cue.Start, 0, 86400) || !finiteRange(cue.End, 0, 86400) || cue.End <= cue.Start {
			return "", fmt.Errorf("caption timing is unavailable; retry transcription before exporting captions")
		}
		var words []Word
		for _, text := range strings.Fields(cue.Text) {
			words = append(words, Word{Text: text, Start: cue.Start, End: cue.End})
		}
		groups = append(groups, words)
		static = append(static, true)
	}
	if err := s.Validate(); err != nil {
		return "", err
	}
	meta, err := Inspect(fontData)
	if err != nil {
		return "", err
	}
	face, err := sfnt.Parse(fontData)
	if err != nil {
		return "", err
	}
	var buf sfnt.Buffer
	for _, group := range groups {
		for _, word := range group {
			for _, r := range word.Text {
				if r == '\n' || r == '\r' || r == '\t' {
					continue
				}
				g, e := face.GlyphIndex(&buf, r)
				if e != nil || g == 0 {
					return "", fmt.Errorf("selected caption font is missing character %q; choose a font that supports this language", r)
				}
			}
		}
	}
	size := s.Size * float64(min(w, h))
	outline, shadow := s.Outline*float64(min(w, h))/720, s.Shadow*float64(min(w, h))/720
	opacity := s.BackgroundOpacity
	switch s.Preset {
	case "minimal":
		outline = 0
		shadow = 0
	case "bold-outline":
		outline = math.Max(outline, size*.075)
	case "contrast-box":
		opacity = math.Max(opacity, .82)
	case "headline":
		size *= 1.45
	case "stacked":
		size *= 1.08
	}
	measure := func(text string) float64 {
		n := fixed.Int26_6(0)
		for _, r := range text {
			g, _ := face.GlyphIndex(&buf, r)
			a, _ := face.GlyphAdvance(&buf, g, fixed.Int26_6(size*64), font.HintingNone)
			n += a
		}
		return float64(n) / 64
	}
	var out strings.Builder
	fmt.Fprintf(&out, "[Script Info]\nScriptType: v4.00+\nPlayResX: %d\nPlayResY: %d\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,%s,%.3f,%s,%s,%s,%s,%d,0,0,0,100,100,0,0,1,%.2f,%.2f,5,0,0,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n", w, h, meta.Family, size, assColor(s.TextColor, 1), assColor(s.TextColor, 1), assColor(s.OutlineColor, 1), assColor(s.OutlineColor, 1), s.Weight, outline, shadow)
	event := func(layer int, start, end float64, text string) {
		if end > start {
			fmt.Fprintf(&out, "Dialogue: %d,%s,%s,Default,,0,0,0,,%s\n", layer, assTime(start), assTime(end), text)
		}
	}
	rect := func(start, end, x, y, width, height float64, color string, alpha float64) {
		event(0, start, end, fmt.Sprintf("{\\an7\\pos(%.2f,%.2f)\\bord0\\shad0\\1c%s\\1a&H%02X&\\p1}m 0 0 l %.2f 0 %.2f %.2f 0 %.2f", x, y, assColor(color, 1), int((1-alpha)*255), width, width, height, height))
	}
	for groupIndex, group := range groups {
		phraseOnly := static[groupIndex]
		// Invalid or missing word alignment never gets fabricated animation timing.
		valid := len(group) > 0
		for i, word := range group {
			valid = valid && finiteRange(word.Start, 0, 86400) && finiteRange(word.End, 0, 86400) && word.End > word.Start && (i == 0 || word.Start >= group[i-1].Start)
		}
		if !valid {
			return "", fmt.Errorf("caption word timing is unavailable; retry transcription before exporting captions")
		}
		var chunks [][]line
		var lines []line
		current := line{}
		chunkStart := group[0].Start
		flush := func() {
			if len(current.words) > 0 {
				lines = append(lines, current)
				current = line{}
			}
			if len(lines) > 0 {
				chunks = append(chunks, lines)
				lines = nil
			}
		}
		for _, word := range group {
			word.Text = clean(strings.TrimSpace(word.Text))
			if word.Text == "" {
				continue
			}
			space := 0.
			if len(current.words) > 0 {
				space = measure(" ")
			}
			width := measure(word.Text)
			// An exceptionally long token is scaled per event, never clipped off frame.
			if len(current.words) > 0 && (current.width+space+width > s.MaxWidth*float64(w) || (!phraseOnly && word.End-chunkStart > 4.5)) {
				lines = append(lines, current)
				current = line{}
				space = 0
				if !phraseOnly && len(lines) >= s.MaxLines || (!phraseOnly && word.End-chunkStart > 4.5) {
					chunks = append(chunks, lines)
					lines = nil
					chunkStart = word.Start
				}
			}
			current.words = append(current.words, word)
			current.width += space + width
		}
		flush()
		for _, ls := range chunks {
			// A static phrase keeps its genuine whole-phrase bounds. Extra lines
			// are joined and scaled, not split into fabricated timed pages.
			if phraseOnly && len(ls) > s.MaxLines {
				tail := line{}
				for _, l := range ls[s.MaxLines-1:] {
					tail.words = append(tail.words, l.words...)
				}
				var parts []string
				for _, word := range tail.words {
					parts = append(parts, word.Text)
				}
				tail.width = measure(strings.Join(parts, " "))
				ls = append(ls[:s.MaxLines-1], tail)
			}
			if s.Preset == "stacked" && s.MaxLines > 1 && len(ls) == 1 && len(ls[0].words) > 1 {
				words := ls[0].words
				mid := (len(words) + 1) / 2
				ls = []line{{words: words[:mid]}, {words: words[mid:]}}
				for i := range ls {
					var text []string
					for _, word := range ls[i].words {
						text = append(text, word.Text)
					}
					ls[i].width = measure(strings.Join(text, " "))
				}
			}
			start, end := ls[0].words[0].Start, ls[len(ls)-1].words[len(ls[len(ls)-1].words)-1].End
			for _, l := range ls {
				for _, word := range l.words {
					end = math.Max(end, word.End)
				}
			}
			blockWidth := 0.
			for _, l := range ls {
				blockWidth = math.Max(blockWidth, l.width)
			}
			pad := math.Max(2, size*.14)
			availableWidth := math.Min(s.MaxWidth*float64(w), float64(w)-2*pad)
			scale := math.Min(1, availableWidth/math.Max(1, blockWidth))
			scale = math.Min(scale, (float64(h)-2*pad)/(size*s.LineSpacing*float64(len(ls))))
			lineHeight := size * s.LineSpacing * scale
			blockHeight := lineHeight * float64(len(ls))
			blockWidth *= scale
			x := math.Max(blockWidth/2+pad, math.Min(float64(w)-blockWidth/2-pad, s.Position.X*float64(w)))
			y := math.Max(blockHeight/2+pad, math.Min(float64(h)-blockHeight/2-pad, s.Position.Y*float64(h)))
			for i, l := range ls {
				ly := y + (float64(i)-float64(len(ls)-1)/2)*lineHeight
				lx := x - l.width*scale/2
				if s.Align == "left" {
					lx = x - blockWidth/2
				}
				if s.Align == "right" {
					lx = x + blockWidth/2 - l.width*scale
				}
				base := fmt.Sprintf("\\an4\\pos(%.2f,%.2f)\\fscx%.2f\\fscy%.2f", lx, ly, scale*100, scale*100)
				var texts []string
				for _, word := range l.words {
					texts = append(texts, word.Text)
				}
				text := strings.Join(texts, " ")
				if opacity > 0 && (s.Preset != "word-by-word" || phraseOnly) {
					rect(start, end, lx-pad, ly-lineHeight/2, l.width*scale+pad*2, lineHeight, s.BackgroundColor, opacity)
				}
				preset := s.Preset
				if phraseOnly {
					preset = "classic"
				}
				switch preset {
				case "word-by-word":
					for _, word := range l.words {
						wordScale := math.Min(1, availableWidth/math.Max(1, measure(word.Text)))
						wordScale = math.Min(wordScale, (float64(h)-2*pad)/(size*s.LineSpacing))
						wordWidth, wordHeight := measure(word.Text)*wordScale, size*s.LineSpacing*wordScale
						wx := math.Max(wordWidth/2+pad, math.Min(float64(w)-wordWidth/2-pad, s.Position.X*float64(w)))
						wy := math.Max(wordHeight/2+pad, math.Min(float64(h)-wordHeight/2-pad, s.Position.Y*float64(h)))
						if opacity > 0 {
							rect(word.Start, word.End, wx-wordWidth/2-pad, wy-wordHeight/2, wordWidth+2*pad, wordHeight, s.BackgroundColor, opacity)
						}
						event(1, word.Start, word.End, fmt.Sprintf("{\\an5\\pos(%.2f,%.2f)\\fscx%.2f\\fscy%.2f}%s", wx, wy, wordScale*100, wordScale*100, word.Text))
					}
				case "active-color", "active-background":
					event(1, start, end, "{"+base+"}"+text)
					offset := 0.
					for _, word := range l.words {
						ww := measure(word.Text) * scale
						if s.Preset == "active-background" {
							rect(word.Start, word.End, lx+offset-pad, ly-lineHeight/2, ww+pad*2, lineHeight, s.HighlightColor, 1)
						}
						color := s.HighlightColor
						if s.Preset == "active-background" {
							color = s.TextColor
						}
						event(2, word.Start, word.End, fmt.Sprintf("{\\an4\\pos(%.2f,%.2f)\\fscx%.2f\\fscy%.2f\\1c%s}%s", lx+offset, ly, scale*100, scale*100, assColor(color, 1), word.Text))
						offset += ww + measure(" ")*scale
					}
				case "karaoke":
					event(1, start, end, "{"+base+"}"+text)
					offset := 0.
					for _, word := range l.words {
						// Each fill is anchored to its own real start; independent
						// events also preserve overlapping word intervals and gaps.
						event(2, word.Start, end, fmt.Sprintf("{\\an4\\pos(%.2f,%.2f)\\fscx%.2f\\fscy%.2f\\1c%s\\2c%s\\kf%d}%s", lx+offset, ly, scale*100, scale*100, assColor(s.HighlightColor, 1), assColor(s.TextColor, 1), max(1, int(math.Round((word.End-word.Start)*100))), word.Text))
						offset += (measure(word.Text) + measure(" ")) * scale
					}
				case "phrase-pop":
					event(1, start, end, "{"+base+fmt.Sprintf("\\fscx%.2f\\fscy%.2f\\t(0,120,\\fscx%.2f\\fscy%.2f)", scale*88, scale*88, scale*100, scale*100)+"}"+text)
				case "subtle-fade":
					event(1, start, end, "{"+base+"\\fad(140,140)}"+text)
				default:
					event(1, start, end, "{"+base+"}"+text)
				}
			}
		}
	}
	return out.String(), nil
}
