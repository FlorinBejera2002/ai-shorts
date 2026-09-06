// Package config owns process configuration; feature packages receive explicit
// dependencies instead of reading environment variables themselves.
package config

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"strconv"
)

type Config struct {
	ListenAddr  string
	Environment string
}

func Load(args []string, getenv func(string) string, output io.Writer) (Config, error) {
	cfg := Config{ListenAddr: "127.0.0.1:8080", Environment: "development"}
	if value := getenv("LISTEN_ADDR"); value != "" {
		cfg.ListenAddr = value
	}
	if value := getenv("APP_ENV"); value != "" {
		cfg.Environment = value
	}
	flags := flag.NewFlagSet("api", flag.ContinueOnError)
	flags.SetOutput(output)
	flags.StringVar(&cfg.ListenAddr, "listen-addr", cfg.ListenAddr, "HTTP listen address")
	flags.StringVar(&cfg.Environment, "env", cfg.Environment, "Environment (development|test|testing|staging|production)")
	if err := flags.Parse(args); err != nil {
		return Config{}, err
	}
	if flags.NArg() != 0 {
		return Config{}, errors.New("unexpected positional arguments")
	}
	_, port, err := net.SplitHostPort(cfg.ListenAddr)
	if err != nil {
		return Config{}, errors.New("listen address must contain a host and port, for example 127.0.0.1:8080")
	}
	number, err := strconv.Atoi(port)
	if err != nil || number < 1 || number > 65535 {
		return Config{}, errors.New("listen port must be between 1 and 65535")
	}
	switch cfg.Environment {
	case "development", "test", "testing", "staging", "production":
	default:
		return Config{}, fmt.Errorf("unsupported environment %q", cfg.Environment)
	}
	return cfg, nil
}
