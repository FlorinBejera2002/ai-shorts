// Package migrations embeds the PostgreSQL schema history. Revision identifiers
// match the former Alembic history so existing databases upgrade in place.
package migrations

import (
	"embed"
	"fmt"
	"io/fs"
	"strings"
)

//go:embed *.sql
var files embed.FS

type Migration struct {
	Revision string
	Parent   string
	SQL      string
}

// All returns the ordered, validated linear migration chain.
func All() ([]Migration, error) {
	return read(files)
}

func read(source fs.FS) ([]Migration, error) {
	names, err := fs.Glob(source, "*.sql")
	if err != nil {
		return nil, err
	}
	if len(names) == 0 {
		return nil, fmt.Errorf("migration history is empty")
	}
	result := make([]Migration, 0, len(names))
	parent := "base"
	seen := map[string]bool{}
	for _, name := range names {
		body, err := fs.ReadFile(source, name)
		if err != nil {
			return nil, err
		}
		lines := strings.SplitN(string(body), "\n", 3)
		if len(lines) != 3 || !strings.HasPrefix(lines[0], "-- revision: ") || !strings.HasPrefix(lines[1], "-- parent: ") {
			return nil, fmt.Errorf("invalid migration metadata: %s", name)
		}
		m := Migration{Revision: strings.TrimSpace(strings.TrimPrefix(lines[0], "-- revision: ")), Parent: strings.TrimSpace(strings.TrimPrefix(lines[1], "-- parent: ")), SQL: lines[2]}
		if m.Revision == "" || len(m.Revision) > 32 || m.Revision == "base" || seen[m.Revision] || m.Parent != parent || strings.TrimSpace(m.SQL) == "" {
			return nil, fmt.Errorf("invalid migration chain at %s", name)
		}
		result = append(result, m)
		seen[m.Revision], parent = true, m.Revision
	}
	return result, nil
}
