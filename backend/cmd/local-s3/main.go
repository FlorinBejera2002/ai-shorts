// local-s3 prepares only the loopback development store. Production setup is
// deliberately separate so local commands cannot mutate a paid provider.
package main

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"sneepcut/backend-go/internal/media"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	endpoint := os.Getenv("AWS_ENDPOINT_URL")
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "http" || u.User != nil || u.RawQuery != "" || u.Fragment != "" ||
		(u.Path != "" && u.Path != "/") || (u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1" && u.Hostname() != "::1") {
		return fmt.Errorf("local-s3 requires a loopback HTTP endpoint")
	}
	origins := strings.Split(os.Getenv("SNEEPCUT_LOCAL_S3_ORIGINS"), ",")
	for _, origin := range origins {
		u, err := url.Parse(origin)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" ||
			u.Path != "" || (u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1" && u.Hostname() != "::1") {
			return fmt.Errorf("local-s3 requires explicit loopback browser origins")
		}
	}
	cfg := media.S3Config{
		Endpoint: endpoint, Bucket: os.Getenv("AWS_S3_BUCKET"), Region: "us-east-1",
		AccessKey: os.Getenv("AWS_ACCESS_KEY_ID"), SecretKey: os.Getenv("AWS_SECRET_ACCESS_KEY"),
		PathStyle: true,
	}
	storage, err := media.NewS3Storage(cfg)
	if err != nil {
		return err
	}
	client := s3.NewFromConfig(aws.Config{
		Region:      cfg.Region,
		Credentials: credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, ""),
	}, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = true
	})
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	if _, err := client.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(cfg.Bucket)}); err != nil {
		return fmt.Errorf("local bucket is unavailable; run make seaweed-up")
	}
	versioning, err := client.GetBucketVersioning(ctx, &s3.GetBucketVersioningInput{Bucket: aws.String(cfg.Bucket)})
	if err != nil || versioning.Status != "" {
		return fmt.Errorf("local cutover requires a bucket that has never enabled versioning")
	}
	cors := types.CORSRule{
		AllowedOrigins: origins, AllowedMethods: []string{"GET", "HEAD"},
		AllowedHeaders: []string{"*"},
		ExposeHeaders:  []string{"ETag", "Content-Length", "Content-Range", "Accept-Ranges"},
		MaxAgeSeconds:  aws.Int32(300),
	}
	if _, err := client.PutBucketCors(ctx, &s3.PutBucketCorsInput{
		Bucket:            aws.String(cfg.Bucket),
		CORSConfiguration: &types.CORSConfiguration{CORSRules: []types.CORSRule{cors}},
	}); err != nil {
		return fmt.Errorf("configure local media CORS: %w", err)
	}
	source, err := media.NewLocalStorage(os.Getenv("SNEEPCUT_LOCAL_MEDIA_SOURCE"))
	if err != nil {
		return err
	}
	defer source.Close()
	result, err := media.MigrateLocal(ctx, source, storage)
	if err != nil {
		return err
	}
	fmt.Printf("Verified local S3 migration: copied=%d existing=%d bytes=%d; originals retained\n", result.Copied, result.Existing, result.Bytes)
	return nil
}
