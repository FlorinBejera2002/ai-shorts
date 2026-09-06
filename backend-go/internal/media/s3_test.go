package media

import (
	"context"
	"errors"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
)

type fakeS3 struct {
	prefixes                        []string
	deleted                         []string
	pages                           int
	partial, brokenPage, foreignKey bool
	headError                       error
	put                             []byte
	putType                         string
}

func (f *fakeS3) PutObject(ctx context.Context, in *s3.PutObjectInput, options ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	if aws.ToString(in.IfNoneMatch) != "*" {
		return nil, errors.New("overwrite permitted")
	}
	f.put, _ = io.ReadAll(in.Body)
	f.putType = aws.ToString(in.ContentType)
	return &s3.PutObjectOutput{}, nil
}
func (f *fakeS3) HeadObject(context.Context, *s3.HeadObjectInput, ...func(*s3.Options)) (*s3.HeadObjectOutput, error) {
	return &s3.HeadObjectOutput{}, f.headError
}
func (f *fakeS3) DeleteObject(ctx context.Context, in *s3.DeleteObjectInput, o ...func(*s3.Options)) (*s3.DeleteObjectOutput, error) {
	f.deleted = append(f.deleted, aws.ToString(in.Key))
	return &s3.DeleteObjectOutput{}, nil
}
func (f *fakeS3) ListObjectsV2(ctx context.Context, in *s3.ListObjectsV2Input, o ...func(*s3.Options)) (*s3.ListObjectsV2Output, error) {
	f.prefixes = append(f.prefixes, aws.ToString(in.Prefix))
	f.pages++
	key := aws.ToString(in.Prefix) + "one.mp4"
	if f.foreignKey {
		key = "clips/job-10/private.mp4"
	}
	page := &s3.ListObjectsV2Output{Contents: []types.Object{{Key: aws.String(key)}}}
	if f.pages == 1 {
		page.IsTruncated = aws.Bool(true)
		if !f.brokenPage {
			page.NextContinuationToken = aws.String("page-two")
		}
	}
	return page, nil
}
func (f *fakeS3) DeleteObjects(ctx context.Context, in *s3.DeleteObjectsInput, o ...func(*s3.Options)) (*s3.DeleteObjectsOutput, error) {
	for _, object := range in.Delete.Objects {
		f.deleted = append(f.deleted, aws.ToString(object.Key))
	}
	result := &s3.DeleteObjectsOutput{}
	if f.partial {
		result.Errors = []types.Error{{Code: aws.String("AccessDenied")}}
	}
	return result, nil
}
func TestS3PrefixCleanupScopesAndHandlesPartialFailure(t *testing.T) {
	for _, scenario := range []string{"success", "partial", "truncated", "foreign"} {
		t.Run(scenario, func(t *testing.T) {
			client := &fakeS3{partial: scenario == "partial", brokenPage: scenario == "truncated", foreignKey: scenario == "foreign"}
			storage := &S3Storage{client: client, bucket: "media"}
			count, e := storage.DeletePrefix(context.Background(), "clips/job-1/")
			if scenario == "success" {
				if e != nil || count != 2 {
					t.Fatalf("%d %v", count, e)
				}
			} else if e == nil {
				t.Fatal("cleanup accepted unsafe provider response")
			}
			for _, prefix := range client.prefixes {
				if prefix != "clips/job-1/" {
					t.Fatalf("wrong prefix: %s", prefix)
				}
			}
			if scenario == "foreign" && len(client.deleted) > 0 {
				t.Fatal("deleted foreign provider key")
			}
		})
	}
}
func TestS3ExistsDistinguishesMissingFromOutage(t *testing.T) {
	client := &fakeS3{}
	storage := &S3Storage{client: client, bucket: "media"}
	for _, code := range []string{"NoSuchKey", "NotFound", "AccessDenied", "ServiceUnavailable"} {
		client.headError = &smithy.GenericAPIError{Code: code}
		exists, e := storage.Exists(context.Background(), "clips/job/clip.mp4")
		if exists {
			t.Fatal("error reported present")
		}
		missing := code == "NoSuchKey" || code == "NotFound"
		if (e == nil) != missing {
			t.Fatalf("%s: %v", code, e)
		}
	}
}
func TestS3UploadAndPrivatePresign(t *testing.T) {
	client := &fakeS3{}
	storage := &S3Storage{client: client, bucket: "media"}
	filename := filepath.Join(t.TempDir(), "video")
	_ = os.WriteFile(filename, videoBytes, 0600)
	if e := storage.Save(context.Background(), filename, "uploads/user/video.mp4", "video/mp4"); e != nil {
		t.Fatal(e)
	}
	if string(client.put) != string(videoBytes) || client.putType != "video/mp4" {
		t.Fatal("upload changed bytes/type")
	}
	remote, e := NewS3Storage(S3Config{AccessKey: "test-access", SecretKey: "test-secret", Bucket: "private-media", Region: "auto", Endpoint: "https://account.r2.cloudflarestorage.com", PathStyle: true})
	if e != nil {
		t.Fatal(e)
	}
	signed, e := remote.SignedURL(context.Background(), "clips/job/clip.mp4", time.Hour)
	if e != nil {
		t.Fatal(e)
	}
	parsed, e := url.Parse(signed)
	if e != nil || parsed.Host != "account.r2.cloudflarestorage.com" || parsed.Path != "/private-media/clips/job/clip.mp4" || parsed.Query().Get("X-Amz-Signature") == "" || parsed.Query().Get("X-Amz-Expires") != "3600" {
		t.Fatalf("invalid private URL: %s %v", signed, e)
	}
	if strings.Contains(signed, "test-secret") {
		t.Fatal("secret leaked")
	}
	if _, e := remote.SignedURL(context.Background(), "../secret", time.Hour); e == nil {
		t.Fatal("signed unsafe key")
	}
}
