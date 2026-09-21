package processing

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSubtitlesGroupWordsAndRespectDuration(t *testing.T) {
	file := filepath.Join(t.TempDir(), "captions.srt")
	words := []Word{{"Salut", 0, .4}, {"lume", .4, .9}, {"din viitor", 3, 3.5}}
	if err := writeSRT(file, words); err != nil {
		t.Fatal(err)
	}
	contents, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(contents), "00:00:00,000 --> 00:00:00,900\nSalut lume") || !strings.Contains(string(contents), "2\n00:00:03,000") {
		t.Fatalf("unexpected grouped captions: %s", contents)
	}
}

func TestCrossfadeCaptionsMeetAtVisibleMidpoint(t *testing.T) {
	words := []Word{{"first", 1.5, 2}, {"second", 5, 5.5}}
	result := RemapWords(words, []Segment{{0, 2}, {5, 7}}, "fade", .5)
	if len(result) != 2 || result[0].End != 1.75 || result[1].Start != 1.75 {
		t.Fatalf("captions overlap across crossfade: %#v", result)
	}
}

func TestSubtitleRoundingCarriesIntoNextMinute(t *testing.T) {
	if got := subtitleTime(59.9996); got != "00:01:00,000" {
		t.Fatal(got)
	}
}
