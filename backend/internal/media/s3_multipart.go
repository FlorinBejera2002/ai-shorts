package media

import (
	"context"
	"crypto/rand"
	"errors"
	"io"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
)

const multipartThreshold int64 = 128 << 20
const multipartPartSize int64 = 64 << 20

type s3MultipartAPI interface {
	CreateMultipartUpload(context.Context, *s3.CreateMultipartUploadInput, ...func(*s3.Options)) (*s3.CreateMultipartUploadOutput, error)
	UploadPart(context.Context, *s3.UploadPartInput, ...func(*s3.Options)) (*s3.UploadPartOutput, error)
	CompleteMultipartUpload(context.Context, *s3.CompleteMultipartUploadInput, ...func(*s3.Options)) (*s3.CompleteMultipartUploadOutput, error)
	AbortMultipartUpload(context.Context, *s3.AbortMultipartUploadInput, ...func(*s3.Options)) (*s3.AbortMultipartUploadOutput, error)
}

// Stream seekable sections instead of buffering a multi-GB video in memory.
// The final conditional create preserves Save's no-overwrite contract.
func (s *S3Storage) saveMultipart(ctx context.Context, file *os.File, size int64, key, contentType string, partSize int64) error {
	client, ok := s.client.(s3MultipartAPI)
	if !ok {
		return errors.New("storage does not support large media uploads")
	}
	writeID := rand.Text()
	created, err := client.CreateMultipartUpload(ctx, &s3.CreateMultipartUploadInput{Bucket: aws.String(s.bucket), Key: aws.String(key), ContentType: aws.String(contentType), Metadata: map[string]string{"sneepcut-write-id": writeID}})
	if err != nil {
		return err
	}
	if created == nil || aws.ToString(created.UploadId) == "" {
		return errors.New("storage returned no multipart upload ID")
	}
	completed := false
	defer func() {
		if completed {
			return
		}
		cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
		defer cancel()
		_, _ = client.AbortMultipartUpload(cleanup, &s3.AbortMultipartUploadInput{Bucket: aws.String(s.bucket), Key: aws.String(key), UploadId: created.UploadId})
	}()
	parts := []types.CompletedPart{}
	for offset, number := int64(0), int32(1); offset < size; number++ {
		length := min(partSize, size-offset)
		part, e := client.UploadPart(ctx, &s3.UploadPartInput{Bucket: aws.String(s.bucket), Key: aws.String(key), UploadId: created.UploadId, PartNumber: aws.Int32(number), ContentLength: aws.Int64(length), Body: io.NewSectionReader(file, offset, length)})
		if e != nil {
			return e
		}
		if part == nil || aws.ToString(part.ETag) == "" {
			return errors.New("storage returned no multipart part ETag")
		}
		parts = append(parts, types.CompletedPart{PartNumber: aws.Int32(number), ETag: part.ETag})
		offset += length
	}
	_, err = client.CompleteMultipartUpload(ctx, &s3.CompleteMultipartUploadInput{Bucket: aws.String(s.bucket), Key: aws.String(key), UploadId: created.UploadId, IfNoneMatch: aws.String("*"), MultipartUpload: &types.CompletedMultipartUpload{Parts: parts}})
	if err == nil {
		completed = true
		return nil
	}
	// A retry after a committed completion can see NoSuchUpload. Reconcile only
	// our own write ID and size, just as for a lost conditional-create response.
	var api smithy.APIError
	missingUpload := errors.As(err, &api) && api.ErrorCode() == "NoSuchUpload"
	if ctx.Err() == nil && (uncertainS3Write(err) || missingUpload) {
		saved, e := s.client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)})
		if e == nil && saved != nil && saved.Metadata["sneepcut-write-id"] == writeID && aws.ToInt64(saved.ContentLength) == size {
			completed = true
			return nil
		}
	}
	return err
}
