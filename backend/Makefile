.DEFAULT_GOAL := help
GO_CACHE ?= $(abspath ../.cache/go-build)
export GOCACHE := $(GO_CACHE)
ARGS ?=

.PHONY: help run fmt test vet check build

help:
	@echo "Targets: run [ARGS='...'], fmt, test, vet, check, build"

run:
	go run ./cmd/api $(ARGS)

fmt:
	gofmt -w cmd internal

test:
	go test -race ./...

vet:
	go vet ./...

check: test vet
	@test -z "$$(gofmt -l cmd internal)" || { echo "Run make fmt"; exit 1; }

build:
	@mkdir -p build
	go build -trimpath -o build/api ./cmd/api
