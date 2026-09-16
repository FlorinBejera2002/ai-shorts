package media

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
)

type S3Config struct {
	AccessKey, SecretKey, SessionToken, Region, Bucket, Endpoint string
	PathStyle                                                    bool
}
type s3API interface {
	PutObject(context.Context, *s3.PutObjectInput, ...func(*s3.Options)) (*s3.PutObjectOutput, error)
	HeadObject(context.Context, *s3.HeadObjectInput, ...func(*s3.Options)) (*s3.HeadObjectOutput, error)
	DeleteObject(context.Context, *s3.DeleteObjectInput, ...func(*s3.Options)) (*s3.DeleteObjectOutput, error)
	ListObjectsV2(context.Context, *s3.ListObjectsV2Input, ...func(*s3.Options)) (*s3.ListObjectsV2Output, error)
	DeleteObjects(context.Context, *s3.DeleteObjectsInput, ...func(*s3.Options)) (*s3.DeleteObjectsOutput, error)
}
type S3Storage struct {
	client  s3API
	presign *s3.PresignClient
	bucket  string
}

func NewS3Storage(cfg S3Config) (*S3Storage, error) {
	if cfg.AccessKey == "" || cfg.SecretKey == "" || cfg.Bucket == "" {
		return nil, errors.New("S3 storage credentials and bucket are required")
	}
	if cfg.Region == "" {
		cfg.Region = "auto"
	}
	if cfg.Endpoint != "" {
		u, e := url.Parse(cfg.Endpoint)
		if e != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
			return nil, errors.New("invalid S3 endpoint")
		}
	}
	client := s3.NewFromConfig(aws.Config{Region: cfg.Region, Credentials: credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, cfg.SessionToken), HTTPClient: &http.Client{Timeout: 10 * time.Minute}}, func(o *s3.Options) {
		o.UsePathStyle = cfg.PathStyle
		if cfg.Endpoint != "" {
			o.BaseEndpoint = aws.String(cfg.Endpoint)
		}
		o.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
		o.ResponseChecksumValidation = aws.ResponseChecksumValidationWhenRequired
	})
	return &S3Storage{client: client, presign: s3.NewPresignClient(client), bucket: cfg.Bucket}, nil
}
func (s *S3Storage) Save(ctx context.Context, source, key, contentType string) error {
	if !validKey(key) {
		return ErrInvalidKey
	}
	f, e := os.Open(source)
	if e != nil {
		return e
	}
	defer f.Close()
	info, e := f.Stat()
	if e != nil {
		return e
	}
	_, e = s.client.PutObject(ctx, &s3.PutObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key), Body: f, ContentLength: aws.Int64(info.Size()), ContentType: aws.String(contentType), IfNoneMatch: aws.String("*")})
	return e
}
func (s *S3Storage) Exists(ctx context.Context, key string) (bool, error) {
	if !validKey(key) {
		return false, ErrInvalidKey
	}
	_, e := s.client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)})
	var api smithy.APIError
	if errors.As(e, &api) && (api.ErrorCode() == "NotFound" || api.ErrorCode() == "NoSuchKey") {
		return false, nil
	}
	return e == nil, e
}
func (s *S3Storage) Size(ctx context.Context, key string) (int64, error) {
	if !validKey(key) {
		return 0, ErrInvalidKey
	}
	result, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)})
	if err != nil {
		return 0, err
	}
	if result.ContentLength == nil || *result.ContentLength < 0 {
		return 0, errors.New("storage did not return the media size")
	}
	return *result.ContentLength, nil
}
func (s *S3Storage) Delete(ctx context.Context, key string) error {
	if !validKey(key) {
		return ErrInvalidKey
	}
	_, e := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)})
	return e
}
func (s *S3Storage) DeletePrefix(ctx context.Context, prefix string) (int, error) {
	prefix = strings.TrimSuffix(prefix, "/")
	if !validKey(prefix) {
		return 0, ErrInvalidKey
	}
	prefix += "/"
	count := 0
	var token *string
	for {
		result, e := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{Bucket: aws.String(s.bucket), Prefix: aws.String(prefix), ContinuationToken: token})
		if e != nil {
			return count, e
		}
		objects := make([]types.ObjectIdentifier, 0, len(result.Contents))
		for _, v := range result.Contents {
			if v.Key == nil || !strings.HasPrefix(*v.Key, prefix) || !validKey(*v.Key) {
				return count, ErrInvalidKey
			}
			objects = append(objects, types.ObjectIdentifier{Key: v.Key})
		}
		if len(objects) > 0 {
			deleted, e := s.client.DeleteObjects(ctx, &s3.DeleteObjectsInput{Bucket: aws.String(s.bucket), Delete: &types.Delete{Objects: objects, Quiet: aws.Bool(true)}})
			if e != nil {
				return count, e
			}
			if len(deleted.Errors) > 0 {
				return count, errors.New("storage failed to delete some objects")
			}
			count += len(objects)
		}
		if !aws.ToBool(result.IsTruncated) {
			return count, nil
		}
		if result.NextContinuationToken == nil || *result.NextContinuationToken == "" || (token != nil && *token == *result.NextContinuationToken) {
			return count, errors.New("truncated storage listing has no new cursor")
		}
		token = result.NextContinuationToken
	}
}
func (s *S3Storage) SignedURL(ctx context.Context, key string, ttl time.Duration) (string, error) {
	if !validKey(key) {
		return "", ErrInvalidKey
	}
	result, e := s.presign.PresignGetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)}, func(o *s3.PresignOptions) { o.Expires = ttl })
	if e != nil {
		return "", e
	}
	return result.URL, nil
}
