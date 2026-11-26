// migrate-media-s3 copies an offline media directory into an explicitly
// confirmed private S3 bucket. It preserves keys and verifies every byte;
// originals and conflicting destination objects are never overwritten.
package main

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"sneepcut/backend-go/internal/media"
)

type migrationConfig struct {
	source      string
	destination media.S3Config
}

func configuration(getenv func(string) string) (migrationConfig, error) {
	var cfg migrationConfig
	if getenv("SNEEPCUT_S3_MIGRATION_WRITERS_STOPPED") != "true" {
		return cfg, errors.New("stop media writers and set SNEEPCUT_S3_MIGRATION_WRITERS_STOPPED=true")
	}
	cfg.source = getenv("LOCAL_MEDIA_ROOT")
	if cfg.source == "" {
		return cfg, errors.New("set LOCAL_MEDIA_ROOT to the offline source directory")
	}
	cfg.destination = media.S3Config{
		AccessKey: getenv("AWS_ACCESS_KEY_ID"), SecretKey: getenv("AWS_SECRET_ACCESS_KEY"),
		SessionToken: getenv("AWS_SESSION_TOKEN"), Region: getenv("AWS_REGION"),
		Bucket: getenv("AWS_S3_BUCKET"), Endpoint: getenv("AWS_ENDPOINT_URL"),
		PathStyle: getenv("AWS_S3_FORCE_PATH_STYLE") == "true",
	}
	if cfg.destination.Bucket == "" || cfg.destination.Bucket != getenv("SNEEPCUT_S3_MIGRATION_CONFIRM_BUCKET") {
		return cfg, errors.New("SNEEPCUT_S3_MIGRATION_CONFIRM_BUCKET must match AWS_S3_BUCKET")
	}
	endpoint, err := url.Parse(cfg.destination.Endpoint)
	if err != nil || endpoint.Scheme != "https" || endpoint.Host == "" || endpoint.User != nil ||
		endpoint.RawQuery != "" || endpoint.Fragment != "" || (endpoint.Path != "" && endpoint.Path != "/") {
		return cfg, errors.New("migration requires an explicit regional HTTPS S3 endpoint without credentials or a path")
	}
	if cfg.destination.AccessKey == "" || cfg.destination.SecretKey == "" || cfg.destination.Region == "" {
		return cfg, errors.New("S3 credentials and region are required")
	}
	return cfg, nil
}

type bucketInspector interface {
	HeadBucket(context.Context, *s3.HeadBucketInput, ...func(*s3.Options)) (*s3.HeadBucketOutput, error)
	GetBucketVersioning(context.Context, *s3.GetBucketVersioningInput, ...func(*s3.Options)) (*s3.GetBucketVersioningOutput, error)
	GetBucketAcl(context.Context, *s3.GetBucketAclInput, ...func(*s3.Options)) (*s3.GetBucketAclOutput, error)
}

func verifyBucket(ctx context.Context, client bucketInspector, bucket string) error {
	if _, err := client.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(bucket)}); err != nil {
		return fmt.Errorf("confirmed bucket is unavailable: %w", err)
	}
	versioning, err := client.GetBucketVersioning(ctx, &s3.GetBucketVersioningInput{Bucket: aws.String(bucket)})
	if err != nil {
		return fmt.Errorf("inspect bucket versioning: %w", err)
	}
	if versioning.Status != "" {
		return errors.New("migration requires a bucket that has never enabled versioning")
	}
	acl, err := client.GetBucketAcl(ctx, &s3.GetBucketAclInput{Bucket: aws.String(bucket)})
	if err != nil {
		return fmt.Errorf("inspect bucket privacy: %w", err)
	}
	for _, grant := range acl.Grants {
		if grant.Grantee == nil {
			continue
		}
		group := aws.ToString(grant.Grantee.URI)
		if strings.HasSuffix(group, "/AllUsers") || strings.HasSuffix(group, "/AuthenticatedUsers") {
			return errors.New("migration requires a private bucket without public group grants")
		}
	}
	return nil
}

func run(ctx context.Context) error {
	cfg, err := configuration(os.Getenv)
	if err != nil {
		return err
	}
	sourceInfo, err := os.Lstat(cfg.source)
	if err != nil || !sourceInfo.IsDir() || sourceInfo.Mode()&os.ModeSymlink != 0 {
		return errors.New("LOCAL_MEDIA_ROOT must be an existing regular directory")
	}
	client := s3.NewFromConfig(aws.Config{
		Region: cfg.destination.Region,
		Credentials: credentials.NewStaticCredentialsProvider(cfg.destination.AccessKey,
			cfg.destination.SecretKey, cfg.destination.SessionToken),
	}, func(options *s3.Options) {
		options.BaseEndpoint = aws.String(cfg.destination.Endpoint)
		options.UsePathStyle = cfg.destination.PathStyle
	})
	preflight, cancel := context.WithTimeout(ctx, time.Minute)
	err = verifyBucket(preflight, client, cfg.destination.Bucket)
	cancel()
	if err != nil {
		return err
	}
	source, err := media.NewLocalStorage(cfg.source)
	if err != nil {
		return err
	}
	defer source.Close()
	destination, err := media.NewS3Storage(cfg.destination)
	if err != nil {
		return err
	}
	fmt.Println("Confirmed private unversioned bucket; copying offline media with full-byte verification.")
	result, err := media.MigrateLocal(ctx, source, destination)
	if err != nil {
		return err
	}
	fmt.Printf("Verified S3 media import: copied=%d existing=%d bytes=%d; originals retained\n", result.Copied, result.Existing, result.Bytes)
	return nil
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, 3*time.Hour)
	defer cancel()
	if err := run(ctx); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
