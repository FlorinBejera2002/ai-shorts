package media

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

func readRedisCommand(reader *bufio.Reader) ([]string, error) {
	line, e := reader.ReadString('\n')
	if e != nil {
		return nil, e
	}
	count, e := strconv.Atoi(strings.TrimSpace(strings.TrimPrefix(line, "*")))
	if e != nil || count < 1 || count > 32 {
		return nil, fmt.Errorf("invalid command array")
	}
	args := make([]string, count)
	for i := range args {
		line, e = reader.ReadString('\n')
		if e != nil {
			return nil, e
		}
		length, e := strconv.Atoi(strings.TrimSpace(strings.TrimPrefix(line, "$")))
		if e != nil || length < 0 || length > 4096 {
			return nil, fmt.Errorf("invalid command field")
		}
		data := make([]byte, length+2)
		if _, e = io.ReadFull(reader, data); e != nil {
			return nil, e
		}
		args[i] = string(data[:length])
	}
	return args, nil
}
func TestRedisNonceAtomicNXExpiryAndSharedLimits(t *testing.T) {
	client, server := net.Pipe()
	commands := make(chan []string, 10)
	done := make(chan struct{})
	go func() {
		defer close(done)
		defer server.Close()
		reader := bufio.NewReader(server)
		setCount, limits := 0, 0
		for {
			args, e := readRedisCommand(reader)
			if e != nil {
				return
			}
			commands <- args
			switch strings.ToLower(args[0]) {
			case "hello":
				_, _ = io.WriteString(server, "-ERR unsupported HELLO\r\n")
			case "set":
				setCount++
				if setCount == 1 {
					_, _ = io.WriteString(server, "+OK\r\n")
				} else {
					_, _ = io.WriteString(server, "$-1\r\n")
				}
			case "eval":
				limits++
				_, _ = fmt.Fprintf(server, ":%d\r\n", limits)
			default:
				_, _ = io.WriteString(server, "+OK\r\n")
			}
		}
	}()
	rdb := redis.NewClient(&redis.Options{Addr: "fixture:6379", Protocol: 2, DisableIdentity: true, MaxRetries: -1, Dialer: func(context.Context, string, string) (net.Conn, error) { return client, nil }})
	storage := &RedisNonceStore{client: rdb}
	ctx := context.Background()
	nonce := "abcdef0123456789abcdef0123456789"
	if ok, e := storage.Consume(ctx, nonce, testUserID, time.Minute); e != nil || !ok {
		t.Fatalf("claim: %v %v", ok, e)
	}
	if ok, e := storage.Consume(ctx, nonce, testUserID, time.Minute); e != nil || ok {
		t.Fatalf("replay: %v %v", ok, e)
	}
	if ok, e := storage.Allow(ctx, testUserID, 1, time.Hour); e != nil || !ok {
		t.Fatalf("limit first: %v %v", ok, e)
	}
	if ok, e := storage.Allow(ctx, testUserID, 1, time.Hour); e != nil || ok {
		t.Fatalf("limit second: %v %v", ok, e)
	}
	_ = storage.Close()
	<-done
	close(commands)
	for args := range commands {
		if args[0] == "set" {
			if len(args) != 6 || args[1] != "upload-nonce:"+nonce || args[2] != testUserID || strings.ToLower(args[3]) != "ex" || args[4] != "60" || strings.ToLower(args[5]) != "nx" {
				t.Fatalf("nonce was not atomic and expiring: %v", args)
			}
		}
	}
}
