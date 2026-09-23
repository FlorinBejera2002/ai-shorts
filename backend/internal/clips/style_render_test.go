package clips

import (
	"context"
	"encoding/json"
	"log/slog"
	"os/exec"
	"path/filepath"
	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/processing"
	"sneepcut/backend-go/internal/testdb"
	"sneepcut/backend-go/internal/worker"
	"testing"
)

func TestAgentStyleRendersPhysicalVideoAndCaptions(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("requires FFmpeg")
	}
	if _, err := exec.LookPath("ffprobe"); err != nil {
		t.Skip("requires FFprobe")
	}
	db := testdb.Open(t)
	user, job, id := seedClip(t, db)
	ctx := context.Background()
	dir := t.TempDir()
	storage, err := media.NewLocalStorage(filepath.Join(dir, "media"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = storage.Close() })
	source := filepath.Join(dir, "source.mp4")
	if out, err := exec.CommandContext(ctx, "ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=green:s=320x180:r=24", "-f", "lavfi", "-i", "sine=frequency=440", "-t", "2", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", source).CombinedOutput(); err != nil {
		t.Fatalf("fixture %v: %s", err, out)
	}
	if err = storage.Save(ctx, source, "sources/"+job+"/source.mp4", "video/mp4"); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`UPDATE clips SET duration=2,end_time=2,contains_platform_badge=false WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`UPDATE jobs SET transcript_segments='[{"s":0,"e":1.8,"text":"Synthetic caption"}]' WHERE id=$1`, job); err != nil {
		t.Fatal(err)
	}
	h := New(db, nil, media.NewService(media.Config{}, db, storage, nil, nil), Config{})
	read, err := h.AgentRead(ctx, user, id)
	if err != nil {
		t.Fatal(err)
	}
	task, err := h.AgentEdit(ctx, user, newID(), id, read.ExpectedState, "style", json.RawMessage(`{"aspect_ratio":"1:1","subtitle_style":"bold","burn_subtitles":true}`))
	if err != nil {
		t.Fatal(err)
	}
	cfg, _ := processing.ConfigFromEnv(func(string) string { return "" })
	w := &worker.Worker{Repo: worker.NewRepository(db), Pipeline: processing.New(cfg, storage, nil), Storage: storage, Logger: slog.Default()}
	if worked, err := w.Once(ctx); err != nil || !worked {
		t.Fatalf("render %v %v", worked, err)
	}
	result, err := h.AgentPoll(ctx, user, id, task)
	if err != nil || result.Clip == nil || !result.Clip.HasSubtitles {
		t.Fatalf("output %+v %v", result, err)
	}
	var resolution, key string
	if err = db.QueryRow(`SELECT resolution,file_storage_key FROM clips WHERE id=$1`, id).Scan(&resolution, &key); err != nil || resolution != "1080x1080" {
		t.Fatalf("resolution %s %v", resolution, err)
	}
	if _, err = h.AgentExport(ctx, user, id, result.Clip.ExpectedState); err != nil {
		t.Fatal(err)
	}
	if err = storage.Delete(ctx, key); err != nil {
		t.Fatal(err)
	}
	if _, err = h.AgentPoll(ctx, user, id, task); err == nil {
		t.Fatal("reported success after physical media removal")
	}
}
