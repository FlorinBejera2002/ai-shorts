package jobs

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"

	"sneepcut/backend-go/internal/credits"
)

// SourceLocator resolves a stored upload to the location a worker reads from.
// The media service satisfies it.
type SourceLocator interface {
	WorkerSource(context.Context, string) (string, error)
}

// UploadJobs creates clip jobs from uploads that are already stored, using the
// same option rules, audio cleanup availability, credit reservation and worker
// queueing as POST /api/jobs. It is used by features that import media first.
type UploadJobs struct {
	repo    *Repository
	sources SourceLocator
}

func NewUploadJobs(db *sql.DB, sources SourceLocator) *UploadJobs {
	return &UploadJobs{repo: NewRepository(db), sources: sources}
}

// DecodeOptions reads job options exactly as POST /api/jobs does: defaults first,
// then the request fields, rejecting unknown and trailing fields. Source fields
// are unknown here, so they are rejected too.
func DecodeOptions(raw []byte) (Options, error) {
	options := DefaultOptions()
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&options); err != nil {
		return Options{}, errors.New("invalid job options")
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return Options{}, errors.New("invalid job options")
	}
	if err := options.Validate(); err != nil {
		return Options{}, err
	}
	return options, nil
}

// Precheck runs the POST /api/jobs checks that need no stored source, for count
// jobs with these options: option rules, audio cleanup availability, and the
// same credit and account reservation, which is rolled back. Nothing is charged.
func (u *UploadJobs) Precheck(ctx context.Context, userID string, options Options, count int) error {
	if err := options.Validate(); err != nil {
		return err
	}
	if err := validateAudioCleanup([]Prepared{{Input: CreateInput{Options: options}}}); err != nil {
		return err
	}
	tx, err := u.repo.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	_, err = credits.Reserve(ctx, tx, userID, count*options.ResolvedClipCount()*10)
	return err
}

// CreateTx queues one clip job for the stored upload sourceKey inside the
// caller's transaction, so the caller can record the job id atomically with it.
func (u *UploadJobs) CreateTx(ctx context.Context, tx *sql.Tx, userID, sourceKey string, options Options) (string, error) {
	source, err := u.sources.WorkerSource(ctx, sourceKey)
	if err != nil {
		return "", err
	}
	key := sourceKey
	input := CreateInput{Options: options, SourceType: "upload", SourceStorageKey: &key, SourceFilePath: &key}
	rows, err := u.repo.createTx(ctx, tx, userID, []Prepared{{Input: input, WorkerSource: source}})
	if err != nil {
		return "", err
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(rows[0], &created); err != nil || created.ID == "" {
		return "", errors.New("job creation returned no job id")
	}
	return created.ID, nil
}
