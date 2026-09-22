package migrations

import (
	"testing"
	"testing/fstest"
)

func TestHistory(t *testing.T) {
	chain, err := All()
	if err != nil {
		t.Fatal(err)
	}
	if len(chain) != 35 || chain[0].Revision != "20260629_0001" || chain[len(chain)-1].Revision != "20260922_x_lifecycle" {
		t.Fatalf("unexpected history: %v", chain)
	}
}

func TestRejectBrokenHistory(t *testing.T) {
	for _, body := range []string{
		"-- revision: a\n-- parent: missing\nSELECT 1;",
		"-- revision: base\n-- parent: base\nSELECT 1;",
		"-- revision: a\n-- parent: base\n",
		"SELECT 1;",
	} {
		if _, err := read(fstest.MapFS{"001.sql": &fstest.MapFile{Data: []byte(body)}}); err == nil {
			t.Fatalf("accepted %q", body)
		}
	}
}
