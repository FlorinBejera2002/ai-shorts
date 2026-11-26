package youtubeimport

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"

	"sneepcut/backend-go/internal/audiocleanup"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/jobs"
	"sneepcut/backend-go/internal/locale"
	"sneepcut/backend-go/internal/youtubechannel"
)

// A selected import brings in only the channel videos the user chose. Each one
// becomes a clip job as soon as its file is stored. Statuses per selected video:
// waiting -> importing (stored, job not yet queued) -> processing (job queued),
// or missing (not found in the export) and failed (rejected or ambiguous).
const (
	selectionWaiting    = "waiting"
	selectionImporting  = "importing"
	selectionProcessing = "processing"
	selectionMissing    = "missing"
	selectionFailed     = "failed"
)

const (
	maxSelectedVideos   = 10
	maxSelectionBody    = 16000
	selectionAmbiguous  = "Several YouTube videos share this title, so the export file could not be matched to one of them. Import them separately."
	selectionRejected   = "This video could not be imported. Check its file limits or try again."
	selectionNotFound   = "The video was not found in the YouTube export."
	selectionUnfinished = "The YouTube import did not finish. Start a new import."
)

var videoIDPattern11 = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)

// ChannelVideos looks up the user's own channel uploads by id. The youtubechannel
// service satisfies it.
type ChannelVideos interface {
	LookupVideos(ctx context.Context, userID string, ids []string) ([]youtubechannel.Video, error)
}

// SelectionJobs checks and queues clip jobs. The jobs.UploadJobs type satisfies it.
type SelectionJobs interface {
	Precheck(ctx context.Context, userID string, options jobs.Options, count int) error
	CreateTx(ctx context.Context, tx *sql.Tx, userID, sourceKey string, options jobs.Options) (string, error)
}

// WithSelection enables the selected-videos import. Without it the selection
// endpoint answers 503 and whole-category imports are unaffected.
func (h *Handler) WithSelection(channel ChannelVideos, queue SelectionJobs) *Handler {
	h.channel, h.queue = channel, queue
	return h
}

// selectedVideo is one chosen channel video as stored for an import.
type selectedVideo struct {
	position     int
	videoID      string
	title        string
	thumbnailURL string
	status       string
	sourceKey    string
	jobID        string
	errorText    string
}

// selectionRequest is the validated selection stored with a new import.
type selectionRequest struct {
	options []byte
	videos  []selectedVideo
}

// SelectionItem is one chosen video as the Create page shows it.
type SelectionItem struct {
	VideoID      string  `json:"video_id"`
	Title        string  `json:"title"`
	ThumbnailURL string  `json:"thumbnail_url"`
	Status       string  `json:"status"`
	JobID        *string `json:"job_id"`
	Error        string  `json:"error"`
}

// SelectionOverview lists the chosen videos of a selected import, in the order chosen.
type SelectionOverview struct {
	Items []SelectionItem `json:"items"`
}

// selectionPlan matches archive files to the chosen videos of one import.
type selectionPlan struct {
	items []*selectedVideo
	byID  map[string]*selectedVideo
}

func newSelectionPlan(items []*selectedVideo) *selectionPlan {
	plan := &selectionPlan{items: items, byID: make(map[string]*selectedVideo, len(items))}
	for _, item := range items {
		plan.byID[item.videoID] = item
	}
	return plan
}

// wants reports whether an archive video should be read. Only a video matched to
// a single waiting item qualifies, so a restarted import never re-reads stored
// videos and an ambiguous file is never copied.
func (p *selectionPlan) wants(video ImportedVideo) bool {
	if video.Ambiguous {
		return false
	}
	item, _ := p.match(video)
	return item != nil
}

// selectionSelector applies a selection plan to one import's archive read.
type selectionSelector struct {
	handler *Handler
	work    importWork
	plan    *selectionPlan
}

// Prepare fails every chosen item whose title several export files share. It
// runs before any file is copied, so an ambiguous file's bytes are never read.
func (s *selectionSelector) Prepare(ctx context.Context, videos []ImportedVideo) error {
	for _, video := range videos {
		if !video.Ambiguous {
			continue
		}
		_, candidates := s.plan.match(video)
		for _, item := range candidates {
			if err := s.handler.rejectSelection(ctx, s.work, item, selectionAmbiguous); err != nil {
				return err
			}
		}
	}
	return nil
}

// Wants reports whether the archive video matches a waiting chosen item.
func (s *selectionSelector) Wants(video ImportedVideo) bool {
	return s.plan.wants(video)
}

// match returns the single waiting item a video belongs to. When the title cannot
// identify one item, it returns the waiting items sharing that title as failing
// instead of guessing.
func (p *selectionPlan) match(video ImportedVideo) (*selectedVideo, []*selectedVideo) {
	if video.VideoID != "" {
		if item := p.byID[video.VideoID]; item != nil && item.status == selectionWaiting && !video.Ambiguous {
			return item, nil
		}
		return nil, nil
	}
	var candidates []*selectedVideo
	for _, item := range p.items {
		if item.status == selectionWaiting && sameFileTitle(item.title, video.Title) {
			candidates = append(candidates, item)
		}
	}
	if video.Ambiguous || len(candidates) > 1 {
		return nil, candidates
	}
	if len(candidates) == 1 {
		return candidates[0], nil
	}
	return nil, nil
}

// sameFileTitle compares a channel title with an export file's title stem. The
// channel title is compared both as-is and with unsafe file-name characters
// replaced, after whitespace is normalised.
func sameFileTitle(channelTitle, fileStem string) bool {
	stem := normalizeTitle(fileStem)
	return normalizeTitle(fileStemFor(channelTitle)) == stem || normalizeTitle(channelTitle) == stem
}

func normalizeTitle(value string) string {
	return strings.Join(strings.Fields(value), " ")
}

// normalizeSelectionIDs checks the requested ids: between 1 and maxSelectedVideos,
// each a YouTube id, with no repeats.
func normalizeSelectionIDs(ids []string) ([]string, bool) {
	if len(ids) < 1 || len(ids) > maxSelectedVideos {
		return nil, false
	}
	seen := make(map[string]bool, len(ids))
	for _, id := range ids {
		if !videoIDPattern11.MatchString(id) || seen[id] {
			return nil, false
		}
		seen[id] = true
	}
	return ids, true
}

// classifySelection keeps the chosen channel videos in request order. Ids that are
// not on the connected channel, or that are private, are returned as rejected.
func classifySelection(ids []string, videos []youtubechannel.Video) ([]youtubechannel.Video, []string) {
	byID := make(map[string]youtubechannel.Video, len(videos))
	for _, video := range videos {
		byID[video.ID] = video
	}
	var picked []youtubechannel.Video
	var rejected []string
	for _, id := range ids {
		video, ok := byID[id]
		if !ok || (video.Visibility != youtubechannel.VisibilityPublic && video.Visibility != youtubechannel.VisibilityUnlisted) {
			rejected = append(rejected, id)
			continue
		}
		picked = append(picked, video)
	}
	return picked, rejected
}

// selectionFailureStatus maps job creation errors to the HTTP status POST /api/jobs uses.
func selectionFailureStatus(err error) (int, string) {
	switch {
	case errors.Is(err, jobs.ErrCredits):
		return http.StatusPaymentRequired, err.Error()
	case errors.Is(err, jobs.ErrInactive):
		return http.StatusForbidden, err.Error()
	case errors.Is(err, audiocleanup.ErrUnavailable):
		return http.StatusServiceUnavailable, err.Error()
	default:
		return http.StatusServiceUnavailable, "Job service is temporarily unavailable"
	}
}

// selectionImport starts an import of chosen channel videos. Everything that can
// be checked without Google (ids, consent, job options, credits, channel
// membership and visibility) is checked before the Google consent window opens.
func (h *Handler) selectionImport(w http.ResponseWriter, r *http.Request) {
	if !h.cfg.Enabled || h.channel == nil || h.queue == nil {
		writeError(w, http.StatusServiceUnavailable, "YouTube account import is not available yet.")
		return
	}
	if !h.canConnect(r) {
		writeError(w, http.StatusForbidden, "YouTube account import is currently available only to administrators during testing.")
		return
	}
	var input struct {
		VideoIDs []string        `json:"video_ids"`
		Job      json.RawMessage `json:"job"`
		Consent  bool            `json:"consent"`
		Locale   string          `json:"locale"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxSelectionBody))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&input) != nil || decoder.Decode(&struct{}{}) != io.EOF {
		writeError(w, http.StatusBadRequest, "Invalid import request.")
		return
	}
	ids, ok := normalizeSelectionIDs(input.VideoIDs)
	if !ok || !input.Consent {
		writeError(w, http.StatusBadRequest, "Choose between 1 and 10 videos and accept the import disclosure.")
		return
	}
	options := jobs.DefaultOptions()
	if len(input.Job) > 0 && string(input.Job) != "null" {
		decoded, err := jobs.DecodeOptions(input.Job)
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		options = decoded
	}
	encodedOptions, err := json.Marshal(options)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "Could not start YouTube import.")
		return
	}
	user := identity.Current(r).User
	if err := h.queue.Precheck(r.Context(), user.ID, options, len(ids)); err != nil {
		status, message := selectionFailureStatus(err)
		writeError(w, status, message)
		return
	}
	videos, err := h.channel.LookupVideos(r.Context(), user.ID, ids)
	if errors.Is(err, youtubechannel.ErrNotConnected) {
		writeError(w, http.StatusConflict, "Connect your YouTube channel before choosing videos.")
		return
	}
	if errors.Is(err, youtubechannel.ErrNotConfigured) {
		writeError(w, http.StatusServiceUnavailable, "YouTube channel access is not available yet.")
		return
	}
	if err != nil {
		writeError(w, http.StatusBadGateway, "YouTube videos are temporarily unavailable. Try again.")
		return
	}
	picked, rejected := classifySelection(ids, videos)
	if len(rejected) > 0 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"error":     "Some selected videos are private or not on your connected channel. Choose public or unlisted videos from your channel.",
			"video_ids": rejected,
		})
		return
	}
	visibilities := make([]string, 0, 2)
	items := make([]selectedVideo, 0, len(picked))
	for position, video := range picked {
		if !containsString(visibilities, video.Visibility) {
			visibilities = append(visibilities, video.Visibility)
		}
		thumbnail := ""
		if video.ThumbnailURL != nil {
			thumbnail = *video.ThumbnailURL
		}
		items = append(items, selectedVideo{position: position, videoID: video.ID, title: video.Title, thumbnailURL: thumbnail, status: selectionWaiting})
	}
	resources, err := requestedResources(visibilities)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "Choose public or unlisted videos from your channel.")
		return
	}
	uiLocale := locale.Normalize(input.Locale)
	state, browser, verifier, err := newAuthorizationSecrets()
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "Could not start YouTube import.")
		return
	}
	target, err := h.client.AuthorizationURL(state, verifier, resources)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "Could not start YouTube import.")
		return
	}
	importID, err := data.NewUUID()
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "Could not start YouTube import.")
		return
	}
	selection := &selectionRequest{options: encodedOptions, videos: items}
	err = h.createAuthorizationWith(r.Context(), user.ID, user.SessionVersion, resources, state, browser, verifier, uiLocale, importID, selection)
	if errors.Is(err, errActiveImport) {
		writeError(w, http.StatusConflict, "A YouTube import is already in progress.")
		return
	}
	if errors.Is(err, errImportBudget) {
		writeError(w, http.StatusTooManyRequests, "The YouTube import limit was reached. Try later or remove videos from your library.")
		return
	}
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "Could not start YouTube import.")
		return
	}
	h.setBrowserCookie(w, browser, authorizationCookieSeconds)
	writeJSON(w, http.StatusOK, map[string]string{"import_id": importID, "url": target})
}

// authorizationCookieSeconds is how long the browser may take to finish Google consent.
const authorizationCookieSeconds = 600

func (h *Handler) setBrowserCookie(w http.ResponseWriter, browser string, maxAgeSeconds int) {
	http.SetCookie(w, &http.Cookie{Name: browserCookie, Value: browser, Path: callbackPath, HttpOnly: true, Secure: h.cfg.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: maxAgeSeconds})
}

// newAuthorizationSecrets returns the OAuth state, the browser binding and the PKCE verifier.
func newAuthorizationSecrets() (state, browser, verifier string, err error) {
	if state, err = randomSecret(); err != nil {
		return "", "", "", err
	}
	if browser, err = randomSecret(); err != nil {
		return "", "", "", err
	}
	if verifier, err = randomSecret(); err != nil {
		return "", "", "", err
	}
	return state, browser, verifier, nil
}

func containsString(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}

// loadSelectionPlan reads the chosen videos of an import with their current statuses.
func (h *Handler) loadSelectionPlan(ctx context.Context, work importWork) (*selectionPlan, error) {
	rows, err := h.db.QueryContext(ctx, `SELECT video_id,title,status,source_storage_key,COALESCE(job_id::text,''),error FROM youtube_import_selections WHERE import_id=$1 ORDER BY position`, work.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []*selectedVideo
	for rows.Next() {
		item := &selectedVideo{}
		if err = rows.Scan(&item.videoID, &item.title, &item.status, &item.sourceKey, &item.jobID, &item.errorText); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	return newSelectionPlan(items), nil
}

// insertSelection stores the chosen videos of a new selected import, in order.
func insertSelection(ctx context.Context, tx *sql.Tx, importID string, selection *selectionRequest) error {
	for _, video := range selection.videos {
		if _, err := tx.ExecContext(ctx, `INSERT INTO youtube_import_selections(import_id,position,video_id,title,thumbnail_url) VALUES($1,$2,$3,$4,$5)`, importID, video.position, video.videoID, video.title, video.thumbnailURL); err != nil {
			return err
		}
	}
	return nil
}

// rejectSelection marks a chosen video as failed, with a message the user can read.
func (h *Handler) rejectSelection(ctx context.Context, work importWork, item *selectedVideo, message string) error {
	if err := h.failSelection(ctx, work, item.videoID, message); err != nil {
		return err
	}
	item.status, item.errorText = selectionFailed, message
	return nil
}

// failSelection records a rejected selected video. Only waiting or importing
// items change, so a finished job is never overwritten.
func (h *Handler) failSelection(ctx context.Context, work importWork, videoID, message string) error {
	_, err := h.db.ExecContext(ctx, `UPDATE youtube_import_selections SET status='failed',error=$3,updated_at=now() WHERE import_id=$1 AND video_id=$2 AND status IN ('waiting','importing')`, work.ID, videoID, message)
	return err
}

// pendingSelection is a stored selected video whose clip job is not queued yet.
type pendingSelection struct {
	videoID   string
	sourceKey string
}

// pendingSelections lists the stored selected videos of an import that have no job.
func (h *Handler) pendingSelections(ctx context.Context, importID string) ([]pendingSelection, error) {
	rows, err := h.db.QueryContext(ctx, `SELECT video_id,source_storage_key FROM youtube_import_selections WHERE import_id=$1 AND status='importing' AND job_id IS NULL ORDER BY position`, importID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var queue []pendingSelection
	for rows.Next() {
		var item pendingSelection
		if err = rows.Scan(&item.videoID, &item.sourceKey); err != nil {
			return nil, err
		}
		queue = append(queue, item)
	}
	return queue, rows.Err()
}

// startSelectionJobs queues a clip job for every stored selected video that has
// none yet. Each queueing is its own transaction, so a retry never creates a
// second job for the same video.
func (h *Handler) startSelectionJobs(ctx context.Context, work importWork) error {
	queue, err := h.pendingSelections(ctx, work.ID)
	if err != nil || len(queue) == 0 {
		return err
	}
	options, err := h.selectionOptions(ctx, work.ID)
	if err != nil {
		return err
	}
	for _, item := range queue {
		if err = h.createSelectionJob(ctx, work, item.videoID, item.sourceKey, options); err != nil {
			return err
		}
	}
	return nil
}

// selectionOptions reads the clip options chosen with a selected import.
func (h *Handler) selectionOptions(ctx context.Context, importID string) (jobs.Options, error) {
	var raw []byte
	if err := h.db.QueryRowContext(ctx, `SELECT job_options FROM youtube_imports WHERE id=$1`, importID).Scan(&raw); err != nil {
		return jobs.Options{}, err
	}
	return jobs.DecodeOptions(raw)
}

// createSelectionJob queues one job for a stored video. The item row is locked and
// must still be importing without a job, so a repeated call changes nothing.
func (h *Handler) createSelectionJob(ctx context.Context, work importWork, videoID, sourceKey string, options jobs.Options) error {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = lockActiveUser(ctx, tx, work.UserID); err != nil {
		return err
	}
	var status string
	var jobID sql.NullString
	err = tx.QueryRowContext(ctx, `SELECT status,job_id FROM youtube_import_selections WHERE import_id=$1 AND video_id=$2 FOR UPDATE`, work.ID, videoID).Scan(&status, &jobID)
	if err != nil {
		return err
	}
	if status != selectionImporting || jobID.Valid {
		return nil
	}
	created, err := h.queue.CreateTx(ctx, tx, work.UserID, sourceKey, options)
	if err != nil {
		_ = tx.Rollback()
		if errors.Is(err, jobs.ErrCredits) || errors.Is(err, jobs.ErrInactive) || errors.Is(err, audiocleanup.ErrUnavailable) || errors.Is(err, jobs.ErrRemovedSource) {
			return h.failSelection(ctx, work, videoID, err.Error())
		}
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE youtube_import_selections SET status='processing',job_id=$3,error='',updated_at=now() WHERE import_id=$1 AND video_id=$2`, work.ID, videoID, created)
	if err != nil {
		return err
	}
	return tx.Commit()
}

// finishSelection runs once the archive has been read in full. It marks selected
// videos that were not in the export as missing, then queues any job still pending.
// The order keeps a queueing failure from leaving a waiting video unsettled.
func (h *Handler) finishSelection(ctx context.Context, work importWork) error {
	if _, err := h.db.ExecContext(ctx, `UPDATE youtube_import_selections SET status='missing',error=$2,updated_at=now() WHERE import_id=$1 AND status='waiting'`, work.ID, selectionNotFound); err != nil {
		return err
	}
	return h.startSelectionJobs(ctx, work)
}

// settleSelection gives every selected video of an ending import a final state,
// whatever the reason the import ended. A stored video without a clip job gets
// one queueing attempt; if that fails, the video fails with the reason. A video
// still waiting for its file failed because the archive was not read to the end
// (a fully read archive has already marked it missing). The lease is checked
// first, so a worker that lost the import changes nothing.
func (h *Handler) settleSelection(ctx context.Context, work importWork) error {
	if err := h.renewLease(ctx, work); err != nil {
		return err
	}
	queue, err := h.pendingSelections(ctx, work.ID)
	if err != nil {
		return err
	}
	if len(queue) > 0 {
		options, err := h.selectionOptions(ctx, work.ID)
		if err != nil {
			return err
		}
		for _, item := range queue {
			if err := h.createSelectionJob(ctx, work, item.videoID, item.sourceKey, options); err != nil {
				_, message := selectionFailureStatus(err)
				if failErr := h.failSelection(ctx, work, item.videoID, message); failErr != nil {
					return failErr
				}
			}
		}
	}
	_, err = h.db.ExecContext(ctx, `UPDATE youtube_import_selections SET status='failed',error=$2,updated_at=now() WHERE import_id=$1 AND status='waiting'`, work.ID, selectionUnfinished)
	return err
}

// attachSelections fills the selection of each import that has chosen videos.
func (h *Handler) attachSelections(ctx context.Context, user string, imports []Import) error {
	rows, err := h.db.QueryContext(ctx, `SELECT s.import_id,s.video_id,s.title,s.thumbnail_url,s.status,s.job_id,s.error FROM youtube_import_selections s JOIN youtube_imports i ON i.id=s.import_id WHERE i.user_id=$1 ORDER BY s.import_id,s.position`, user)
	if err != nil {
		return err
	}
	defer rows.Close()
	index := make(map[string]int, len(imports))
	for i := range imports {
		index[imports[i].ID] = i
	}
	for rows.Next() {
		var importID string
		var item SelectionItem
		var jobID sql.NullString
		if err = rows.Scan(&importID, &item.VideoID, &item.Title, &item.ThumbnailURL, &item.Status, &jobID, &item.Error); err != nil {
			return err
		}
		if jobID.Valid {
			item.JobID = &jobID.String
		}
		i, ok := index[importID]
		if !ok {
			continue
		}
		if imports[i].Selection == nil {
			imports[i].Selection = &SelectionOverview{Items: []SelectionItem{}}
		}
		imports[i].Selection.Items = append(imports[i].Selection.Items, item)
	}
	return rows.Err()
}
