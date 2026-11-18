package main

import (
	"strings"
	"testing"
)

func TestLocalSetupRejectsRemoteAndAmbiguousEndpointsBeforeAccess(t *testing.T) {
	for _, endpoint := range []string{"https://fsn1.your-objectstorage.com", "http://seaweedfs:8333", "http://127.0.0.1:8333/private", "http://user@127.0.0.1:8333", "http://127.0.0.1:8333?query=1"} {
		t.Run(endpoint, func(t *testing.T) {
			t.Setenv("AWS_ENDPOINT_URL", endpoint)
			if err := run(); err == nil || !strings.Contains(err.Error(), "loopback HTTP endpoint") {
				t.Fatalf("unsafe endpoint was accepted: %v", err)
			}
		})
	}
}

func TestLocalSetupRejectsRemoteBrowserOriginsBeforeAccess(t *testing.T) {
	t.Setenv("AWS_ENDPOINT_URL", "http://127.0.0.1:8333")
	for _, origin := range []string{"https://app.example.com", "http://localhost:3000/path", "http://user@localhost:3000", "http://localhost:3000#fragment", "*"} {
		t.Setenv("SNEEPCUT_LOCAL_S3_ORIGINS", origin)
		if err := run(); err == nil || !strings.Contains(err.Error(), "loopback browser origins") {
			t.Fatalf("unsafe browser origin was accepted: %v", err)
		}
	}
}
