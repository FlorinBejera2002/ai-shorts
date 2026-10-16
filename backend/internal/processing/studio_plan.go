package processing

import (
	"context"
	"encoding/json"
	"errors"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"math"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"sneepcut/backend-go/internal/captions"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/media"
	"sneepcut/backend-go/internal/studiocomposition"
)

type studioAsset struct {
	Key        string  `json:"-"`
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Kind       string  `json:"kind"`
	URL        string  `json:"url"`
	PreviewURL string  `json:"preview_url,omitempty"`
	Duration   float64 `json:"duration,omitempty"`
	Width      int     `json:"width,omitempty"`
	Height     int     `json:"height,omitempty"`
	HasAudio   bool    `json:"has_audio,omitempty"`
}
type studioCrop struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}
type studioCropFrame struct {
	Time float64 `json:"time"`
	studioCrop
}
type studioPoint struct {
	Time  float64 `json:"time"`
	Value float64 `json:"value"`
}
type studioScene struct {
	ID            string            `json:"id"`
	AssetID       string            `json:"asset_id"`
	Role          string            `json:"role,omitempty"`
	ParentSceneID string            `json:"parent_scene_id,omitempty"`
	Start         float64           `json:"start"`
	Duration      float64           `json:"duration"`
	SourceIn      float64           `json:"source_in"`
	Fit           string            `json:"fit,omitempty"`
	Crop          *studioCrop       `json:"crop,omitempty"`
	CropKeyframes []studioCropFrame `json:"crop_keyframes,omitempty"`
	FadeIn        float64           `json:"fade_in,omitempty"`
	FadeOut       float64           `json:"fade_out,omitempty"`
	TransitionIn  float64           `json:"transition_in,omitempty"`
}
type studioAudio struct {
	ID       string        `json:"id"`
	AssetID  string        `json:"asset_id"`
	Start    float64       `json:"start"`
	Duration float64       `json:"duration"`
	SourceIn float64       `json:"source_in"`
	Volume   float64       `json:"volume"`
	SceneID  string        `json:"scene_id,omitempty"`
	Envelope []studioPoint `json:"envelope,omitempty"`
}
type studioCaption struct {
	FontSizePX  float64        `json:"font_size_px,omitempty"`
	Groups      [][]Word       `json:"groups"`
	Style       captions.Style `json:"style"`
	FontAssetID string         `json:"font_asset_id,omitempty"`
}
type studioOverlay struct {
	ID         string  `json:"id"`
	AssetID    string  `json:"asset_id,omitempty"`
	Text       string  `json:"text,omitempty"`
	Start      float64 `json:"start"`
	Duration   float64 `json:"duration"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	Width      float64 `json:"width"`
	Height     float64 `json:"height"`
	Opacity    float64 `json:"opacity"`
	FontSize   float64 `json:"font_size,omitempty"`
	Color      string  `json:"color,omitempty"`
	Background string  `json:"background,omitempty"`
	Align      string  `json:"align,omitempty"`
}
type studioPlan struct {
	SchemaVersion int             `json:"schema_version"`
	Title         string          `json:"title"`
	Width         int             `json:"width"`
	Height        int             `json:"height"`
	Duration      float64         `json:"duration"`
	DynamicRange  string          `json:"dynamic_range"`
	Assets        []studioAsset   `json:"assets"`
	Scenes        []studioScene   `json:"scenes"`
	Audio         []studioAudio   `json:"audio"`
	Captions      *studioCaption  `json:"captions,omitempty"`
	Overlays      []studioOverlay `json:"overlays,omitempty"`
}

func (p *Processor) studioClient(user string) (*studiocomposition.Client, error) {
	if !data.ValidUUID(user) {
		return nil, errors.New("Studio rendering requires the verified clip owner")
	}
	c, err := studiocomposition.New(p.cfg.StudioURL, p.cfg.StudioSecret)
	if err != nil {
		return nil, err
	}
	if c == nil {
		return nil, errors.New("Studio rendering is unavailable; configure STUDIO_AGENT_URL and STUDIO_AGENT_SECRET")
	}
	return c, nil
}

func (p *Processor) CommitStudio(ctx context.Context, user, artifact string) error {
	client, err := p.studioClient(user)
	if err != nil {
		return err
	}
	return client.Commit(ctx, user, artifact)
}

func studioLineage(input map[string]any, user, namespace, project, base string) {
	if base != "" {
		input["base_artifact_id"] = base
		return
	}
	if project == "" {
		project = studiocomposition.Identity(user, "project/"+namespace, nil)
	}
	input["project_id"] = project
}

func (p *Processor) studioURL(ctx context.Context, key string) (string, error) {
	if p.cfg.MediaSigningSecret == "" {
		return "", errors.New("Studio media signing is unavailable")
	}
	s := media.NewService(media.Config{AppURL: p.cfg.MediaOrigin, SigningSecret: p.cfg.MediaSigningSecret}, nil, p.storage, nil, nil)
	u, err := s.SignedURL(ctx, key)
	if err != nil {
		return "", err
	}
	// The Studio downloader resolves signed relative references through its
	// configured media origin; the model cannot supply a destination host.
	parsed, err := url.Parse(u)
	if err != nil {
		return "", err
	}
	if strings.HasPrefix(parsed.Path, "/media/") {
		return parsed.RequestURI(), nil
	}
	return u, nil
}

func (p *Processor) studioAsset(ctx context.Context, plan *studioPlan, key, kind string) (string, error) {
	id := "asset-" + storyDigest(key)[:20]
	for i := range plan.Assets {
		a := &plan.Assets[i]
		if a.ID == id {
			// Independent speech can reference a video before its first visual
			// appearance. Keep one durable asset and promote its capabilities.
			if kind == "video" && a.Kind == "audio" {
				a.Kind = "video"
			}
			return id, nil
		}
	}
	u, err := p.studioURL(ctx, key)
	if err != nil {
		return "", err
	}
	plan.Assets = append(plan.Assets, studioAsset{Key: key, ID: id, Name: filepath.Base(key), Kind: kind, URL: u})
	return id, nil
}

func studioAudioMetadata(plan *studioPlan, id string, duration float64) {
	for i := range plan.Assets {
		if plan.Assets[i].ID == id {
			plan.Assets[i].Duration = duration
			plan.Assets[i].HasAudio = true
			return
		}
	}
}

func (p *Processor) studioCaptions(ctx context.Context, dir, user, namespace string, plan *studioPlan, groups [][]Word, style captions.Style) error {
	if len(groups) == 0 {
		return nil
	}
	if err := style.Validate(); err != nil {
		return err
	}
	key, err := captions.PrivateKey(user, style.FontID)
	if captions.IsBuiltin(style.FontID) {
		var raw []byte
		raw, err = captions.FontBytes(style.FontID, style.Weight)
		if err == nil {
			key = "work/" + strings.Split(namespace, "/")[0] + "/studio-fonts/" + storyDigest([]any{style.FontID, style.Weight}) + ".ttf"
			file := filepath.Join(dir, "font-"+storyDigest(key)[:12]+".ttf")
			err = os.WriteFile(file, raw, 0600)
			if err == nil {
				err = p.storySave(ctx, file, key, "font/ttf")
			}
		}
	}
	if err != nil {
		return errors.New("Selected caption font is unavailable")
	}
	id, err := p.studioAsset(ctx, plan, key, "font")
	if err != nil {
		return err
	}
	plan.Captions = &studioCaption{Groups: groups, Style: style, FontAssetID: id}
	return nil
}

func studioPlanIdentity(user, namespace string, plan studioPlan) string {
	plan.Assets = append([]studioAsset(nil), plan.Assets...)
	for i := range plan.Assets {
		a := &plan.Assets[i]
		a.URL = strings.Split(a.URL, "?")[0]
		a.PreviewURL = strings.Split(a.PreviewURL, "?")[0]
	}
	return studiocomposition.Identity(user, namespace, plan)
}

// Download and probe the actual editor output before publishing any artifact ID.
func (p *Processor) saveStudioOutput(ctx context.Context, dir, user, id, prefix string, c *studiocomposition.Client, result studiocomposition.Result, hdr bool) (file string, info probeInfo, size int64, previewKey, thumbnailKey string, err error) {
	file = filepath.Join(dir, "studio-output-"+id+".mp4")
	if err = c.Download(ctx, user, id, "video", file); err != nil {
		return
	}
	info, err = p.probe(ctx, file)
	if err != nil {
		return
	}
	if math.Abs(info.Duration-result.Duration) > .12 || info.Width != result.Width || info.Height != result.Height {
		err = errors.New("Studio output does not match its saved composition")
		return
	}
	var stat os.FileInfo
	stat, err = os.Stat(file)
	if err != nil {
		return
	}
	size = stat.Size()
	if size != result.Size {
		err = errors.New("Studio output size changed during download")
		return
	}
	if err = p.storySave(ctx, file, prefix+"/clip.mp4", "video/mp4"); err != nil {
		return
	}
	thumbnailSource := file
	if hdr {
		if !result.PreviewAvailable {
			err = errors.New("Studio HDR browser preview is unavailable")
			return
		}
		preview := filepath.Join(dir, "studio-preview-"+id+".mp4")
		if err = c.Download(ctx, user, id, "preview", preview); err != nil {
			return
		}
		var pi probeInfo
		pi, err = p.probe(ctx, preview)
		if err != nil {
			return
		}
		if math.Abs(pi.Duration-info.Duration) > .12 {
			err = errors.New("Studio preview does not match the composition duration")
			return
		}
		previewKey = prefix + "/preview.mp4"
		if err = p.storySave(ctx, preview, previewKey, "video/mp4"); err != nil {
			return
		}
		thumbnailSource = preview
	}
	thumb := filepath.Join(dir, "studio-thumbnail-"+id+".jpg")
	if p.ffmpeg(ctx, dir, "-i", thumbnailSource, "-ss", seconds(min(.25, info.Duration/2)), "-frames:v", "1", "-vf", "scale=320:-2", "-q:v", "2", thumb) == nil {
		thumbnailKey = prefix + "/thumbnail.jpg"
		err = p.storySave(ctx, thumb, thumbnailKey, "image/jpeg")
	}
	return
}

func (p *Processor) studioLogo(ctx context.Context, dir string, plan *studioPlan, key string, brand map[string]any) error {
	user := brandString(brand, "user_id")
	if user == "" || !strings.HasPrefix(key, "brand/"+user+"/") || strings.Contains(key, "..") {
		return errors.New("logo must belong to the clip owner")
	}
	id, err := p.studioAsset(ctx, plan, key, "image")
	if err != nil {
		return err
	}
	file, err := p.storyMaterialize(ctx, dir, key)
	if err != nil {
		return err
	}
	reader, err := os.Open(file)
	if err != nil {
		return err
	}
	geometry, _, decodeErr := image.DecodeConfig(reader)
	_ = reader.Close()
	if decodeErr != nil || geometry.Width <= 0 || geometry.Height <= 0 {
		return errors.New("Selected logo is not a readable image")
	}
	size, margin, opacity := .18, .025, .8
	if n, ok := brand["watermark_size"].(float64); ok && n > 0 && n <= .5 {
		size = n
	}
	if n, ok := brand["watermark_margin"].(float64); ok && n >= 0 && n <= .2 {
		margin = n
	}
	if n, ok := brand["watermark_opacity"].(float64); ok && n >= 0 && n <= 1 {
		opacity = n
	}
	w, h := float64(plan.Width)*size, float64(plan.Height)*size
	scale := min(w/float64(geometry.Width), h/float64(geometry.Height))
	w, h = float64(geometry.Width)*scale, float64(geometry.Height)*scale
	m := float64(min(plan.Width, plan.Height)) * margin
	x, y := studioLogoOrigin(float64(plan.Width), float64(plan.Height), w, h, m, brand)
	plan.Overlays = append(plan.Overlays, studioOverlay{ID: "brand-logo", AssetID: id, Duration: plan.Duration, X: x, Y: y, Width: w, Height: h, Opacity: opacity})
	return nil
}

func studioLogoOrigin(width, height, logoWidth, logoHeight, margin float64, brand map[string]any) (float64, float64) {
	xCenter, hasX := brand["watermark_x"].(float64)
	yCenter, hasY := brand["watermark_y"].(float64)
	if hasX && hasY && !math.IsNaN(xCenter) && !math.IsNaN(yCenter) &&
		xCenter >= 0 && xCenter <= 1 && yCenter >= 0 && yCenter <= 1 {
		return max(0, min(width-logoWidth, width*xCenter-logoWidth/2)),
			max(0, min(height-logoHeight, height*yCenter-logoHeight/2))
	}
	x, y := margin, margin
	position := brandString(brand, "watermark_position")
	if position == "" {
		position = "bottom-right"
	}
	if strings.HasSuffix(position, "right") {
		x = width - logoWidth - margin
	}
	if strings.HasPrefix(position, "bottom") {
		y = height - logoHeight - margin
	}
	return x, y
}

func studioRound(value float64) float64 { return math.Round(value*1000000) / 1000000 }

func studioNeedsPreview(video, audio, transfer string, hasAudio bool) bool {
	return transfer == "smpte2084" || transfer == "arib-std-b67" || (video != "" && video != "h264") || (hasAudio && audio != "" && audio != "aac")
}

func studioUniquePoints(points []studioPoint) []studioPoint {
	var result []studioPoint
	for _, point := range points {
		if len(result) > 0 && math.Abs(point.Time-result[len(result)-1].Time) < .000001 {
			result[len(result)-1] = point
		} else {
			result = append(result, point)
		}
	}
	return result
}

// Convert plain legacy subtitle settings to the shared editor style. Proprietary
// unbundled fonts fail explicitly rather than silently changing typography.
func studioLegacyStyle(brand map[string]any, preset string) captions.Style {
	s := captions.Legacy(brand)
	switch preset {
	case "bold":
		s.Preset = "bold-outline"
		s.Size = .061
		s.Outline = 4
	case "caption-box":
		s.Preset = "contrast-box"
		s.BackgroundOpacity = .75
	}
	return s
}

func studioClonePlan(plan studioPlan) studioPlan {
	raw, _ := json.Marshal(plan)
	var next studioPlan
	_ = json.Unmarshal(raw, &next)
	return next
}
