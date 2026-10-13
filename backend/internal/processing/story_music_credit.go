package processing

import (
	"fmt"
	"os"
	"strings"
	"unicode"

	"sneepcut/backend-go/internal/story"
)

// A visible credit survives services that discard MP4 metadata. It overlays
// the last four seconds without extending/replacing any source footage.
func writeStoryMusicCredit(file string, request story.Request, width, height int, duration float64) error {
	track := request.Music.Track
	text := "Music: " + storyMusicCreditText(track.Title, 65) + `\N` + storyMusicCreditText(track.Artist, 40) + ` · incompetech.com\NCC BY 4.0 · creativecommons.org/licenses/by/4.0/\NTrimmed / looped / mixed`
	alignment := 7
	if request.Options.SubtitlePosition == "top" {
		alignment = 1
	}
	fontSize := max(16, min(width, height)/45)
	content := fmt.Sprintf(`[Script Info]
ScriptType: v4.00+
PlayResX: %d
PlayResY: %d
WrapStyle: 0
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Credit,Arial,%d,&H00FFFFFF,&H00FFFFFF,&H80000000,&H80000000,0,0,0,0,100,100,0,0,3,3,0,%d,%d,%d,%d,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 1,%s,%s,Credit,,0,0,0,,%s
`, width, height, fontSize, alignment, width*4/100, width*4/100, height*4/100, storyASSClock(max(0, duration-4)), storyASSClock(duration), text)
	return os.WriteFile(file, []byte(content), 0600)
}

func storyMusicCreditText(value string, limit int) string {
	var result []rune
	for _, r := range value {
		if unicode.IsControl(r) {
			r = ' '
		}
		// ASS override blocks and escape sequences must never come from a title.
		switch r {
		case '{':
			r = '（'
		case '}':
			r = '）'
		case '\\':
			r = '／'
		}
		result = append(result, r)
		if len(result) >= limit {
			break
		}
	}
	return strings.TrimSpace(string(result))
}

func storyASSClock(seconds float64) string {
	centiseconds := int(seconds * 100)
	return fmt.Sprintf("%d:%02d:%02d.%02d", centiseconds/360000, centiseconds/6000%60, centiseconds/100%60, centiseconds%100)
}
