package main

import (
	"context"
	"errors"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

func TestConfigurationRequiresOfflineSourceAndExplicitSafeDestination(t *testing.T) {
	baseline := map[string]string{
		"SNEEPCUT_S3_MIGRATION_WRITERS_STOPPED": "true", "LOCAL_MEDIA_ROOT": "/offline/media",
		"AWS_S3_BUCKET": "synthetic", "SNEEPCUT_S3_MIGRATION_CONFIRM_BUCKET": "synthetic",
		"AWS_ENDPOINT_URL": "https://hel1.your-objectstorage.com", "AWS_REGION": "hel1",
		"AWS_ACCESS_KEY_ID": "synthetic", "AWS_SECRET_ACCESS_KEY": "synthetic",
	}
	if _, err := configuration(func(key string) string { return baseline[key] }); err != nil {
		t.Fatal(err)
	}
	for key, values := range map[string][]string{
		"SNEEPCUT_S3_MIGRATION_WRITERS_STOPPED": {"", "false"},
		"LOCAL_MEDIA_ROOT":                      {""}, "AWS_S3_BUCKET": {""},
		"SNEEPCUT_S3_MIGRATION_CONFIRM_BUCKET": {"", "different"},
		"AWS_ENDPOINT_URL":                     {"", "http://hel1.your-objectstorage.com", "https://user:secret@host", "https://host/path", "https://host?query=1", "https://host#fragment"},
		"AWS_ACCESS_KEY_ID":                    {""}, "AWS_SECRET_ACCESS_KEY": {""}, "AWS_REGION": {""},
	} {
		for _, value := range values {
			t.Run(key+"/"+value, func(t *testing.T) {
				_, err := configuration(func(candidate string) string {
					if candidate == key {
						return value
					}
					return baseline[candidate]
				})
				if err == nil {
					t.Fatal("unsafe or unconfirmed migration was accepted")
				}
			})
		}
	}
}

type fakeBucket struct {
	status types.BucketVersioningStatus
	group  string
	err    error
}

func (f fakeBucket) HeadBucket(context.Context, *s3.HeadBucketInput, ...func(*s3.Options)) (*s3.HeadBucketOutput, error) {
	return &s3.HeadBucketOutput{}, f.err
}

func (f fakeBucket) GetBucketVersioning(context.Context, *s3.GetBucketVersioningInput, ...func(*s3.Options)) (*s3.GetBucketVersioningOutput, error) {
	return &s3.GetBucketVersioningOutput{Status: f.status}, nil
}

func (f fakeBucket) GetBucketAcl(context.Context, *s3.GetBucketAclInput, ...func(*s3.Options)) (*s3.GetBucketAclOutput, error) {
	var grants []types.Grant
	if f.group != "" {
		grants = []types.Grant{{Grantee: &types.Grantee{URI: aws.String(f.group)}}}
	}
	return &s3.GetBucketAclOutput{Grants: grants}, nil
}

func TestBucketPreflightRejectsPublicVersionedAndInaccessibleTargets(t *testing.T) {
	for _, test := range []struct {
		name    string
		client  fakeBucket
		allowed bool
	}{
		{"private unversioned", fakeBucket{}, true},
		{"enabled", fakeBucket{status: types.BucketVersioningStatusEnabled}, false},
		{"suspended", fakeBucket{status: types.BucketVersioningStatusSuspended}, false},
		{"public", fakeBucket{group: "http://acs.amazonaws.com/groups/global/AllUsers"}, false},
		{"all accounts", fakeBucket{group: "http://acs.amazonaws.com/groups/global/AuthenticatedUsers"}, false},
		{"inaccessible", fakeBucket{err: errors.New("access denied")}, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			err := verifyBucket(context.Background(), test.client, "synthetic")
			if (err == nil) != test.allowed {
				t.Fatalf("allowed=%v, got %v", test.allowed, err)
			}
		})
	}
}
