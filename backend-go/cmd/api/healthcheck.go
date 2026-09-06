package main

import (
	"errors"
	"net"
	"net/http"
	"time"
)

func checkHealth(address string) error {
	_, port, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 4 * time.Second}
	response, err := client.Get("http://" + net.JoinHostPort("127.0.0.1", port) + "/api/ready")
	if err != nil {
		return errors.New("API is not ready")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return errors.New("API dependencies are not ready")
	}
	return nil
}
