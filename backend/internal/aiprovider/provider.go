package aiprovider

import (
	"context"
	"errors"
)

var ErrNotConfigured = errors.New("AI provider is not configured")

type Generator interface {
	Generate(context.Context, string) (string, error)
}
