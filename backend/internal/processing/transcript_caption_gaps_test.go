package processing

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCaptionCuesDoNotBridgeSpeechPauses(t *testing.T) {
	file := filepath.Join(t.TempDir(), "captions.srt")
	words := []Word{
		{Text: "Da", Start: 1, End: 1.2},
		{Text: "aici", Start: 1.25, End: 1.5},
		{Text: "uite", Start: 2.1, End: 2.4},
	}
	if err := writeSRT(file, words); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	want := "1\n00:00:01,000 --> 00:00:01,500\nDa aici\n\n2\n00:00:02,100 --> 00:00:02,400\nuite\n\n"
	if string(raw) != want {
		t.Fatalf("caption bridged a measured speech pause: %s", raw)
	}
}

func TestCaptionCuesPreserveCoarsePhraseAndEmptySpeech(t *testing.T) {
	file := filepath.Join(t.TempDir(), "captions.srt")
	if err := writeSRT(file, []Word{{Text: "Nu schimba aceste cuvinte.", Start: 3, End: 4.1}}); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(file)
	if err != nil || !strings.Contains(string(raw), "00:00:03,000 --> 00:00:04,100\nNu schimba aceste cuvinte.") {
		t.Fatalf("coarse verified phrase was changed: %s, %v", raw, err)
	}
	if err := writeSRT(file, nil); err != nil {
		t.Fatal(err)
	}
	raw, err = os.ReadFile(file)
	if err != nil || len(raw) != 0 {
		t.Fatalf("empty speech produced captions: %s, %v", raw, err)
	}
}
