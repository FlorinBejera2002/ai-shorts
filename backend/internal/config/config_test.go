package config

import (
	"io"
	"testing"
)

func TestFlagsOverrideEnvironment(t *testing.T) {
	env := map[string]string{"APP_ENV": "staging", "LISTEN_ADDR": ":4000"}
	cfg, err := Load([]string{"-listen-addr=127.0.0.1:8081", "-env=test"}, func(key string) string { return env[key] }, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ListenAddr != "127.0.0.1:8081" || cfg.Environment != "test" {
		t.Fatalf("unexpected config: %+v", cfg)
	}
}

func TestInvalidConfiguration(t *testing.T) {
	for _, args := range [][]string{
		{"-listen-addr=8080"}, {"-listen-addr=:70000"}, {"-listen-addr=:0"},
		{"-env=invalid"}, {"unexpected"},
	} {
		if _, err := Load(args, func(string) string { return "" }, io.Discard); err == nil {
			t.Fatalf("expected error for %v", args)
		}
	}
}
