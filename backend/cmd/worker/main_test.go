package main

import (
	"errors"
	"flag"
	"io"
	"log/slog"
	"os"
	"strings"
	"testing"
)

func TestWorkerOptionsDefaultAndScoped(t *testing.T) {
	options, err := parseOptions(nil, io.Discard)
	if err != nil || options.storyID != "" {
		t.Fatalf("default worker changed: %+v, %v", options, err)
	}
	id := "194c519e-6315-40a3-96de-b234f3cb4fa8"
	for _, args := range [][]string{{"--story-id", id}, {"--story-id=" + strings.ToUpper(id)}} {
		options, err = parseOptions(args, io.Discard)
		if err != nil || options.storyID != id {
			t.Fatalf("scoped selection: %+v, %v", options, err)
		}
	}
	options, err = parseOptions([]string{"--story-id", id, "--improve"}, io.Discard)
	if err != nil || options.storyID != id || !options.improve {
		t.Fatalf("scoped improvement selection: %+v, %v", options, err)
	}
}

func TestWorkerRejectsAmbiguousOrInvalidScope(t *testing.T) {
	id := "194c519e-6315-40a3-96de-b234f3cb4fa8"
	for _, args := range [][]string{
		{"--story-id="}, {"--story-id"}, {"--story-id", "not-a-uuid"},
		{"--story-id", id + "extra"}, {"--story-id", " " + id},
		{"--story-id", id, "--story-id", id}, {id},
		{"--story-id", id, "extra"}, {"--unknown"},
		{"--improve"},
	} {
		if _, err := parseOptions(args, io.Discard); err == nil {
			t.Fatalf("unsafe worker scope accepted: %v", args)
		}
	}
	if _, err := parseOptions([]string{"--help"}, io.Discard); !errors.Is(err, flag.ErrHelp) {
		t.Fatalf("help: %v", err)
	}
}

func TestWorkerValidatesScopeBeforeConfigurationOrDatabase(t *testing.T) {
	previous := os.Args
	t.Cleanup(func() { os.Args = previous })
	os.Args = []string{"worker", "--story-id", "invalid"}
	t.Setenv("DATABASE_URL", "invalid-database-url")
	t.Setenv("AI_PROVIDER", "invalid-provider")
	err := run(slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err == nil || !strings.Contains(err.Error(), "story ID must be a UUID") {
		t.Fatalf("configuration/database reached before UUID validation: %v", err)
	}
}
