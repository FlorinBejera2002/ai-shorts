package media

import (
	"context"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
)

type NonceStore interface {
	Consume(context.Context, string, string, time.Duration) (bool, error)
	Allow(context.Context, string, int, time.Duration) (bool, error)
}
type RedisNonceStore struct{ client redis.UniversalClient }

func NewRedisNonceStore(rawURL string) (*RedisNonceStore, error) {
	options, e := redis.ParseURL(rawURL)
	if e != nil {
		return nil, errors.New("invalid Redis configuration")
	}
	options.DialTimeout = 5 * time.Second
	options.ReadTimeout = 5 * time.Second
	options.WriteTimeout = 5 * time.Second
	options.MaxRetries = -1
	return &RedisNonceStore{client: redis.NewClient(options)}, nil
}
func (s *RedisNonceStore) Close() error { return s.client.Close() }
func (s *RedisNonceStore) Consume(ctx context.Context, nonce, userID string, ttl time.Duration) (bool, error) {
	if ttl <= 0 || !noncePattern.MatchString(nonce) || !uuidPattern.MatchString(userID) {
		return false, errors.New("invalid upload nonce")
	}
	return s.client.SetNX(ctx, "upload-nonce:"+nonce, userID, ttl).Result()
}
func (s *RedisNonceStore) Allow(ctx context.Context, key string, maximum int, window time.Duration) (bool, error) {
	result, e := s.client.Eval(ctx, `local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return n`, []string{"go-media-rate:" + key}, window.Milliseconds()).Int64()
	return result <= int64(maximum), e
}
