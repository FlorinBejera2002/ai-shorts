package processing

import (
 "context"
 "fmt"
 "os/exec"
 "path/filepath"
 "testing"

 "sneepcut/backend-go/internal/media"
)

func TestRenderBadgeProvenanceAndBrandHook(t *testing.T) {
 if _, err := exec.LookPath("ffmpeg"); err != nil { t.Skip("requires FFmpeg") }
 if _, err := exec.LookPath("ffprobe"); err != nil { t.Skip("requires FFprobe") }
 dir := t.TempDir()
 storage, err := media.NewLocalStorage(filepath.Join(dir,"media"))
 if err != nil { t.Fatal(err) }
 cfg, _ := ConfigFromEnv(func(string) string { return "" })
 processor := New(cfg,storage,nil)
 ctx := context.Background()
 source := filepath.Join(dir,"source.mp4")
 if err := processor.ffmpeg(ctx,dir,"-f","lavfi","-i","color=c=blue:s=320x180:r=24","-f","lavfi","-i","sine=frequency=440","-t","1","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac",source); err != nil { t.Fatal(err) }
 if err := storage.Save(ctx,source,"sources/fixture.mp4","video/mp4"); err != nil { t.Fatal(err) }
 for _, branded := range []bool{false,true} {
  brand := map[string]any{"apply_brand":branded,"apply_brand_colors":true,"primary_color":"#000000","secondary_color":"#ffffff"}
  clip, err := processor.Render(ctx,RenderInput{SourceKey:"sources/fixture.mp4",Namespace:fmt.Sprintf("render-fixture-%v",branded),AspectRatio:"16:9",Segments:[]Segment{{0,1}},Brand:brand,HookText:"Synthetic hook"})
  if err != nil { t.Fatalf("branded=%v: %v",branded,err) }
  if !clip.ContainsPlatformBadge || clip.TikTokStorageKey=="" || clip.StorageKey==clip.TikTokStorageKey { t.Fatalf("badge and TikTok variant mismatch: %#v",clip) }
  for _, key := range []string{clip.StorageKey,clip.TikTokStorageKey} {
   exists,err := storage.Exists(ctx,key)
   if err!=nil || !exists {t.Fatalf("missing output %s: %v",key,err)}
  }
 }
}
