package media

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
)

type multipartFake struct {
	fakeS3
	data                         []byte
	metadata                     map[string]string
	parts                        int
	failPart                     bool
	completionError              error
	aborted, completed, ownWrite bool
}

func (f *multipartFake) CreateMultipartUpload(_ context.Context, in *s3.CreateMultipartUploadInput, _ ...func(*s3.Options)) (*s3.CreateMultipartUploadOutput, error) {
	f.metadata = in.Metadata
	return &s3.CreateMultipartUploadOutput{UploadId: aws.String("upload")}, nil
}
func (f *multipartFake) UploadPart(_ context.Context, in *s3.UploadPartInput, _ ...func(*s3.Options)) (*s3.UploadPartOutput, error) {
	if f.failPart {
		return nil, errors.New("part failed")
	}
	part, err := io.ReadAll(in.Body)
	if err != nil || int64(len(part)) != aws.ToInt64(in.ContentLength) || int(aws.ToInt32(in.PartNumber)) != f.parts+1 {
		return nil, errors.New("wrong section")
	}
	f.data = append(f.data, part...)
	f.parts++
	return &s3.UploadPartOutput{ETag: aws.String("etag")}, nil
}
func (f *multipartFake) CompleteMultipartUpload(_ context.Context, in *s3.CompleteMultipartUploadInput, _ ...func(*s3.Options)) (*s3.CompleteMultipartUploadOutput, error) {
	if aws.ToString(in.IfNoneMatch) != "*" || len(in.MultipartUpload.Parts) != f.parts {
		return nil, errors.New("unsafe completion")
	}
	f.completed = true
	return &s3.CompleteMultipartUploadOutput{}, f.completionError
}
func (f *multipartFake) AbortMultipartUpload(ctx context.Context, _ *s3.AbortMultipartUploadInput, _ ...func(*s3.Options)) (*s3.AbortMultipartUploadOutput, error) {
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	f.aborted = true
	return &s3.AbortMultipartUploadOutput{}, nil
}
func (f *multipartFake) HeadObject(context.Context, *s3.HeadObjectInput, ...func(*s3.Options)) (*s3.HeadObjectOutput, error) {
	metadata := map[string]string{"sneepcut-write-id": "someone-else"}
	if f.ownWrite {
		metadata = f.metadata
	}
	return &s3.HeadObjectOutput{ContentLength: aws.Int64(int64(len(f.data))), Metadata: metadata}, nil
}

func TestMultipartStreamingConditionalCompletionAndCleanup(t *testing.T) {
	for _, scenario := range []string{"success", "failed-part", "own-completion", "other-writer", "own-missing-upload", "missing-upload"} {
		t.Run(scenario, func(t *testing.T) {
			client := &multipartFake{failPart: scenario == "failed-part", ownWrite: scenario == "own-completion" || scenario == "own-missing-upload"}
			if scenario == "own-completion" || scenario == "other-writer" {
				client.completionError = &smithy.GenericAPIError{Code: "PreconditionFailed", Message: "conditional"}
			}
			if scenario == "own-missing-upload" || scenario == "missing-upload" {
				client.completionError = &smithy.GenericAPIError{Code: "NoSuchUpload", Message: "upload no longer exists"}
			}
			file := filepath.Join(t.TempDir(), "video")
			data := []byte("first-second-third")
			if err := os.WriteFile(file, data, 0600); err != nil {
				t.Fatal(err)
			}
			input, err := os.Open(file)
			if err != nil {
				t.Fatal(err)
			}
			defer input.Close()
			err = (&S3Storage{client: client, bucket: "dev"}).saveMultipart(context.Background(), input, int64(len(data)), "sources/test/source.mp4", "video/mp4", 6)
			wantSuccess := scenario == "success" || scenario == "own-completion" || scenario == "own-missing-upload"
			if (err == nil) != wantSuccess || client.aborted == wantSuccess {
				t.Fatalf("%v aborted=%v", err, client.aborted)
			}
			if wantSuccess && (!bytes.Equal(data, client.data) || client.parts != 3 || !client.completed) {
				t.Fatal("streamed data or parts changed")
			}
		})
	}
}
