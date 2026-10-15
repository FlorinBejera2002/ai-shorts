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
	if len(chain) != 47 || chain[0].Revision != "20260629_0001" || chain[len(chain)-1].Revision != "20261015_studio_compositions" {
		t.Fatalf("unexpected history: %d migrations, first %s, last %s", len(chain), chain[0].Revision, chain[len(chain)-1].Revision)
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
